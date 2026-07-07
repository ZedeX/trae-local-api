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
  `);
  return dbInstance;
}

/** Create a new session. Server-generated id (grill-me G1). */
function createSession(opts = {}) {
  const db = getDb();
  const id = `sess_${ulid()}`;
  const now = Date.now();
  const name = opts.name || `Session ${new Date(now).toLocaleString()}`;
  const configJson = JSON.stringify(opts.config || {});
  db.prepare(
    'INSERT INTO sessions(id, name, pinned, config_json, created_at, updated_at) VALUES(?, ?, 0, ?, ?, ?)'
  ).run(id, name, configJson, now, now);
  return {
    id,
    name,
    pinned: false,
    config: opts.config || {},
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
  return row ? rowToSession(row) : null;
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
  _resetForTest,
};
