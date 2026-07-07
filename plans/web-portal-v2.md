# Plan: Web Portal v2 — Doubao-web-class Chat Surface

> Source PRD: `docs/PRD-web-portal-v2.md`
> Approved: 2026-07-07
> Phases: 10 tracer-bullet vertical slices
> TDD scope: server-side routes (red-green-refactor); frontend via Playwright smoke only

## Architectural decisions

Durable decisions that apply across all phases:

- **Routes**:
  - `GET    /v1/sessions` — list (supports `?q=` search, sorted `pinned DESC, updated_at DESC`)
  - `POST   /v1/sessions` — create (server generates `id`, returns full object)
  - `GET    /v1/sessions/:id` — read with messages
  - `PUT    /v1/sessions/:id` — update `name` / `pinned` / `config`
  - `DELETE /v1/sessions/:id` — delete session + cascade messages
  - `POST   /v1/sessions/:id/messages` — append message (role, content, tokens)
  - `POST   /v1/sessions/:id/regenerate` — drop last assistant message, re-send last user message
  - `GET    /v1/sessions/:id/export` — JSON export (session + messages)
  - `GET    /v1/config/schema` — static param schema JSON
  - Existing routes (`/v1/chat/completions`, `/v1/messages`, `/v1/models`, `/v1/dashboard/*`) extended, not replaced.
  - `X-Session-Id` header on `POST /v1/chat/completions` triggers persistence (absent = current no-persistence behavior).

- **Schema** (SQLite, file at `${SESSIONS_DB_PATH}` env, default `${WORKSPACE_DIR}/.trae-api/sessions.db`, WAL mode):
  - `sessions(id TEXT PK, name TEXT NOT NULL, pinned INT NOT NULL DEFAULT 0, config_json TEXT NOT NULL DEFAULT '{}', created_at INT NOT NULL, updated_at INT NOT NULL)`
  - `messages(id TEXT PK, session_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, tokens_in INT DEFAULT 0, tokens_out INT DEFAULT 0, created_at INT NOT NULL, FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE)`
  - Index: `idx_messages_session_id_created_at ON messages(session_id, created_at)`
  - Index: `idx_sessions_pinned_updated_at ON sessions(pinned, updated_at)`

- **Key models**:
  - `Session = {id, name, pinned, config, createdAt, updatedAt}` (config is parsed object)
  - `Message = {id, sessionId, role, content, tokensIn, tokensOut, createdAt}`
  - `ConfigSchema = {params: [{key, type, default, min, max, enum, group, advanced, description}]}`
  - ID format: `sess_<ulid>`, `msg_<ulid>` — server-generated.

- **Auth**: existing `API_KEY` middleware applies to all new `/v1/sessions*` and `/v1/config/schema` routes. Portal page (`GET /`) stays unauthenticated.

- **Service boundaries**:
  - `better-sqlite3` (synchronous, file-based) — new dependency.
  - `ulid` npm package — new dependency for ID generation.
  - `vitest` — new dev dependency for tests.
  - `marked`, `highlight.js`, `katex`, `dompurify` — CDN with self-hosted vendor fallback (pinned versions in `web/vendor/`).
  - Trae backend — existing, extended in Phase 4 to forward sampling params.

- **TDD discipline**: every server route has a failing test committed before implementation. Tests live in `tests/server/**/*.test.js`. In-memory DB for unit tests; temp file for integration. Coverage target ≥ 85% on `src/sessions.js` and `src/config-schema.js`.

---

## Phase 1: Session storage skeleton

**User stories**: 6 (partial — create/list/delete only)

### What to build

The thinnest possible vertical slice proving the persistence stack end-to-end: a user can create a session, see it appear in the sidebar, refresh the browser, and the session is still there. No messages yet — just the session shell.

Cuts through: SQLite schema creation on first server start, `POST/GET/DELETE /v1/sessions` routes with `API_KEY` auth, sidebar UI calling the new endpoints. The existing chat UI continues to work via localStorage for now (migration is Phase 9).

### Acceptance criteria

- [ ] Server starts cleanly with no DB file; creates `sessions` table automatically.
- [ ] `POST /v1/sessions` with empty body returns `{id: "sess_...", name: "Session N", pinned: false, config: {}, createdAt, updatedAt}` and persists a row.
- [ ] `GET /v1/sessions` returns array sorted `pinned DESC, updated_at DESC`.
- [ ] `DELETE /v1/sessions/:id` removes the row; subsequent `GET /v1/sessions` reflects deletion.
- [ ] `GET /v1/sessions` without `Authorization` header returns 401.
- [ ] Sidebar `+ New` button calls `POST /v1/sessions`; new session appears and survives browser refresh.
- [ ] Trash icon on session calls `DELETE`; session disappears from sidebar and DB.
- [ ] Vitest test file `tests/server/sessions-crud.test.js` covers all 4 endpoints, written before implementation (red-green-refactor).

---

## Phase 2: Send message + persist

**User stories**: 6, 7, 8

### What to build

Extend Phase 1 so a user can actually chat inside a persisted session. Sending a message in the chat view triggers `POST /v1/chat/completions` (existing) with `X-Session-Id` header. After stream completion, both the user message and the assistant response are persisted via `POST /v1/sessions/:id/messages`. Refreshing the browser reloads the full conversation from the server.

Cuts through: `messages` table creation, `POST /v1/sessions/:id/messages` route, `X-Session-Id` header integration in existing `/v1/chat/completions` handler (insert at stream end only — grill-me G2), chat-view UI reading messages from server on session load.

### Acceptance criteria

- [ ] `messages` table auto-created alongside `sessions` on first server start.
- [ ] `POST /v1/chat/completions` with `X-Session-Id: sess_xxx` persists user + assistant messages after stream completes.
- [ ] `POST /v1/chat/completions` without `X-Session-Id` preserves current behavior (no persistence).
- [ ] If user clicks Stop mid-stream, no assistant message row is created (user message row may still be created — acceptable).
- [ ] `GET /v1/sessions/:id` returns `{...session, messages: [...]}` sorted by `created_at ASC`.
- [ ] Switching sessions in sidebar loads that session's messages from server into chat view.
- [ ] Browser refresh restores the active session's full message history.
- [ ] Deleting a session cascades to delete its messages (FK ON DELETE CASCADE).
- [ ] Vitest `tests/server/messages-persist.test.js` covers persistence hook + cascade delete, written before implementation.

---

## Phase 3: Config schema + per-session config

**User stories**: 1, 2, 24

### What to build

A static config schema becomes the single source of truth for what's configurable. The UI reads `GET /v1/config/schema` and dynamically renders the config panel. Each session stores its own `config_json` — changing model or system prompt in session A does not affect session B. A "Global Defaults" template (stored server-side as a special session row or separate `defaults` table) seeds new sessions.

Cuts through: `src/config-schema.js` module, `GET /v1/config/schema` route, `PUT /v1/sessions/:id` accepting `config` field, config panel UI dynamically rendered from schema, global defaults mechanism.

### Acceptance criteria

- [ ] `GET /v1/config/schema` returns `{params: [...]}` covering at minimum: `model`, `system_prompt`, `function`, `stream`, `max_tool_rounds`, `auto_continue`, `max_continues`, `workspace_dir` (sampling params added in Phase 4).
- [ ] Each param has `{key, type, default, group, advanced, description}`; numbers have `min/max`; enums have `enum` array.
- [ ] Config panel renders fields dynamically from schema — no hardcoded `<select>` for model.
- [ ] Changing config in session A, switching to session B, switching back to A — A's config is preserved.
- [ ] `PUT /v1/sessions/:id` with `{config: {...}}` updates `config_json` and bumps `updated_at`.
- [ ] New session inherits global defaults; user can edit defaults via a "Save as default" button.
- [ ] Vitest `tests/server/config-schema.test.js` asserts schema shape and `PUT` behavior, written before implementation.

---

## Phase 4: Sampling parameters UI

**User stories**: 1 (full 8-param list), 3, 4, 5

### What to build

Extend the config schema with all 8 OpenAI-standard sampling parameters (`temperature, top_p, max_tokens, presence_penalty, frequency_penalty, stop, seed, n`). The config panel groups them under a collapsible "Sampling" accordion (grill-me G6). `trae-client.js` is extended to explicitly forward these params in the Trae request body. A "Preview request body" `<details>` element at the bottom of the config panel shows the effective JSON.

Cuts through: schema extension, accordion UI, `trae-client.js` param forwarding (verified to actually reach Trae request body — codebase exploration confirmed it currently does NOT explicitly forward), request preview component.

### Acceptance criteria

- [ ] `GET /v1/config/schema` returns all 8 sampling params with correct types/ranges (e.g., `temperature: {type: "number", min: 0, max: 2, default: 1, advanced: true, group: "Sampling"}`).
- [ ] Config panel shows "Sampling" accordion, collapsed by default.
- [ ] Setting `temperature=0.1, top_p=0.8, max_tokens=100, stop=["END"], seed=42` in UI, sending message — the request body forwarded to `trae-client.js` contains identical values (verified via test or log).
- [ ] "Preview request body" expands to show JSON with current config + last user message structure.
- [ ] Tooltip on each param: "Trae may not honor this parameter" (per risk register).
- [ ] Conditionally-hidden fields: `max_tool_rounds` hidden when `function=default`; `max_continues` hidden when `auto_continue=false`.
- [ ] Vitest `tests/server/trae-client-forward.test.js` asserts param forwarding, written before implementation.

---

## Phase 5: Markdown + code highlight

**User stories**: 10, 11, 13

### What to build

Assistant messages render as Markdown with syntax-highlighted fenced code blocks and per-block "Copy" buttons. User messages render as Markdown too (no highlight). All rendered HTML is sanitized via DOMPurify before injection. Vendor libraries are self-hosted under `web/vendor/` with a `scripts/fetch-vendor.js` script that downloads pinned versions; primary load path is CDN with SRI, fallback is local vendor.

Cuts through: `web/app/render.js` module, `scripts/fetch-vendor.js`, `web/vendor/` directory, chat-view.js integration to use render module, sanitization pipeline.

### Acceptance criteria

- [ ] Assistant message containing `# Heading`, `- list`, `**bold**`, `[link](url)`, `| table |` renders correctly.
- [ ] Fenced ` ```js ` block renders with highlight.js classes and a "Copy" button that copies code to clipboard.
- [ ] User message with Markdown renders as Markdown (no syntax highlight).
- [ ] HTML containing `<script>alert(1)</script>` is sanitized to text (DOMPurify strips).
- [ ] `scripts/fetch-vendor.js` downloads `marked@15.x`, `highlight.js@11.x`, `dompurify@3.x` to `web/vendor/`.
- [ ] CDN load fails (simulated) → local vendor loads successfully.
- [ ] First-contentful render of a 10KB Markdown message < 200ms.
- [ ] Playwright smoke test `tests/e2e/render.spec.js` asserts `<pre><code class="language-js">` and `<table>` present after render.

---

## Phase 6: KaTeX lazy-load

**User stories**: 12

### What to build

Math rendering via KaTeX, but loaded on demand: initial page load does not include KaTeX (saves ~270KB). On the first message containing `$...$` or `$$...$$`, the render module dynamically injects the KaTeX script tag and re-renders pending messages. Subsequent messages in the session use the cached KaTeX.

Cuts through: lazy script injection in `web/app/render.js`, KaTeX auto-render integration, vendor pipeline extension (KaTeX added to `scripts/fetch-vendor.js`).

### Acceptance criteria

- [ ] Initial page load does not fetch KaTeX (verified via network tab in Playwright).
- [ ] Sending/receiving a message with `$E=mc^2$` triggers KaTeX load and renders as math.
- [ ] Subsequent math messages render without re-fetching KaTeX.
- [ ] Block math `$$\int_0^1 x\,dx$$` renders centered on its own line.
- [ ] KaTeX added to `scripts/fetch-vendor.js` and `web/vendor/`.
- [ ] Playwright assertion: `<span class="katex">` present after math render.

---

## Phase 7: Session rename / pin / search / delete

**User stories**: 19, 20, 21, 22, 23

### What to build

Sidebar session management reaches Doubao-web parity. Double-click a session name to rename inline. Pin/unpin via hover menu. Search box filters by name (case-insensitive `LIKE`). Delete with confirm dialog. Sort order: `pinned DESC, updated_at DESC`.

Cuts through: `PUT /v1/sessions/:id` accepting `name` and `pinned` fields, `GET /v1/sessions?q=...` search, sidebar UI for inline rename / pin toggle / search filter / delete confirm.

### Acceptance criteria

- [ ] Double-click session name → inline editable → Enter saves via `PUT /v1/sessions/:id {name: "..."}`.
- [ ] Hover session → pin icon → click toggles `pinned` via `PUT`; pinned sessions move to top.
- [ ] Search box input filters sidebar by `name LIKE '%query%'` (case-insensitive); empty input shows all.
- [ ] Delete trash icon → confirm modal `Delete "session name"? This cannot be undone.` → DELETE on confirm.
- [ ] Sidebar sort: `pinned DESC, updated_at DESC` always enforced.
- [ ] `GET /v1/sessions?q=test` returns only matching sessions; `?q=` (empty) returns all.
- [ ] Vitest `tests/server/sessions-search.test.js` covers rename, pin toggle, search query, written before implementation.

---

## Phase 8: Message edit + regenerate

**User stories**: 14, 15, 16, 18

### What to build

User can edit any of their prior user messages inline. Saving the edit truncates all messages below it (with confirm dialog if > 1 message truncated — grill-me G3) and re-sends the edited message as a new chat request. Regenerate button on the last assistant message drops it and re-sends the last user message. Token usage badge appears on each assistant message (`in: N / out: M`), hidden when both are 0.

Cuts through: edit endpoint (delete messages from index `i+1`, then persist new user message, then trigger chat), regenerate endpoint (thin wrapper around edit-on-last-user-message), inline edit UI in chat-view, token badge component.

### Acceptance criteria

- [ ] Edit icon on user messages; click → bubble becomes `<textarea>` → Save/Cancel.
- [ ] Editing last user message (truncates 1 assistant message) → no confirm dialog → re-sends immediately.
- [ ] Editing earlier user message (truncates > 1) → confirm dialog `Discard N messages below?` → on confirm, truncates + re-sends.
- [ ] After edit, messages below the edited one are removed from DB and UI.
- [ ] Regenerate button on last assistant message → drops it → re-sends last user message → new response streams in.
- [ ] Token badge `in: 1234 / out: 567` on assistant messages where `tokens_in + tokens_out > 0`; hidden otherwise.
- [ ] Edit + regenerate both persist correctly to DB (verify via `GET /v1/sessions/:id`).
- [ ] Vitest `tests/server/edit-regenerate.test.js` covers truncation, regenerate, token persistence, written before implementation.

---

## Phase 9: Backward-compat migration

**User stories**: G5 (from grill-me)

### What to build

Existing users have sessions in `localStorage.trae_api_studio` from the current portal. On first load after upgrade, the migration logic detects old sessions, POSTs each one to `/v1/sessions` (with its messages as a batch), sets a `migration_v2_done` flag, and keeps the old localStorage as a 30-day backup. Console logs progress.

Cuts through: migration logic in `web/app/state.js` (or a dedicated `web/app/migrate.js`), batch message persistence endpoint (or repeated `POST /v1/sessions/:id/messages`), `localStorage` flag management.

### Acceptance criteria

- [ ] On first load with `localStorage.trae_api_studio` present and `localStorage.migration_v2_done` absent: migration runs.
- [ ] Each old session is POSTed to server; old messages preserved with original roles and content.
- [ ] `localStorage.migration_v2_done = Date.now()` set after successful migration.
- [ ] Old `localStorage.trae_api_studio` retained (not cleared) for 30-day backup.
- [ ] Subsequent loads skip migration (flag present).
- [ ] Console log: `[migration] Migrating N sessions...`, `[migration] Session sess_old_1: done`, `[migration] Complete`.
- [ ] If migration fails midway, partial progress is preserved; next load retries unmigrated sessions.
- [ ] Playwright smoke test simulates old localStorage, loads page, asserts sessions appear.

---

## Phase 10: Polish — token badge, export, tab relocation

**User stories**: 5, 9, 17, G11

### What to build

Final polish: (a) token badge UI is finalized (already built in Phase 8, here we add session-level token totals in sidebar), (b) `GET /v1/sessions/:id/export` returns a single JSON file download with session config + all messages, (c) existing API Tester and Agent tabs move from main tab bar to a top-bar icon menu (☰) overlay, making Chat the default full-screen view.

Cuts through: export route, sidebar token aggregation display, layout restructure for top-bar menu, overlay component for API Tester / Agent.

### Acceptance criteria

- [ ] `GET /v1/sessions/:id/export` returns `Content-Disposition: attachment; filename="session-<name>.json"` with full session + messages JSON.
- [ ] Sidebar shows session-level token totals (`Σ in: N / out: M`) computed from message rows.
- [ ] Top bar has a `☰` menu icon; clicking opens overlay with "API Tester" and "Agent" options.
- [ ] API Tester overlay is the existing API testing UI, preserved functionally.
- [ ] Agent overlay is the existing Agent UI, preserved functionally.
- [ ] Chat view is default and uses full available width when no overlay is open.
- [ ] Config panel, sidebar, chat all remain accessible when overlay is closed.
- [ ] Playwright smoke test: open menu, launch API Tester overlay, send a test request, close overlay, return to chat.

---

## Execution notes

- **TDD order per phase**: write failing test → implement minimum to pass → refactor. Commit per red-green-refactor cycle.
- **Phase dependency**: 1 → 2 → 3 → 4 (serial); 5 → 6 can run parallel to 3-4 once 2 is done; 7 → 8 after 4; 9 → 10 last.
- **Per-phase commit**: each phase ends with a git commit on `main` (per user rule: auto-push allowed, clear proxy env first).
- **Handoff**: after each phase, update `project_memory.md` via `/handoff` skill with what was built, what's pending, what broke.
- **Demo checkpoint**: after phases 2, 4, 8, 10 — pause for user verification (Playwright smoke + manual check) before proceeding.
