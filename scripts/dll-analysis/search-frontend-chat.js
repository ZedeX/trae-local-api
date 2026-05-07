const fs = require('fs');
const path = require('path');

const appDir = 'D:\\_program\\Trae-CN\\resources\\app';
const outDir = path.join(appDir, 'out');

const jsFiles = [];
function findJsFiles(dir, depth) {
  if (depth > 3) return;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        findJsFiles(path.join(dir, entry.name), depth + 1);
      } else if (entry.name.endsWith('.js') && entry.name.includes('chat')) {
        jsFiles.push(path.join(dir, entry.name));
      }
    }
  } catch (e) {}
}

findJsFiles(outDir, 0);
console.log('Chat-related JS files:', jsFiles.length);
for (const f of jsFiles.slice(0, 20)) {
  const stat = fs.statSync(f);
  console.log(`  ${path.relative(outDir, f)} (${(stat.size / 1024).toFixed(0)} KB)`);
}

const allJsFiles = [];
function findAllJsFiles(dir, depth) {
  if (depth > 2) return;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        findAllJsFiles(path.join(dir, entry.name), depth + 1);
      } else if (entry.name.endsWith('.js')) {
        allJsFiles.push(path.join(dir, entry.name));
      }
    }
  } catch (e) {}
}

findAllJsFiles(outDir, 0);
console.log('\nAll JS files in out/ (depth 2):', allJsFiles.length);

console.log('\n=== Searching for "api/ide/v1/chat" in JS files ===');
for (const f of allJsFiles) {
  try {
    const content = fs.readFileSync(f, 'utf8');
    if (content.includes('api/ide/v1/chat') && !content.includes('api/ide/v1/chat_prompt')) {
      const idx = content.indexOf('api/ide/v1/chat');
      const context = content.substring(Math.max(0, idx - 200), Math.min(content.length, idx + 200));
      console.log(`\n${path.relative(outDir, f)}:`);
      console.log(context);
    }
  } catch (e) {}
}
