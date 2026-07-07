# PRD: Trae API Studio Web Portal v2

> Source: User request 2026-07-07 — "web portal 功能更强大，可配置各种参数，直接跟模型对话，像豆包 web 端那样开不同 session 对话"
> Status: Draft for review
> Owner: trae-local-api

---

## 1. Executive Summary

### Problem Statement
The current `web/index.html` (1304-line single file) exposes chat with Trae models but treats configuration as global, persists sessions only to `localStorage` (~5MB cap, lost on browser clear), renders assistant output as plain text, and lacks basic Doubao-web-grade session management (rename/pin/search) and message operations (edit/regenerate). Users cannot tune sampling parameters per conversation.

### Proposed Solution
Upgrade the portal to a Doubao-web-class chat surface: per-session config with full OpenAI-standard sampling parameters, server-side SQLite persistence as source of truth, Markdown + code highlight + KaTeX rendering, message edit & regenerate, and complete session CRUD with rename/pin/search. Frontend stays vanilla JS + ES modules (no build toolchain). Server-side routes built TDD-first.

### Success Criteria
1. **Per-session config isolation**: changing `temperature` / `model` / `system_prompt` in session A does not affect session B — verified by integration test. [COMPUTED]
2. **Persistence durability**: kill browser process, reopen portal — all sessions, messages, and per-session configs restored from server SQLite. [COMMON]
3. **Sampling parameter pass-through**: all 8 OpenAI-standard params (`temperature, top_p, max_tokens, presence_penalty, frequency_penalty, stop, seed, n`) accepted by UI, transmitted in request body, and forwarded to `trae-client.js` (Trae-side no-ops tolerated, but UI must not drop them). [INFERRED]
4. **Render fidelity**: a message containing a fenced ```js block, a `$E=mc^2$` inline math, and a Markdown table renders all three correctly in < 200ms after first paint. [COMPUTED]
5. **Session operation latency**: rename / pin / search across 100 stored sessions returns within 150ms (SQLite-indexed). [COMPUTED]
6. **TDD coverage**: server-side route handlers (`/v1/sessions*`, `/v1/config/schema`, regenerate) have red-green-refactor tests written before implementation; ≥ 85% line coverage on `src/sessions.js` and `src/config-schema.js`. [COMMON]

---

## 2. User Experience & Functionality

### User Personas
- **P1 — Power API user**: runs `trae-local-api` locally, wants to A/B test models/parameters against Trae backend before wiring external clients. Needs full sampling control and reproducible sessions.
- **P2 — Casual experimenter**: opens portal to poke at Trae models, wants Markdown rendering and easy session switching. Does not care about most params but expects sane defaults.

### User Stories

#### Epic A: Per-session configuration
1. As P1, I want each session to remember its own `model`, `temperature`, `top_p`, `max_tokens`, `presence_penalty`, `frequency_penalty`, `stop`, `seed`, `system_prompt`, `function`, `max_tool_rounds`, `auto_continue`, so that I can run different parameter sets in parallel sessions without re-configuring.
2. As P1, I want a "Global Defaults" template that new sessions inherit on creation, so I don't re-enter my preferred `temperature=0.7` each time.
3. As P1, I want the config panel to show only relevant fields (hide `max_tool_rounds` when `function=default`), so the UI stays clean.
4. As P2, I want sampling parameters collapsed under an "Advanced" section by default, so I'm not overwhelmed.
5. As P1, I want to see the effective request body (JSON preview) before sending, so I can verify params are passed correctly.

#### Epic B: Server-side persistence
6. As P1, I want my sessions stored on the server (not just browser localStorage), so that clearing browser data or switching browsers preserves them.
7. As P1, I want messages persisted incrementally (one row per message), so that a crash mid-stream does not corrupt the whole session.
8. As P1, I want to delete a session and have it removed from server + all clients on next sync, so cleanup is consistent.
9. As P1, I want a session export to a single JSON file (messages + config), so I can archive or share it.

#### Epic C: Markdown / code / math rendering
10. As P2, I want assistant messages rendered as Markdown (headers, lists, bold/italic, links, tables, blockquotes), so responses are readable.
11. As P1, I want fenced code blocks syntax-highlighted by language with a "Copy" button, so I can grab code quickly.
12. As P1, I want inline `$...$` and block `$$...$$` math rendered via KaTeX, so mathematical responses display correctly.
13. As P2, I want my own user messages rendered as Markdown too (so my Markdown-formatted input shows correctly), but with no syntax highlight.

#### Epic D: Message edit & regenerate
14. As P1, I want to edit any of my prior user messages in place, so I can fix a typo without re-typing the whole prompt.
15. As P1, I want editing a user message to truncate the conversation at that point and re-send, so the assistant responds to the corrected context.
16. As P1, I want a "Regenerate" button on the last assistant message, so I can retry without editing.
17. As P1, I want a "Stop" button visible during streaming, so I can halt a runaway response (already exists — preserve).
18. As P1, I want a token usage badge on each assistant message (`in: 1234 / out: 567`), so I can see cost per turn.

#### Epic E: Session management
19. As P2, I want to rename a session by double-clicking its sidebar entry, so I can give it a meaningful title.
20. As P1, I want to pin important sessions to the top of the sidebar, so I don't lose them in a long list.
21. As P1, I want a search box that filters sessions by name (and optionally message content), so I can find old conversations.
22. As P2, I want sessions sorted by `updated_at DESC` with pinned ones on top, so the recent and important ones are visible.
23. As P1, I want to delete a session with a confirm dialog, so I don't lose work by misclick.

#### Epic F: Configuration schema discovery
24. As P1 (and for future automation), I want `GET /v1/config/schema` to return a machine-readable JSON schema of all configurable params (name, type, default, min, max, enum, group), so the UI can render dynamically and external scripts can introspect.

### Acceptance Criteria (per epic, "Done" definition)

**Epic A — Per-session config**
- [ ] Each session row in SQLite stores `config_json` independently.
- [ ] UI config panel reads/writes the active session's config, not a global.
- [ ] Switching sessions visibly swaps the config panel values.
- [ ] "Reset to defaults" button restores global default template.

**Epic B — Persistence**
- [ ] `sessions` and `messages` tables created on first server start.
- [ ] Every chat request persists `user` and `assistant` messages within 100ms of completion.
- [ ] Streaming responses persist incrementally (assistant message row updated as chunks arrive OR persisted once on completion — TBD by perf test).
- [ ] Delete session removes from DB + next GET /v1/sessions reflects deletion.

**Epic C — Rendering**
- [ ] Markdown rendered via `marked` (CDN, pinned version).
- [ ] Code highlighted via `highlight.js` (CDN, pinned version) with copy button on each fenced block.
- [ ] Math rendered via `KaTeX` (CDN, pinned version) auto-render extension.
- [ ] XSS protection: HTML sanitized via `DOMPurify` before injection.
- [ ] First-contentful render of a 10KB Markdown message < 200ms.

**Epic D — Edit & regenerate**
- [ ] Edit user message: click → inline editable → save → truncates downstream messages → re-sends.
- [ ] Regenerate: button on last assistant message → deletes last assistant message → re-sends last user message.
- [ ] Token badge shows `usage.prompt_tokens` / `usage.completion_tokens` from API response.

**Epic E — Session CRUD**
- [ ] Create: `+ New` button → empty session → opens with default config.
- [ ] Rename: double-click name → inline edit → Enter to save.
- [ ] Pin: right-click or hover menu → toggles `pinned` flag → re-sorts sidebar.
- [ ] Search: input filters sidebar by `name LIKE '%query%'` (case-insensitive); message-content search is Phase 2.
- [ ] Delete: trash icon → confirm modal → DELETE /v1/sessions/:id.
- [ ] Sort: `pinned DESC, updated_at DESC`.

**Epic F — Config schema**
- [ ] `GET /v1/config/schema` returns JSON with `params: [{key, type, default, min, max, enum, group, advanced}]`.
- [ ] Schema covers all 13 params listed in Epic A story 1.
- [ ] UI renders config panel dynamically from schema (no hardcoded fields).

### Non-Goals
- **NG1**: No build toolchain (no Vite/Webpack/esbuild). Vanilla JS + native ES modules only.
- **NG2**: No frontend framework (no React/Vue/Svelte).
- **NG3**: No frontend unit/DOM testing. Playwright E2E smoke test only.
- **NG4**: No multimodal/file upload. Deferred to v3.
- **NG5**: No conversation branching (tree structure). Edit truncates; no alternate-branch preservation.
- **NG6**: No multi-tab/split-view. Single active session.
- **NG7**: No prompt template library. Deferred to v2.1.
- **NG8**: No cost estimation. Token counts only.
- **NG9**: No auth/login UI. Reuse existing `API_KEY` middleware on `/v1/*`; portal page itself stays open.
- **NG10**: No mobile-responsive redesign. Desktop-first; existing layout preserved.
- **NG11**: No SSR / no server-rendered HTML. Static `index.html` + dynamic JS.

---

## 3. AI System Requirements

### Tool Requirements
- **Trae backend** (existing): `/api/agent/v3/llm_utils_chat` primary, `/api/ide/v1/chat` fallback. No new Trae endpoints required.
- **OpenAI-compatible surface** (existing): `POST /v1/chat/completions` — must accept and forward all 8 sampling params; `trae-client.js` already passes unknown params through to Trae (verify in implementation).
- **New server endpoints** (this PRD): see §4 Integration Points.
- **CDN libraries** (pinned versions):
  - `marked@^15` — Markdown parsing
  - `highlight.js@^11` — code syntax highlighting
  - `katex@^0.16` + `katex/dist/contrib/auto-render.min.js` — math
  - `dompurify@^3` — XSS sanitization
  - All loaded via `<script>` tags from `cdn.jsdelivr.net` with SRI hashes; fallback to `unpkg.com` if blocked.

### Evaluation Strategy
- **Sampling param pass-through**: integration test sends request with `temperature=0.1, top_p=0.8, max_tokens=100, stop=["END"], seed=42`; assert request body forwarded to `trae-client.js` contains identical values. Trae-side honoring is out of scope (we cannot control Trae backend).
- **Markdown render correctness**: Playwright assertion — render a fixture Markdown string, assert DOM contains `<pre><code class="language-js">`, `<span class="katex">`, `<table>`.
- **Persistence durability**: integration test — create session, send 5 messages, restart Express server, GET session → assert all 5 messages present.
- **TDD discipline**: every server route has a failing test committed before implementation (verified via git history on the branch).

---

## 4. Technical Specifications

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│ Browser (single page, vanilla JS ES modules)                │
│  web/index.html                                             │
│   ├── web/app/state.js        — session/cache state         │
│   ├── web/app/api.js          — fetch wrapper for /v1/*     │
│   ├── web/app/render.js       — marked + highlight + katex  │
│   ├── web/app/session-list.js — sidebar CRUD UI             │
│   ├── web/app/chat-view.js    — message list + input        │
│   └── web/app/config-panel.js — dynamic schema-driven UI    │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTPS (same origin)
┌──────────────────────▼──────────────────────────────────────┐
│ Express server (src/server.js — extended)                   │
│  Existing routes (unchanged):                               │
│   GET  /                  → serve index.html                │
│   GET  /v1/models         → OpenAI model list               │
│   POST /v1/chat/completions → streaming chat                │
│   POST /v1/messages       → Anthropic messages              │
│   GET  /v1/dashboard/*    → monitoring                      │
│  New routes (this PRD):                                     │
│   GET    /v1/sessions         → list                        │
│   POST   /v1/sessions         → create                      │
│   GET    /v1/sessions/:id     → read (with messages)        │
│   PUT    /v1/sessions/:id     → update (name/pin/config)    │
│   DELETE /v1/sessions/:id     → delete                       │
│   POST   /v1/sessions/:id/messages       → append message   │
│   POST   /v1/sessions/:id/regenerate     → regen last       │
│   GET    /v1/config/schema    → param schema JSON           │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│ src/sessions.js (new) — session/message repository          │
│   better-sqlite3, DB file: ${WORKSPACE_DIR}/.trae-api/      │
│   sessions.db (configurable via SESSIONS_DB_PATH env)       │
│  Tables:                                                    │
│   sessions(id TEXT PK, name TEXT, pinned INT,               │
│            config_json TEXT, created_at INT, updated_at INT)│
│   messages(id TEXT PK, session_id TEXT, role TEXT,          │
│            content TEXT, tokens_in INT, tokens_out INT,     │
│            created_at INT,                                   │
│            FOREIGN KEY(session_id) REFERENCES sessions(id)) │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│ src/trae-client.js (existing, lightly extended)             │
│  Forward sampling params in request body to Trae backend    │
└─────────────────────────────────────────────────────────────┘
```

### Integration Points
- **DB**: `better-sqlite3` synchronous, file-based. DB path env `SESSIONS_DB_PATH` (default `${WORKSPACE_DIR}/.trae-api/sessions.db`). Auto-create directory + tables on first access. WAL mode enabled for concurrent read/write.
- **Existing `/v1/chat/completions`**: when request includes `X-Session-Id` header, the route will persist `user` and `assistant` messages to the sessions DB after stream completion. No header = current behavior (no persistence).
- **`trae-client.js`**: extend to accept and forward `temperature, top_p, max_tokens, presence_penalty, frequency_penalty, stop, seed, n` in the Trae request body. Trae may ignore them — that's acceptable.
- **Auth**: existing `API_KEY` middleware applies to all `/v1/sessions*` and `/v1/config/schema` routes. Portal page (`GET /`) stays unauthenticated (current behavior).
- **CORS**: existing `cors()` middleware covers new routes.

### Security & Privacy
- **XSS**: all Markdown-rendered HTML sanitized via `DOMPurify` before `innerHTML` assignment. `marked` configured with `mangle:false, headerIds:false` (defaults off in v15+).
- **SQL injection**: `better-sqlite3` uses prepared statements with bound parameters — no string concatenation in queries.
- **Path traversal**: `SESSIONS_DB_PATH` resolved via `path.resolve()` and validated to be inside `WORKSPACE_DIR` (reject `..` traversal).
- **API key exposure**: portal page does not embed API key in HTML; key is read from `localStorage` and sent as `Authorization: Bearer` header per request.
- **Local-only**: by default server binds `127.0.0.1` only (existing behavior). No remote exposure.
- **No PII collection**: sessions DB stores only what user types; no telemetry.

---

## 5. Risks & Roadmap

### Phased Rollout

**MVP (v2.0)** — what this PRD covers:
- Epic B: SQLite persistence (foundational — other epics depend on it)
- Epic F: config schema endpoint
- Epic A: per-session config UI
- Epic C: Markdown/highlight/KaTeX
- Epic D: edit & regenerate
- Epic E: session rename/pin/search/delete

**v2.1** (next):
- Prompt template library (`/v1/prompts` CRUD)
- Session export to Markdown (currently JSON only)
- Message-content search (currently name-only)

**v3.0** (future):
- Multimodal file/image upload (pending Trae backend capability verification)
- Conversation branching (tree structure)
- Multi-tab split view
- Cost estimation (pricing table maintenance burden — defer)

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Trae backend silently ignores sampling params (`temperature` etc.) — UI shows them but they have no effect | HIGH [INFERRED] | LOW | Document in UI tooltip: "Trae may not honor this parameter." Pass-through still verified. |
| `better-sqlite3` native binary fails to install on user's Node version | LOW [KNOWN] (prebuilt binaries for Node 18-24 exist) | HIGH | `package.json` pins `better-sqlite3@^11`; fallback path: if `require('better-sqlite3')` throws, log clear error and degrade to localStorage-only mode with warning toast. |
| Streaming response + DB write blocks event loop | MEDIUM [INFERRED] | MEDIUM | `better-sqlite3` is synchronous but fast (<1ms per write for WAL mode). Batch persistence: write assistant message once on stream completion, not per chunk. |
| CDN blocked (GFW) | MEDIUM [KNOWN] | MEDIUM | Local fallback: vendor `marked/highlight.js/katex/dompurify` into `web/vendor/` as fallback; primary path stays CDN. |
| Existing 1300-line `index.html` refactor introduces regressions | MEDIUM [INFERRED] | HIGH | Phase migration: keep `index.html` as entry point, incrementally extract modules. Playwright smoke test on existing flows before each extraction. |
| `X-Session-Id` header coupling between portal and `/v1/chat/completions` breaks external clients that don't send it | LOW [INFERRED] | LOW | Header is optional. Absent → no persistence (current behavior preserved). |
| Token usage not returned by Trae for some models → badge shows `0/0` | MEDIUM [INFERRED] | LOW | Badge hidden when both values are 0; tooltip explains. |

---

## Implementation Decisions (from `to-prd` skill + grill-me resolution)

- **Module split**: `web/app/{state,api,render,session-list,chat-view,config-panel}.js` — each < 300 lines, single responsibility.
- **DB schema**: 2-table relational (`sessions` + `messages` with FK) over K-V store — supports future message-content search without migration.
- **Session ID generation**: **server-side** (grill-me G1). Client `POST /v1/sessions` with empty body → server creates row + returns `{id, name, ...}`. Eliminates client-side collision class. ID format: `sess_<ulid>`.
- **Message ID format**: `msg_<ulid>`, also server-side generated.
- **`ulid` dependency**: use `ulid` npm package (grill-me G8). 1.4KB, 0 deps, widely used.
- **Config schema source of truth**: a single `src/config-schema.js` exporting the param array; `GET /v1/config/schema` serves it; UI consumes it; tests assert it. **Static schema in MVP** (grill-me G4) — per-model schema deferred to v2.1 pending reliable Trae capability endpoint.
- **Streaming + persistence**: **insert assistant row only at stream end** (grill-me G2). If stream aborts (user clicks Stop), no row created — client UI retains message via local cache; server stays clean. No `aborted` flag in MVP.
- **Edit semantics** (grill-me G3): editing message at index `i` deletes all messages at `i+1..end`, then sends new request. **Confirm dialog only when truncating > 1 message** (i.e., editing the last user message = no dialog; editing earlier = `Confirm: discard N messages below?`). No undo (Phase 2).
- **Regenerate semantics**: equivalent to edit-on-last-user-message with same content. Implemented as a thin wrapper around the edit path.
- **Message edit UI**: **inline** (grill-me G7). Click edit icon on user message → bubble becomes `<textarea>` → Save/Cancel. No modal.
- **Config panel layout**: **accordion** in existing right panel (grill-me G6). Sections: `Model` (always expanded), `Sampling` (collapsed default), `Tools` (collapsed), `System` (collapsed). No tabs, no modal.
- **Existing API Tester + Agent tabs**: **move to top-bar icon menu (☰) overlay** (grill-me G11). Chat becomes default full-screen view. Preserves all existing functionality.
- **Concurrent requests**: **reject** (grill-me G10). Send button disabled while streaming (already implemented — preserve). User clicks Stop to abort before sending next.
- **Config preview**: collapsible "Preview request body" `<details>` at bottom of config panel (grill-me G13). Shows effective JSON request body.
- **KaTeX loading**: **lazy-load** (grill-me G14). Initial page: marked + highlight.js only. On first message containing `$...$` or `$$...$$`, dynamically inject KaTeX script tag. Cached for session.
- **CDN fallback**: **self-hosted vendor** via `scripts/fetch-vendor.js` (grill-me G12). Pinned versions downloaded to `web/vendor/` and committed. Primary path: CDN with SRI. Fallback: local vendor. GFW resilience.
- **Backward compat migration** (grill-me G5): one-shot on first load after upgrade. If `localStorage.trae_api_studio` exists and `localStorage.migration_v2_done` absent → POST each old session to `/v1/sessions` → set flag → keep old localStorage as 30-day backup. Console log progress.
- **Test DB strategy** (grill-me G9): in-memory (`:memory:`) for unit tests of `src/sessions.js`; temp file (`fs.mkdtempSync`) for route integration tests. `vitest` `beforeEach` creates fresh DB.

## Testing Decisions (from `to-prd` skill)

- **What makes a good test here**: test external behavior (HTTP request → response + DB state), not internal function calls. No mocking of `better-sqlite3` (use a temp DB file per test).
- **Server-side TDD scope**:
  - `src/sessions.js` — repository layer (CRUD, search, sort)
  - `src/config-schema.js` — schema definition + validation
  - All `/v1/sessions*` route handlers
  - `/v1/config/schema` route
  - `/v1/sessions/:id/regenerate` route
- **Test framework**: `vitest` (Node-native, zero-config, matches ESM). Test files: `tests/server/**/*.test.js`.
- **Test DB isolation**: each test creates a temp DB via `fs.mkdtempSync()` + `SESSIONS_DB_PATH` env override; cleanup in `afterEach`.
- **Prior art in codebase**: `tests/test-all.js` exists (custom runner) — migrate to `vitest` and keep `test-all.js` as a smoke aggregator.
- **Frontend testing**: Playwright E2E only — `tests/e2e/portal.spec.js` covers: load portal, create session, send message, see streamed response, edit message, regenerate, rename session, delete session. No DOM unit tests.
- **Coverage target**: ≥ 85% lines on `src/sessions.js` + `src/config-schema.js`; no target on `src/server.js` (route wiring) — covered by E2E.

## Out of Scope (consolidated)
See §2 Non-Goals NG1–NG11.

## Further Notes
- Existing `dashboard.html` monitoring page is untouched.
- Existing API testing tab and Agent tab in `index.html` are preserved (may visually relocate to make room for new config panel layout).
- `.env.example` gets new entries: `SESSIONS_DB_PATH`, `PORTAL_CDN_FALLBACK` (bool).
- `package.json` adds: `better-sqlite3`, `vitest` (dev), `ulid` (or inline ULID impl to avoid dep).
- `project_memory.md` updated per `/handoff` after implementation.
