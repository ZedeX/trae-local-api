const http = require('http');
const https = require('https');
const { URL } = require('url');

const CAPTURE_PORT = 9999;
const TARGET_PROXY = 'http://localhost:7891';

const captured = [];
let captureCount = 0;
const MAX_CAPTURE = 30;

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', () => {
    const body = Buffer.concat(chunks).toString();
    const urlStr = req.url;
    const headers = { ...req.headers };
    delete headers['host'];
    delete headers['connection'];
    delete headers['proxy-connection'];

    const captureEntry = {
      id: ++captureCount,
      method: req.method,
      url: urlStr,
      headers: headers,
      body: body ? body.substring(0, 2000) : ''
    };

    if (urlStr.includes('trae.ai') || urlStr.includes('icube') || urlStr.includes('chat') || urlStr.includes('completion') || urlStr.includes('model')) {
      captured.push(captureEntry);
      console.log(`\n=== Captured Request #${captureCount} ===`);
      console.log(`${req.method} ${urlStr}`);
      console.log('Headers:', JSON.stringify(headers, null, 2));
      if (body) {
        try {
          const parsed = JSON.parse(body);
          console.log('Body:', JSON.stringify(parsed, null, 2).substring(0, 1000));
        } catch(e) {
          console.log('Body:', body.substring(0, 500));
        }
      }
      console.log('========================\n');
    }

    let targetUrl;
    try {
      targetUrl = new URL(urlStr);
    } catch(e) {
      res.writeHead(400);
      res.end('Invalid URL');
      return;
    }

    const options = {
      hostname: targetUrl.hostname,
      port: targetUrl.port || 443,
      path: targetUrl.pathname + targetUrl.search,
      method: req.method,
      headers: headers
    };

    const proxyUrl = new URL(TARGET_PROXY);
    const proxyOptions = {
      hostname: proxyUrl.hostname,
      port: proxyUrl.port,
      method: 'CONNECT',
      path: `${targetUrl.hostname}:${targetUrl.port || 443}`
    };

    const connectReq = http.request(proxyOptions);
    connectReq.on('connect', (proxyRes, socket) => {
      const tlsSocket = require('tls').connect({
        socket: socket,
        servername: targetUrl.hostname
      }, () => {
        const httpsReq = https.request({
          method: options.method,
          hostname: targetUrl.hostname,
          port: targetUrl.port || 443,
          path: options.path,
          headers: options.headers,
          socket: tlsSocket,
          agent: false
        }, (targetRes) => {
          const resChunks = [];
          targetRes.on('data', chunk => {
            resChunks.push(chunk);
          });
          targetRes.on('end', () => {
            const resBody = Buffer.concat(resChunks).toString();

            if (captureEntry && (urlStr.includes('chat') || urlStr.includes('completion') || urlStr.includes('model') || urlStr.includes('detail_param'))) {
              console.log(`\n=== Response #${captureCount} ===`);
              console.log(`Status: ${targetRes.statusCode}`);
              console.log(`Body: ${resBody.substring(0, 500)}`);
              console.log('========================\n');
            }

            res.writeHead(targetRes.statusCode, targetRes.headers);
            res.end(resBody);
          });
        });
        httpsReq.on('error', (err) => {
          console.error(`HTTPS request error: ${err.message}`);
          if (!res.headersSent) {
            res.writeHead(502);
            res.end(`Proxy error: ${err.message}`);
          }
        });
        httpsReq.end(body);
      });
    });

    connectReq.on('error', (err) => {
      console.error(`CONNECT error: ${err.message}`);
      if (!res.headersSent) {
        res.writeHead(502);
        res.end(`Proxy connect error: ${err.message}`);
      }
    });

    connectReq.end();
  });
});

server.listen(CAPTURE_PORT, () => {
  console.log(`Capture proxy running on http://localhost:${CAPTURE_PORT}`);
  console.log('Set Trae to use this proxy, then interact with the chat.');
  console.log('Press Ctrl+C to stop and see captured requests.\n');
});

process.on('SIGINT', () => {
  console.log('\n\n=== All Captured Requests Summary ===');
  captured.forEach(entry => {
    console.log(`\n#${entry.id} ${entry.method} ${entry.url}`);
    console.log(`  Auth headers: ${Object.keys(entry.headers).filter(h => h.toLowerCase().includes('auth') || h.toLowerCase().includes('token')).join(', ')}`);
    console.log(`  Body keys: ${entry.body ? Object.keys(JSON.parse(entry.body || '{}')).join(', ') : 'none'}`);
  });
  process.exit(0);
});
