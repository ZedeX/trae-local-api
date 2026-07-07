'use strict';

/**
 * Session/message repository backed by node:sqlite (Node 22.5+ built-in).
 *
 * Schema and behavior defined in docs/PRD-web-portal-v2.md and
 * plans/web-portal-v2.md (Phase 1+). This module is the single access
 * point for sessions table — no other module should touch the DB directly.
 */

const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const { ulid } = require('ulid');

let dbInstance = null;

function resolveDbPath() {
  const explicit = process.env.SESSIONS_DB_PATH;
  if (explicit) return explicit;
  const workspace = process.env.WORKSPACE_DIR || process.cwd();
  return path.join(workspace, '.trae-api', 'sessions.db');
}

function getDb() {
  if (dbInstance) return dbInstance;
  const dbPath = resolveDbPath();
  const dir = path.dirname(dbPath);
  if (dir && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  dbInstance = new DatabaseSync(dbPath);
  // WAL mode for concurrent read/write (no-op for :memory:)
  try { dbInstance.exec('PRAGMA journal_mode = WAL;'); } catch { /* :memory: ignores */ }
  // FK ON DELETE CASCADE requires foreign_keys pragma (off by default in sqlite)
  try { dbInstance.exec('PRAGMA foreign_keys = ON;'); } catch { /* ignore */ }
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      pinned INTEGER NOT NULL DEFAULT 0,
      config_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_pinned_updated_at
      ON sessions(pinned, updated_at);

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      tokens_in INTEGER NOT NULL DEFAULT 0,
      tokens_out INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_messages_session_created
      ON messages(session_id, created_at);
  `);
  return dbInstance;
}

// Global defaults — set by PUT /v1/config/defaults; used to seed new sessions
let _globalDefaults = null;

/** Called by server.js when global defaults are updated. */
function setGlobalDefaults(defaults) {
  _globalDefaults = defaults;
}

/** Create a new session. Server-generated id (grill-me G1). */
function createSession(opts = {}) {
  const db = getDb();
  const id = `sess_${ulid()}`;
  const now = Date.now();
  const name = opts.name || `Session ${new Date(now).toLocaleString()}`;
  // Merge global defaults with session-specific config (session overrides)
  const mergedConfig = { ...(_globalDefaults || {}), ...(opts.config || {}) };
  const configJson = JSON.stringify(mergedConfig);
  db.prepare(
    'INSERT INTO sessions(id, name, pinned, config_json, created_at, updated_at) VALUES(?, ?, 0, ?, ?, ?)'
  ).run(id, name, configJson, now, now);
  return {
    id,
    name,
    pinned: false,
    config: mergedConfig,
    createdAt: now,
    updatedAt: now,
  };
}

/** List all sessions, sorted pinned DESC then updated_at DESC. */
function listSessions(filter = {}) {
  const db = getDb();
  let sql = 'SELECT id, name, pinned, config_json, created_at, updated_at FROM sessions';
  const params = [];
  if (filter.q) {
    sql += ' WHERE LOWER(name) LIKE ?';
    params.push(`%${String(filter.q).toLowerCase()}%`);
  }
  sql += ' ORDER BY pinned DESC, updated_at DESC';
  const rows = db.prepare(sql).all(...params);
  return rows.map(rowToSession);
}

function getSession(id) {
  const db = getDb();
  const row = db.prepare(
    'SELECT id, name, pinned, config_json, created_at, updated_at FROM sessions WHERE id = ?'
  ).get(id);
  if (!row) return null;
  const session = rowToSession(row);
  session.messages = getMessages(id);
  return session;
}

/** Append a message to a session. Returns the message object or null if session missing. */
function addMessage(sessionId, { role, content, tokensIn = 0, tokensOut = 0 } = {}) {
  const db = getDb();
  // Lightweight existence check (avoid loading all messages just to validate session)
  const existing = db.prepare('SELECT id FROM sessions WHERE id = ?').get(sessionId);
  if (!existing) return null;
  if (!role || typeof role !== 'string') throw new Error('role is required');
  if (content == null) content = '';
  if (typeof content !== 'string') content = String(content);
  const id = `msg_${ulid()}`;
  const now = Date.now();
  db.prepare(
    'INSERT INTO messages(id, session_id, role, content, tokens_in, tokens_out, created_at) VALUES(?, ?, ?, ?, ?, ?, ?)'
  ).run(id, sessionId, role, content, tokensIn || 0, tokensOut || 0, now);
  // Bump session.updated_at so the session sorts to top of sidebar
  db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?').run(now, sessionId);
  return {
    id,
    sessionId,
    role,
    content,
    tokensIn: tokensIn || 0,
    tokensOut: tokensOut || 0,
    createdAt: now,
  };
}

/** List messages for a session, sorted by created_at ASC. */
function getMessages(sessionId) {
  const db = getDb();
  const rows = db.prepare(
    'SELECT id, session_id, role, content, tokens_in, tokens_out, created_at FROM messages WHERE session_id = ? ORDER BY created_at ASC'
  ).all(sessionId);
  return rows.map(rowToMessage);
}

/**
 * Phase 8: Truncate messages from a given message ID onward.
 * Deletes the specified message and all messages created after it.
 * Returns the count of deleted messages, or -1 if session/message not found.
 */
function truncateMessagesFrom(sessionId, messageId) {
  const db = getDb();
  // Verify session exists
  const session = db.prepare('SELECT id FROM sessions WHERE id = ?').get(sessionId);
  if (!session) return -1;

  // Find the target message's created_at
  const target = db.prepare(
    'SELECT id, created_at FROM messages WHERE id = ? AND session_id = ?'
  ).get(messageId, sessionId);
  if (!target) return -1;

  // Delete the target message and all messages created at or after it
  const result = db.prepare(
    'DELETE FROM messages WHERE session_id = ? AND created_at >= ?'
  ).run(sessionId, target.created_at);

  // Bump session updated_at
  db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?').run(Date.now(), sessionId);

  return result.changes;
}

function updateSession(id, patch = {}) {
  const db = getDb();
  const existing = getSession(id);
  if (!existing) return null;
  const next = {
    name: patch.name !== undefined ? patch.name : existing.name,
    pinned: patch.pinned !== undefined ? !!patch.pinned : existing.pinned,
    config: patch.config !== undefined ? patch.config : existing.config,
  };
  const now = Date.now();
  db.prepare(
    'UPDATE sessions SET name = ?, pinned = ?, config_json = ?, updated_at = ? WHERE id = ?'
  ).run(next.name, next.pinned ? 1 : 0, JSON.stringify(next.config), now, id);
  return { ...existing, ...next, updatedAt: now };
}

function deleteSession(id) {
  const db = getDb();
  const result = db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
  return result.changes > 0;
}

function rowToSession(row) {
  return {
    id: row.id,
    name: row.name,
    pinned: !!row.pinned,
    config: JSON.parse(row.config_json || '{}'),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToMessage(row) {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role,
    content: row.content,
    tokensIn: row.tokens_in,
    tokensOut: row.tokens_out,
    createdAt: row.created_at,
  };
}

/** Reset instance — for tests only. */
function _resetForTest() {
  if (dbInstance) {
    try { dbInstance.close(); } catch { /* ignore */ }
    dbInstance = null;
  }
}

module.exports = {
  getDb,
  createSession,
  listSessions,
  getSession,
  updateSession,
  deleteSession,
  addMessage,
  getMessages,
  truncateMessagesFrom,
  setGlobalDefaults,
  _resetForTest,
};
