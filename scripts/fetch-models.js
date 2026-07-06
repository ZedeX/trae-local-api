// scripts/fetch-models.js
// Fetch models from Trae remote and compare with local model-config.json
// Usage: node scripts/fetch-models.js [--update]
const fs = require('fs');
const path = require('path');

const { getModelDetailParam, getModelConfig, saveModelConfig, rebuildDerivedMaps } = require('../src/trae-client');

async function main() {
  const doUpdate = process.argv.includes('--update');

  console.log('[fetch-models] Fetching models from Trae remote...');

  // 1. Fetch remote models
  let remoteData;
  try {
    remoteData = await getModelDetailParam('chat_v3');
  } catch(e) {
    console.error(`[fetch-models] ERROR fetching models: ${e.message}`);
    process.exit(1);
  }

  // 2. Parse remote models
  // The response structure varies; try to extract model list
  let remoteModels = [];
  if (Array.isArray(remoteData)) {
    remoteModels = remoteData;
  } else if (remoteData && Array.isArray(remoteData.models)) {
    remoteModels = remoteData.models;
  } else if (remoteData && Array.isArray(remoteData.data)) {
    remoteModels = remoteData.data;
  } else if (remoteData && remoteData.config_infos) {
    remoteModels = remoteData.config_infos;
  } else if (remoteData && typeof remoteData === 'object') {
    // Try to find any array property
    for (const key of Object.keys(remoteData)) {
      if (Array.isArray(remoteData[key])) {
        console.log(`[fetch-models] Found model array in property: "${key}"`);
        remoteModels = remoteData[key];
        break;
      }
    }
  }

  console.log(`[fetch-models] Remote models: ${remoteModels.length}`);

  // Extract config_names from remote models
  const remoteConfigNames = new Set();
  const remoteModelMap = {};
  for (const m of remoteModels) {
    const configName = m.config_name || m.name || m.model || m.id;
    if (configName) {
      remoteConfigNames.add(configName);
      remoteModelMap[configName] = m;
    }
  }

  // 3. Load local model-config.json
  const localConfig = getModelConfig();
  const localModels = localConfig.models || {};
  const localConfigNames = new Set(Object.values(localModels).map(m => m.config_name));

  console.log(`[fetch-models] Local models: ${localConfigNames.size}`);

  // 4. Compare
  const newModels = [];
  const removedModels = [];

  for (const [key, entry] of Object.entries(localModels)) {
    if (!remoteConfigNames.has(entry.config_name)) {
      removedModels.push({ key, config_name: entry.config_name });
    }
  }

  for (const configName of remoteConfigNames) {
    if (!localConfigNames.has(configName)) {
      newModels.push({ config_name: configName, raw: remoteModelMap[configName] });
    }
  }

  // 5. Print report
  console.log('\n=== Model Comparison Report ===');
  console.log(`Remote total: ${remoteConfigNames.size}`);
  console.log(`Local total:  ${localConfigNames.size}`);
  console.log(`New models:   ${newModels.length}`);
  console.log(`Removed:      ${removedModels.length}`);

  if (newModels.length > 0) {
    console.log('\n--- New Models (in remote but not local) ---');
    for (const m of newModels) {
      console.log(`  + ${m.config_name}`);
      // Try to extract function from raw data
      if (m.raw && m.raw.function) {
        console.log(`    function: ${m.raw.function}`);
      }
      if (m.raw && m.raw.model) {
        console.log(`    model: ${m.raw.model}`);
      }
    }
  }

  if (removedModels.length > 0) {
    console.log('\n--- Removed Models (in local but not remote) ---');
    for (const m of removedModels) {
      console.log(`  - ${m.key} (config_name: ${m.config_name})`);
    }
  }

  // 6. Auto-update if requested
  if (doUpdate && newModels.length > 0) {
    console.log('\n[fetch-models] Updating model-config.json...');
    let added = 0;
    for (const m of newModels) {
      // Generate a key from config_name (lowercase, replace special chars)
      const key = m.config_name.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      const funcName = m.raw?.function || 'chat_v3';

      localModels[key] = {
        function: funcName,
        config_name: m.config_name,
        category: 'auto-fetched',
        toolcall_compatible: null,
        multimodal: false,
        reasoning: false
      };
      added++;
      console.log(`  Added: ${key} → ${m.config_name} (${funcName})`);
    }

    localConfig.models = localModels;
    saveModelConfig(localConfig);
    rebuildDerivedMaps();
    console.log(`[fetch-models] Added ${added} new models to model-config.json`);
    console.log('[fetch-models] Hot-reload should trigger automatically');
  } else if (doUpdate && newModels.length === 0) {
    console.log('\n[fetch-models] No new models to add');
  } else if (newModels.length > 0) {
    console.log('\n[fetch-models] Run with --update to add new models to model-config.json');
  }

  // 7. Print all remote model names for reference
  console.log('\n=== All Remote Models ===');
  const sortedNames = Array.from(remoteConfigNames).sort();
  for (const name of sortedNames) {
    const inLocal = localConfigNames.has(name) ? '✓' : '+';
    console.log(`  ${inLocal} ${name}`);
  }

  console.log('\n[fetch-models] Done');
}

main().catch(e => {
  console.error(`[fetch-models] Fatal error: ${e.message}`);
  process.exit(1);
});
