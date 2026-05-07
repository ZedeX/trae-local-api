const fs = require('fs');

const dllPath = 'D:\\_program\\Trae-CN\\resources\\app\\modules\\ai-agent\\ai_agent.dll';
const buffer = fs.readFileSync(dllPath);

const peOffset = buffer.readUInt32LE(0x3C);
const coffHeaderOffset = peOffset + 4;
const numberOfSections = buffer.readUInt16LE(coffHeaderOffset + 2);
const sizeOfOptionalHeader = buffer.readUInt16LE(coffHeaderOffset + 16);
const optionalHeaderOffset = coffHeaderOffset + 20;
const magic = buffer.readUInt16LE(optionalHeaderOffset);

let exportDirectoryRVA;
if (magic === 0x20b) {
  exportDirectoryRVA = buffer.readUInt32LE(optionalHeaderOffset + 112);
} else {
  exportDirectoryRVA = buffer.readUInt32LE(optionalHeaderOffset + 96);
}

const sectionHeaderOffset = optionalHeaderOffset + sizeOfOptionalHeader;
for (let i = 0; i < numberOfSections; i++) {
  const secOffset = sectionHeaderOffset + i * 40;
  const virtualAddress = buffer.readUInt32LE(secOffset + 12);
  const virtualSize = buffer.readUInt32LE(secOffset + 8);
  const rawSize = buffer.readUInt32LE(secOffset + 16);
  const rawOffset = buffer.readUInt32LE(secOffset + 20);

  if (exportDirectoryRVA >= virtualAddress && exportDirectoryRVA < virtualAddress + virtualSize) {
    const exportFileOffset = rawOffset + (exportDirectoryRVA - virtualAddress);
    const numberOfNames = buffer.readUInt32LE(exportFileOffset + 24);
    const addressOfNames = buffer.readUInt32LE(exportFileOffset + 32);
    const addressOfNameOrdinals = buffer.readUInt32LE(exportFileOffset + 36);
    const addressOfFunctions = buffer.readUInt32LE(exportFileOffset + 28);

    const namesFileOffset = rawOffset + (addressOfNames - virtualAddress);
    const ordinalsFileOffset = rawOffset + (addressOfNameOrdinals - virtualAddress);
    const functionsFileOffset = rawOffset + (addressOfFunctions - virtualAddress);

    const allNames = [];
    for (let j = 0; j < numberOfNames; j++) {
      const nameRVA = buffer.readUInt32LE(namesFileOffset + j * 4);
      const nameFileOffset = rawOffset + (nameRVA - virtualAddress);
      let nameEnd = nameFileOffset;
      while (buffer[nameEnd] !== 0) nameEnd++;
      const name = buffer.slice(nameFileOffset, nameEnd).toString('ascii');
      allNames.push(name);
    }

    const keywords = ['aha', 'ai_agent', 'agent', 'chat', 'ipc', 'ffi', 'init', 'bp_', 'towel', 'rpc', 'send', 'recv', 'message', 'session', 'stream'];
    
    console.log('=== Exported functions matching keywords ===');
    for (const name of allNames) {
      const lower = name.toLowerCase();
      if (keywords.some(k => lower.includes(k))) {
        console.log(`  ${name}`);
      }
    }

    console.log('\n=== All unique prefixes ===');
    const prefixes = new Set();
    for (const name of allNames) {
      const parts = name.split('_');
      if (parts.length > 1) {
        prefixes.add(parts[0]);
      }
    }
    for (const p of [...prefixes].sort()) {
      const count = allNames.filter(n => n.startsWith(p + '_')).length;
      if (count >= 3) {
        console.log(`  ${p}_*: ${count} functions`);
      }
    }

    break;
  }
}
