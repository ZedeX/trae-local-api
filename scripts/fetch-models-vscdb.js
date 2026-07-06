// scripts/fetch-models-vscdb.js
// Fetch models from Trae CN's state.vscdb cache (SQLite)
// This is the reliable alternative since /api/ide/v1/get_detail_param is broken.
//
// Usage:
//   node scripts/fetch-models-vscdb.js           # Show comparison report
//   node scripts/fetch-models-vscdb.js --update   # Update model-config.json

const fs = require('fs');
const path = require('path');
const os = require('os');

// Try to load better-sqlite3, fallback to a manual approach
let dbLib = null;
try {
  dbLib = require('better-sqlite3');
} catch(e) {
  // Not installed - we'll use a different approach
}

const { getModelConfig, saveModelConfig, rebuildDerivedMaps } = require('../src/trae-client');
const { getAuthInfo } = require('../src/auth');

// Trae CN data dir — support env override for non-default installations
const TRAE_CN_DATA_DIR = process.env.TRAE_CN_DATA_DIR || path.join(os.homedir(), 'AppData', 'Roaming', 'Trae CN');
const VSCDB_PATH = path.join(TRAE_CN_DATA_DIR, 'User', 'globalStorage', 'state.vscdb');

// Build tier mapping dynamically from model-config.json instead of hardcoding.
// This ensures consistency: if model-config.json tiers change, the script picks them up.
function buildTierMapping() {
  const config = getModelConfig();
  const mapping = {};
  // Map from each model's config_name to its tier
  if (config.models) {
    for (const [key, entry] of Object.entries(config.models)) {
      if (entry.config_name && entry.tier) {
        mapping[entry.config_name] = String(entry.tier);
      }
    }
  }
  // Also map from tier definitions (tier name -> array of models)
  if (config.tiers) {
    for (const [tierName, models] of Object.entries(config.tiers)) {
      if (Array.isArray(models)) {
        for (const m of models) {
          if (!mapping[m]) mapping[m] = tierName;
        }
      }
    }
  }
  return mapping;
}

function readVscdb(vscdbPath, userId) {
  const key = `${userId}_AI.agent.model.model_list_map`;

  if (dbLib) {
    // Use better-sqlite3
    const db = dbLib(vscdbPath, { readonly: true });
    const row = db.prepare('SELECT value FROM ItemTable WHERE key = ?').get(key);
    db.close();
    if (!row) throw new Error(`Key not found: ${key}`);
    return JSON.parse(row.value);
  }

  // Fallback: use Python (available on this machine)
  const { execSync } = require('child_process');
  const pyScript = `import sqlite3, json, sys
conn = sqlite3.connect(r'${vscdbPath}')
row = conn.cursor().execute('SELECT value FROM ItemTable WHERE key=?', ('${key}',)).fetchone()
conn.close()
if row:
    sys.stdout.buffer.write(row[0].encode('utf-8'))
else:
    print('NOT_FOUND', file=sys.stderr)
    sys.exit(1)`;

  const tmpFile = path.join(os.tmpdir(), '_read_vscdb.py');
  fs.writeFileSync(tmpFile, pyScript);
  try {
    const result = execSync(`python "${tmpFile}"`, { encoding: 'utf-8', timeout: 10000 });
    return JSON.parse(result);
  } finally {
    try { fs.unlinkSync(tmpFile); } catch(e) {}
  }
}

async function main() {
  const doUpdate = process.argv.includes('--update');

  console.log('[fetch-models-vscdb] Reading Trae CN state.vscdb cache...');
  console.log(`  Path: ${VSCDB_PATH}`);

  if (!fs.existsSync(VSCDB_PATH)) {
    console.error(`[fetch-models-vscdb] ERROR: state.vscdb not found at ${VSCDB_PATH}`);
    console.error('  Ensure Trae CN IDE is installed and has been opened at least once.');
    process.exit(1);
  }

  // Get user ID from auth info
  let userId;
  try {
    const authInfo = getAuthInfo();
    userId = authInfo.userId;
    console.log(`  User ID: ${userId}`);
  } catch(e) {
    console.error(`[fetch-models-vscdb] Could not get user ID from auth: ${e.message}`);
    console.error('  Trying with common user ID pattern...');
    userId = null;
  }

  let modelListMap;
  if (userId) {
    try {
      modelListMap = readVscdb(VSCDB_PATH, userId);
    } catch(e) {
      console.error(`[fetch-models-vscdb] Failed with userId ${userId}: ${e.message}`);
      userId = null;
    }
  }

  // If no userId or failed, try to find the key by scanning
  if (!userId || !modelListMap) {
    console.log('[fetch-models-vscdb] Scanning state.vscdb for model_list_map key...');
    const { execSync } = require('child_process');
    const pyScan = `import sqlite3, json, sys
conn = sqlite3.connect(r'${VSCDB_PATH}')
rows = conn.cursor().execute("SELECT key, value FROM ItemTable WHERE key LIKE '%model_list_map%'").fetchall()
conn.close()
for k, v in rows:
    sys.stdout.buffer.write((k + '\\t' + v + '\\n').encode('utf-8'))`;
    const tmpFile = path.join(os.tmpdir(), '_scan_vscdb.py');
    fs.writeFileSync(tmpFile, pyScan);
    try {
      const result = execSync(`python "${tmpFile}"`, { encoding: 'utf-8', timeout: 10000 });
      const lines = result.trim().split('\n').filter(l => l);
      if (lines.length === 0) {
        console.error('[fetch-models-vscdb] No model_list_map key found in state.vscdb');
        process.exit(1);
      }
      // Use the first (likely only) result
      const [key, value] = lines[0].split('\t');
      console.log(`  Found key: ${key}`);
      userId = key.split('_')[0];
      modelListMap = JSON.parse(value);
    } catch(e) {
      console.error(`[fetch-models-vscdb] Scan failed: ${e.message}`);
      process.exit(1);
    } finally {
      try { fs.unlinkSync(tmpFile); } catch(e) {}
    }
  }

  // Parse model list map
  // Structure: { function_name: [ { name, display_name, multimodal, ... } ] }
  const allModels = new Map(); // config_name -> { display_name, multimodal, functions, ... }

  for (const [funcName, models] of Object.entries(modelListMap)) {
    if (!Array.isArray(models)) continue;
    for (const m of models) {
      const configName = m.name || m.config_name || m.id;
      if (!configName) continue;
      // Skip internal/volcengine fallback models
      if (configName.startsWith('volcengine//') || configName.startsWith('volcengine-plan//')) continue;
      // Skip specialized non-chat models
      if (['code-review-judge', 'refactor_scoper', 'refactor_finder', 'refactor_planner', 'refactor_incrementer'].includes(configName)) continue;

      if (!allModels.has(configName)) {
        allModels.set(configName, {
          config_name: configName,
          display_name: m.display_name || m.name || configName,
          multimodal: m.multimodal || false,
          is_beta: m.is_beta || false,
          context_window: m.context_window_size || m.context_window || null,
          max_tokens: m.max_tokens || null,
          functions: [funcName],
        });
      } else {
        const existing = allModels.get(configName);
        existing.functions.push(funcName);
        if (m.multimodal) existing.multimodal = true;
      }
    }
  }

  console.log(`[fetch-models-vscdb] Found ${allModels.size} unique models in cache`);

  // Load local config
  const localConfig = getModelConfig();
  const localModels = localConfig.models || {};
  const localConfigNames = new Set(Object.values(localModels).map(m => m.config_name));

  console.log(`[fetch-models-vscdb] Local models: ${localConfigNames.size}`);

  // Compare
  const newModels = [];
  const removedModels = [];

  for (const [configName, info] of allModels) {
    if (!localConfigNames.has(configName)) {
      newModels.push(info);
    }
  }

  for (const [key, entry] of Object.entries(localModels)) {
    if (!allModels.has(entry.config_name)) {
      removedModels.push({ key, config_name: entry.config_name });
    }
  }

  // Print report
  console.log('\n=== Model Comparison Report ===');
  console.log(`Cache total:  ${allModels.size}`);
  console.log(`Local total:  ${localConfigNames.size}`);
  console.log(`New models:   ${newModels.length}`);
  console.log(`Removed:      ${removedModels.length}`);

  if (newModels.length > 0) {
    console.log('\n--- New Models (in cache but not local) ---');
    for (const m of newModels) {
      console.log(`  + ${m.config_name} (${m.display_name})`);
      console.log(`    multimodal: ${m.multimodal}, beta: ${m.is_beta}, context: ${m.context_window || 'N/A'}`);
      console.log(`    functions: ${m.functions.join(', ')}`);
    }
  }

  if (removedModels.length > 0) {
    console.log('\n--- Removed Models (in local but not cache) ---');
    for (const m of removedModels) {
      console.log(`  - ${m.key} (config_name: ${m.config_name})`);
    }
  }

  // Build tier mapping from model-config.json (dynamic, not hardcoded)
  const tierMapping = buildTierMapping();

  // Print all cache models sorted
  console.log('\n=== All Models in Trae CN Cache ===');
  const sorted = Array.from(allModels.values()).sort((a, b) => a.config_name.localeCompare(b.config_name));
  for (const m of sorted) {
    const inLocal = localConfigNames.has(m.config_name) ? '✓' : '+';
    const tier = tierMapping[m.config_name] || '?';
    console.log(`  ${inLocal} [${tier}] ${m.config_name} (${m.display_name})${m.multimodal ? ' [multimodal]' : ''}`);
  }

  // Auto-update
  if (doUpdate && newModels.length > 0) {
    console.log('\n[fetch-models-vscdb] Updating model-config.json...');
    let added = 0;

    for (const m of newModels) {
      const key = m.config_name.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      const tier = tierMapping[m.config_name] || 'T3';

      // Determine function: prefer chat-capable functions
      let funcName = 'chat_v3';
      if (m.functions.includes('solo_coder')) funcName = 'chat_v3';
      else if (m.functions.includes('builder')) funcName = 'chat_v3';
      else if (m.functions.includes('solo_agent')) funcName = 'chat_v3';

      localModels[key] = {
        function: funcName,
        config_name: m.config_name,
        category: 'chat',
        toolcall_compatible: null,
        multimodal: m.multimodal || false,
        reasoning: false,
        tier: tier
      };
      added++;
      console.log(`  Added: ${key} → ${m.config_name} (tier: ${tier}, multimodal: ${m.multimodal})`);
    }

    localConfig.models = localModels;
    saveModelConfig(localConfig);
    rebuildDerivedMaps();
    console.log(`[fetch-models-vscdb] Added ${added} new models to model-config.json`);
    console.log('[fetch-models-vscdb] Hot-reload should trigger automatically');
  } else if (doUpdate && newModels.length === 0) {
    console.log('\n[fetch-models-vscdb] No new models to add');
  } else if (newModels.length > 0) {
    console.log('\n[fetch-models-vscdb] Run with --update to add new models to model-config.json');
  }

  console.log('\n[fetch-models-vscdb] Done');
}

main().catch(e => {
  console.error(`[fetch-models-vscdb] Fatal: ${e.message}`);
  process.exit(1);
});
