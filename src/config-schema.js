'use strict';

/**
 * Static config schema — single source of truth for what's configurable.
 * UI reads GET /v1/config/schema and dynamically renders the config panel.
 * Each session stores its own config_json; defaults come from this module.
 *
 * Phase 4 will add 8 OpenAI sampling parameters to the "Sampling" group.
 */

const CONFIG_PARAMS = [
  {
    key: 'model',
    type: 'string',
    default: 'auto',
    group: 'Model',
    advanced: false,
    description: 'Model ID or "auto" for server default',
  },
  {
    key: 'system_prompt',
    type: 'string',
    default: '',
    group: 'Model',
    advanced: false,
    description: 'System prompt prepended to every conversation',
  },
  {
    key: 'function',
    type: 'enum',
    default: 'default',
    enum: ['default', 'chat', 'codeChat', 'codeGenerate', 'agent'],
    group: 'Model',
    advanced: true,
    description: 'Trae function/mode selector',
  },
  {
    key: 'stream',
    type: 'boolean',
    default: true,
    group: 'General',
    advanced: false,
    description: 'Stream responses token-by-token',
  },
  {
    key: 'max_tool_rounds',
    type: 'number',
    default: 8,
    min: 1,
    max: 50,
    group: 'General',
    advanced: true,
    description: 'Maximum tool-use rounds for agent mode',
  },
  {
    key: 'auto_continue',
    type: 'boolean',
    default: true,
    group: 'General',
    advanced: true,
    description: 'Auto-continue truncated responses',
  },
  {
    key: 'max_continues',
    type: 'number',
    default: 5,
    min: 1,
    max: 20,
    group: 'General',
    advanced: true,
    description: 'Maximum auto-continue rounds',
  },
  {
    key: 'workspace_dir',
    type: 'string',
    default: '',
    group: 'Files',
    advanced: false,
    description: 'Workspace directory for file operations',
  },
];

/** Returns the full schema. */
function getSchema() {
  return { params: CONFIG_PARAMS };
}

/** Returns an object of {key: default} for seeding new sessions. */
function getDefaults() {
  const defaults = {};
  for (const p of CONFIG_PARAMS) {
    defaults[p.key] = p.default;
  }
  return defaults;
}

/** Validate and coerce a config object against the schema.
 *  Returns a cleaned config with unknown keys removed and types coerced. */
function validateConfig(config) {
  if (!config || typeof config !== 'object') return getDefaults();
  const paramMap = {};
  for (const p of CONFIG_PARAMS) paramMap[p.key] = p;
  const cleaned = {};
  for (const p of CONFIG_PARAMS) {
    const val = config[p.key];
    if (val === undefined || val === null) {
      cleaned[p.key] = p.default;
      continue;
    }
    if (p.type === 'number') {
      const n = Number(val);
      if (isNaN(n)) { cleaned[p.key] = p.default; continue; }
      cleaned[p.key] = Math.max(p.min ?? -Infinity, Math.min(p.max ?? Infinity, n));
    } else if (p.type === 'boolean') {
      cleaned[p.key] = !!val;
    } else if (p.type === 'enum') {
      cleaned[p.key] = (p.enum || []).includes(val) ? val : p.default;
    } else {
      cleaned[p.key] = String(val);
    }
  }
  // Preserve unknown keys (forward-compat for Phase 4 sampling params)
  for (const [k, v] of Object.entries(config)) {
    if (!(k in cleaned)) cleaned[k] = v;
  }
  return cleaned;
}

module.exports = { getSchema, getDefaults, validateConfig };
