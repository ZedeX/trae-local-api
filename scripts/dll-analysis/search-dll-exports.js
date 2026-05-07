const fs = require('fs');

const dllPath = 'D:\\_program\\Trae-CN\\resources\\app\\modules\\ai-agent\\ai_agent.dll';
const buffer = fs.readFileSync(dllPath);

const searchTerms = [
  'BP_Initialize',
  'BP_',
  'init_aha_ffi',
  'aha_ipc',
  'aha_ffi',
  'FFIServer',
  'ffi_server',
  'ipc_server',
  'ipc_channel',
  'channel_id',
  'jsonrpsee',
  'towel_rpc',
  'towel',
];

for (const term of searchTerms) {
  const tBytes = Buffer.from(term, 'utf8');
  let count = 0;
  for (let i = 0; i < buffer.length - tBytes.length; i++) {
    let found = true;
    for (let j = 0; j < tBytes.length; j++) {
      if (buffer[i + j] !== tBytes[j]) {
        found = false;
        break;
      }
    }
    if (found) {
      count++;
      const start = Math.max(0, i - 30);
      const end = Math.min(buffer.length, i + term.length + 200);
      const context = buffer.slice(start, end).toString('utf8').replace(/[^\x20-\x7e]/g, '.');
      console.log(`\n"${term}" (#${count}) at offset ${i}:`);
      console.log(context);
      if (count >= 3) break;
    }
  }
  if (count === 0) {
    console.log(`\n"${term}": NOT FOUND`);
  }
}

console.log('\n\n=== Searching for PE Export Directory ===');
const peOffset = buffer.readUInt32LE(0x3C);
const peSig = buffer.readUInt32LE(peOffset);
console.log('PE signature:', peSig.toString(16));

if (peSig === 0x4550) {
  const coffHeaderOffset = peOffset + 4;
  const machine = buffer.readUInt16LE(coffHeaderOffset);
  const numberOfSections = buffer.readUInt16LE(coffHeaderOffset + 2);
  const sizeOfOptionalHeader = buffer.readUInt16LE(coffHeaderOffset + 16);
  
  console.log('Machine:', machine.toString(16));
  console.log('Number of sections:', numberOfSections);
  console.log('Size of optional header:', sizeOfOptionalHeader);

  const optionalHeaderOffset = coffHeaderOffset + 20;
  const magic = buffer.readUInt16LE(optionalHeaderOffset);
  console.log('PE type:', magic === 0x20b ? 'PE32+' : 'PE32');

  let exportDirectoryRVA, exportDirectorySize;
  if (magic === 0x20b) {
    exportDirectoryRVA = buffer.readUInt32LE(optionalHeaderOffset + 112);
    exportDirectorySize = buffer.readUInt32LE(optionalHeaderOffset + 116);
  } else {
    exportDirectoryRVA = buffer.readUInt32LE(optionalHeaderOffset + 96);
    exportDirectorySize = buffer.readUInt32LE(optionalHeaderOffset + 100);
  }
  
  console.log('Export Directory RVA:', exportDirectoryRVA.toString(16));
  console.log('Export Directory Size:', exportDirectorySize);

  if (exportDirectoryRVA === 0) {
    console.log('No export directory found');
  } else {
    const sectionHeaderOffset = optionalHeaderOffset + sizeOfOptionalHeader;
    for (let i = 0; i < numberOfSections; i++) {
      const secOffset = sectionHeaderOffset + i * 40;
      const secName = buffer.slice(secOffset, secOffset + 8).toString('ascii').replace(/\0/g, '');
      const virtualSize = buffer.readUInt32LE(secOffset + 8);
      const virtualAddress = buffer.readUInt32LE(secOffset + 12);
      const rawSize = buffer.readUInt32LE(secOffset + 16);
      const rawOffset = buffer.readUInt32LE(secOffset + 20);

      if (exportDirectoryRVA >= virtualAddress && exportDirectoryRVA < virtualAddress + virtualSize) {
        const exportFileOffset = rawOffset + (exportDirectoryRVA - virtualAddress);
        console.log(`\nExport directory in section: ${secName}`);
        console.log('Export directory file offset:', exportFileOffset);

        const numberOfFunctions = buffer.readUInt32LE(exportFileOffset + 20);
        const numberOfNames = buffer.readUInt32LE(exportFileOffset + 24);
        const addressOfFunctions = buffer.readUInt32LE(exportFileOffset + 28);
        const addressOfNames = buffer.readUInt32LE(exportFileOffset + 32);
        const addressOfNameOrdinals = buffer.readUInt32LE(exportFileOffset + 36);

        console.log('Number of functions:', numberOfFunctions);
        console.log('Number of names:', numberOfNames);

        const namesFileOffset = rawOffset + (addressOfNames - virtualAddress);
        const ordinalsFileOffset = rawOffset + (addressOfNameOrdinals - virtualAddress);
        const functionsFileOffset = rawOffset + (addressOfFunctions - virtualAddress);

        console.log('\nExported functions:');
        for (let j = 0; j < Math.min(numberOfNames, 100); j++) {
          const nameRVA = buffer.readUInt32LE(namesFileOffset + j * 4);
          const nameFileOffset = rawOffset + (nameRVA - virtualAddress);
          let nameEnd = nameFileOffset;
          while (buffer[nameEnd] !== 0) nameEnd++;
          const name = buffer.slice(nameFileOffset, nameEnd).toString('ascii');
          const ordinal = buffer.readUInt16LE(ordinalsFileOffset + j * 2);
          const funcRVA = buffer.readUInt32LE(functionsFileOffset + ordinal * 4);
          console.log(`  ${name} (ordinal ${ordinal}, RVA 0x${funcRVA.toString(16)})`);
        }
        break;
      }
    }
  }
}
