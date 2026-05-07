const fs = require('fs');
const path = require('path');
const os = require('os');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('./uuid');

function getTraeDataDir() {
  const envDir = process.env.TRAE_DATA_DIR;
  if (envDir) return envDir;
  const edition = detectEdition();
  if (edition === 'cn') {
    return path.join(os.homedir(), 'AppData', 'Roaming', 'Trae CN');
  }
  return path.join(os.homedir(), 'AppData', 'Roaming', 'Trae');
}

function detectEdition() {
  const envEdition = process.env.TRAE_EDITION;
  if (envEdition) return envEdition.toLowerCase();

  const cnPath = path.join(os.homedir(), 'AppData', 'Roaming', 'Trae CN', 'User', 'globalStorage', 'storage.json');
  const sgPath = path.join(os.homedir(), 'AppData', 'Roaming', 'Trae', 'User', 'globalStorage', 'storage.json');

  const cnExists = fs.existsSync(cnPath);
  const sgExists = fs.existsSync(sgPath);

  if (cnExists && !sgExists) return 'cn';
  if (!cnExists && sgExists) return 'sg';
  if (cnExists && sgExists) {
    try {
      const cnStat = fs.statSync(cnPath);
      const sgStat = fs.statSync(sgPath);
      return cnStat.mtime > sgStat.mtime ? 'cn' : 'sg';
    } catch (e) {
      return 'sg';
    }
  }
  return 'sg';
}

function getStorageJsonPath(edition) {
  const ed = edition || detectEdition();
  const dataDir = ed === 'cn'
    ? path.join(os.homedir(), 'AppData', 'Roaming', 'Trae CN')
    : path.join(os.homedir(), 'AppData', 'Roaming', 'Trae');
  return path.join(dataDir, 'User', 'globalStorage', 'storage.json');
}

function readStorageJson() {
  const storagePath = getStorageJsonPath();
  if (!fs.existsSync(storagePath)) {
    throw new Error(`storage.json not found at: ${storagePath}`);
  }
  const raw = fs.readFileSync(storagePath, 'utf-8');
  return JSON.parse(raw);
}

function isEncryptedAuthData(raw) {
  if (!raw || typeof raw !== 'string') return true;
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('"')) return false;
  return true;
}

function readStorageJsonByEdition(edition) {
  const dataDir = edition === 'cn'
    ? path.join(os.homedir(), 'AppData', 'Roaming', 'Trae CN')
    : path.join(os.homedir(), 'AppData', 'Roaming', 'Trae');
  const storagePath = path.join(dataDir, 'User', 'globalStorage', 'storage.json');
  if (!fs.existsSync(storagePath)) return null;
  const raw = fs.readFileSync(storagePath, 'utf-8');
  return JSON.parse(raw);
}

function getAuthInfo() {
  const edition = detectEdition();
  const editions = [edition, edition === 'cn' ? 'sg' : 'cn'];

  for (const ed of editions) {
    try {
      const storage = readStorageJsonByEdition(ed);
      if (!storage) continue;

      const authKey = 'iCubeAuthInfo://icube.cloudide';
      const authRaw = storage[authKey];
      if (!authRaw) continue;

      if (isEncryptedAuthData(authRaw)) {
        console.log(`[auth] ${ed.toUpperCase()} edition auth data is encrypted, skipping`);
        continue;
      }

      const auth = JSON.parse(authRaw);
      console.log(`[auth] Using ${ed.toUpperCase()} edition auth data`);
      return {
        token: auth.token,
        refreshToken: auth.refreshToken,
        expiredAt: auth.expiredAt,
        refreshExpiredAt: auth.refreshExpiredAt,
        tokenReleaseAt: auth.tokenReleaseAt,
        userId: auth.userId,
        host: auth.host,
        userRegion: auth.userRegion,
        account: auth.account,
        _edition: ed
      };
    } catch (e) {
      console.log(`[auth] Failed to read ${ed.toUpperCase()} edition: ${e.message}`);
      continue;
    }
  }

  const manualToken = process.env.TRAE_MANUAL_TOKEN;
  if (manualToken && manualToken.startsWith('eyJ')) {
    console.log('[auth] Using manual token from TRAE_MANUAL_TOKEN env');
    const apiHost = process.env.TRAE_API_HOST || 'https://trae-api-cn.mchost.guru';
    try {
      const parts = manualToken.split('.');
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      const expMs = payload.exp * 1000;
      const isExpired = Date.now() > expMs;
      if (isExpired) {
        console.log('[auth] Manual token is expired, exp:', new Date(expMs).toISOString());
      }
      return {
        token: manualToken,
        refreshToken: null,
        expiredAt: new Date(expMs).toISOString(),
        refreshExpiredAt: null,
        tokenReleaseAt: null,
        userId: payload.data?.id || null,
        host: apiHost,
        userRegion: null,
        account: null,
        _edition: 'manual'
      };
    } catch (e) {
      return {
        token: manualToken,
        refreshToken: null,
        expiredAt: null,
        refreshExpiredAt: null,
        tokenReleaseAt: null,
        userId: null,
        host: apiHost,
        userRegion: null,
        account: null,
        _edition: 'manual'
      };
    }
  }

  throw new Error('No readable auth info found in any edition. CN edition data is encrypted and SG edition data is not available.');
}

function getDeviceIds() {
  const edition = detectEdition();
  const editions = [edition, edition === 'cn' ? 'sg' : 'cn'];
  for (const ed of editions) {
    const storage = readStorageJsonByEdition(ed);
    if (storage && storage['telemetry.machineId']) {
      return {
        machineId: storage['telemetry.machineId'] || '',
        sqmId: storage['telemetry.sqmId'] || '',
        devDeviceId: storage['telemetry.devDeviceId'] || ''
      };
    }
  }
  return { machineId: '', sqmId: '', devDeviceId: '' };
}

function isTokenExpired(authInfo) {
  if (!authInfo.expiredAt) return true;
  return new Date(authInfo.expiredAt) < new Date();
}

function isTokenExpiringSoon(authInfo, minutesThreshold) {
  if (!authInfo.expiredAt) return true;
  const expiresAt = new Date(authInfo.expiredAt);
  const threshold = minutesThreshold || 30;
  const warningTime = new Date(Date.now() + threshold * 60 * 1000);
  return expiresAt < warningTime;
}

function getApiHost() {
  const envHost = process.env.TRAE_API_HOST;
  if (envHost) return envHost;

  try {
    const authInfo = getAuthInfo();
    const authEdition = authInfo._edition;
    if (authEdition === 'cn') {
      return 'https://trae-api-cn.mchost.guru';
    }
    const region = authInfo.userRegion?.region?.toUpperCase();
    if (region === 'SG') return 'https://coresg-normal.trae.ai';
    if (region === 'US') return 'https://coreva-normal.trae.ai';
    return 'https://coresg-normal.trae.ai';
  } catch (e) {
    return 'https://coresg-normal.trae.ai';
  }
}

function getAuthHost() {
  try {
    const authInfo = getAuthInfo();
    if (authInfo._edition === 'cn') {
      return 'https://trae-api-cn.mchost.guru';
    }
    return 'https://coresg-normal.trae.ai';
  } catch (e) {
    return 'https://coresg-normal.trae.ai';
  }
}

async function exchangeToken(refreshToken) {
  const authInfo = getAuthInfo();
  const authHost = getAuthHost();
  const url = `${authHost}/cloudide/api/v3/trae/oauth/ExchangeToken`;

  const body = {
    ClientID: 'ono9krqynydwx5',
    RefreshToken: refreshToken,
    ClientSecret: '-',
    UserID: ''
  };

  const fetchOptions = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  };

  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.http_proxy || process.env.ALL_PROXY || process.env.all_proxy || '';
  if (proxyUrl) {
    try {
      if (proxyUrl.startsWith('socks')) {
        const { SocksProxyAgent } = require('socks-proxy-agent');
        fetchOptions.agent = new SocksProxyAgent(proxyUrl);
      } else {
        const { HttpsProxyAgent } = require('https-proxy-agent');
        fetchOptions.agent = new HttpsProxyAgent(proxyUrl);
      }
    } catch (e) {
      console.error(`[auth] proxy setup failed: ${e.message}`);
    }
  }

  const resp = await fetch(url, fetchOptions);

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`ExchangeToken failed: ${resp.status} ${errText}`);
  }

  const data = await resp.json();
  return data;
}

async function refreshTokenIfNeeded() {
  const authInfo = getAuthInfo();

  if (authInfo._edition === 'manual') {
    if (!isTokenExpired(authInfo)) {
      return authInfo;
    }
    throw new Error('Manual token expired. Please update TRAE_MANUAL_TOKEN in .env file.');
  }

  if (!isTokenExpiringSoon(authInfo, 30)) {
    return authInfo;
  }

  console.log(`Token expiring soon or expired (at ${authInfo.expiredAt}), attempting refresh...`);

  try {
    const result = await exchangeToken(authInfo.refreshToken);
    if (result && result.token) {
      const newAuth = {
        ...authInfo,
        token: result.token,
        refreshToken: result.refreshToken || authInfo.refreshToken,
        expiredAt: result.expiredAt,
        refreshExpiredAt: result.refreshExpiredAt || authInfo.refreshExpiredAt,
        tokenReleaseAt: result.tokenReleaseAt || authInfo.tokenReleaseAt
      };

      const storage = readStorageJsonByEdition(authInfo._edition || detectEdition());
      const authKey = 'iCubeAuthInfo://icube.cloudide';
      storage[authKey] = JSON.stringify({
        token: newAuth.token,
        refreshToken: newAuth.refreshToken,
        expiredAt: newAuth.expiredAt,
        refreshExpiredAt: newAuth.refreshExpiredAt,
        tokenReleaseAt: newAuth.tokenReleaseAt,
        userId: newAuth.userId,
        host: newAuth.host,
        userRegion: newAuth.userRegion,
        account: newAuth.account
      });

      const storagePath = getStorageJsonPath(authInfo._edition);
      fs.writeFileSync(storagePath, JSON.stringify(storage, null, '\t'), 'utf-8');
      console.log(`Token refreshed successfully, new expiry: ${newAuth.expiredAt}`);
      return newAuth;
    }
  } catch (err) {
    console.error(`Token refresh failed: ${err.message}`);
    if (isTokenExpired(authInfo)) {
      throw new Error('Token expired and refresh failed. Please restart Trae IDE to re-authenticate.');
    }
  }

  return authInfo;
}

function getIdeVersion() {
  try {
    const authInfo = getAuthInfo();
    if (authInfo._edition === 'cn') return '3.3.55';
    return '3.5.51';
  } catch (e) {
    return '3.5.51';
  }
}

function getIdeVersionCode() {
  return '20260401';
}

function getDeviceInfo() {
  const authInfo = getAuthInfo();
  const storage = readStorageJsonByEdition(authInfo._edition || detectEdition()) || {};
  const machineId = storage['telemetry.machineId'] || '';
  const sqmId = storage['telemetry.sqmId'] || '';
  const devDeviceId = storage['telemetry.devDeviceId'] || '';
  return {
    cpu: 'Intel',
    device_id: hashDeviceId(machineId) || '629333755172936',
    machine_id: machineId || '87ddf83d68c40fe3585c85ced360a8c8adc7647bc06318874feeceba975de97a',
    device_model: '82RF',
    os_name: 'windows',
    os_version: 'Windows 10 Enterprise LTSC 2021'
  };
}

function buildCommonHeaders(authInfo, deviceIds) {
  const deviceInfo = getDeviceInfo();
  const traceId = uuidv4().replace(/-/g, '');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Cloud-IDE-JWT ${authInfo.token}`,
    'X-Cloudide-Token': authInfo.token,
    'x-app-id': '6eefa01c-1036-4c7e-9ca5-d891f63bfcd8',
    'x-app-version': 'default',
    'x-ide-version-code': getIdeVersionCode(),
    'x-app-version-code': getIdeVersionCode(),
    'x-custom-trace-id': traceId,
    'x-device-brand': deviceInfo.device_model,
    'x-device-cpu': deviceInfo.cpu,
    'x-device-id': deviceInfo.device_id,
    'x-machine-id': deviceInfo.machine_id,
    'x-os-version': deviceInfo.os_version,
    'x-device-type': deviceInfo.os_name,
    'x-ide-version': getIdeVersion(),
    'x-ide-version-type': 'stable',
    'request-traffic-type': 'prod',
    'x-uid': authInfo.userId || ''
  };
}

function buildStreamHeaders(authInfo, deviceIds, requestId, lastEventId) {
  const headers = buildCommonHeaders(authInfo, deviceIds);
  headers['Accept'] = 'text/event-stream';
  headers['X-Request-ID'] = requestId || uuidv4();
  headers['X-Trae-Request-ID'] = headers['X-Request-ID'];
  if (lastEventId) {
    headers['Last-Event-ID'] = lastEventId;
  }
  return headers;
}

function hashDeviceId(machineId) {
  if (!machineId) return '';
  let hash = 0;
  for (let i = 0; i < machineId.length; i++) {
    const char = machineId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString().padStart(19, '0');
}

module.exports = {
  getTraeDataDir,
  getStorageJsonPath,
  readStorageJson,
  getAuthInfo,
  getDeviceIds,
  getDeviceInfo,
  isTokenExpired,
  isTokenExpiringSoon,
  getApiHost,
  getAuthHost,
  getIdeVersion,
  getIdeVersionCode,
  exchangeToken,
  refreshTokenIfNeeded,
  buildCommonHeaders,
  buildStreamHeaders,
  hashDeviceId,
  detectEdition
};
