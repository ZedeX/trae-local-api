const http = require('http');

const TRAE_PORT = 9292;

function tryPort(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/json`, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const targets = JSON.parse(data);
          resolve({ port, targets });
        } catch {
          resolve({ port, targets: [] });
        }
      });
    });
    req.on('error', () => resolve({ port, targets: [] }));
    req.setTimeout(3000, () => { req.destroy(); resolve({ port, targets: [] }); });
  });
}

async function main() {
  console.log('Searching for Trae DevTools endpoints...\n');

  const ports = [9292, 9222, 9229, 9333, 9515, 9223];
  const results = await Promise.all(ports.map(tryPort));

  for (const { port, targets } of results) {
    if (targets.length > 0) {
      console.log(`Found DevTools on port ${port}:`);
      for (const t of targets) {
        console.log(`  - ${t.title || t.name}: ${t.webSocketDebuggerUrl || t.url}`);
      }
    }
  }

  const activeResult = results.find(r => r.targets.length > 0);
  if (!activeResult) {
    console.log('No DevTools endpoints found.');
    console.log('\nTrying to find Trae debug port from command line...');

    const { execSync } = require('child_process');
    try {
      const output = execSync(
        'wmic process where "name=\'Trae CN.exe\'" get commandline 2>nul',
        { encoding: 'utf8', timeout: 10000 }
      );
      const lines = output.split('\n').filter(l => l.trim() && !l.includes('CommandLine'));
      for (const line of lines) {
        const portMatch = line.match(/--remote-debugging-port=(\d+)/);
        if (portMatch) {
          console.log('Found debug port:', portMatch[1]);
        }
        if (line.includes('inspect')) {
          console.log('Inspect port found in:', line.trim().substring(0, 100));
        }
      }
    } catch (e) {
      console.log('Could not query process info');
    }
  }
}

main();
