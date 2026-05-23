const fetch = require('node-fetch');
const { v4: uuidv4 } = require('./uuid');
const {
  getAuthInfo, getDeviceIds, getApiHost, buildCommonHeaders,
  buildStreamHeaders, isTokenExpired, refreshTokenIfNeeded,
  detectEdition, getDeviceInfo
} = require('./auth');
const trafficLogger = require('./traffic-logger');

const HTTP_PROXY = process.env.HTTP_PROXY || process.env.http_proxy || '';
const HTTPS_PROXY = process.env.HTTPS_PROXY || process.env.https_proxy || '';
const ALL_PROXY = process.env.ALL_PROXY || process.env.all_proxy || '';

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY = 2000;
const RATE_LIMIT_CODES = [4011, 429];

let _httpsAgent = null;
let _socksAgent = null;

function getProxyAgent() {
  if (_httpsAgent) return _httpsAgent;
  if (_socksAgent) return _socksAgent;

  const proxyUrl = HTTPS_PROXY || HTTP_PROXY || ALL_PROXY;
  if (!proxyUrl) return null;

  try {
    if (proxyUrl.startsWith('socks')) {
      const { SocksProxyAgent } = require('socks-proxy-agent');
      _socksAgent = new SocksProxyAgent(proxyUrl);
      console.log(`[proxy] Using SOCKS proxy: ${proxyUrl}`);
      return _socksAgent;
    } else {
      const { HttpsProxyAgent } = require('https-proxy-agent');
      _httpsAgent = new HttpsProxyAgent(proxyUrl);
      console.log(`[proxy] Using HTTP proxy: ${proxyUrl}`);
      return _httpsAgent;
    }
  } catch (err) {
    console.error(`[proxy] Failed to create proxy agent: ${err.message}`);
    return null;
  }
}

function applyProxy(options) {
  const agent = getProxyAgent();
  if (agent) {
    options.agent = agent;
  }
  return options;
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function retryWithBackoff(fn, maxRetries, baseDelay) {
  const retries = maxRetries || MAX_RETRIES;
  const delay = baseDelay || RETRY_BASE_DELAY;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRateLimit = RATE_LIMIT_CODES.some(code => err.message.includes(String(code)));
      const isLastAttempt = attempt === retries;

      if (!isRateLimit || isLastAttempt) {
        throw err;
      }

      const waitTime = delay * Math.pow(2, attempt) + Math.random() * 1000;
      console.log(`[retry] Rate limited, waiting ${Math.round(waitTime / 1000)}s before retry ${attempt + 1}/${retries}...`);
      await sleep(waitTime);
    }
  }
}

const FUNCTION_MAP = {
  'inline_chat': 'inline_chat',
  'solo_coder': 'solo_coder',
  'chat_v3': 'chat_v3',
  'builder_v3': 'builder_v3',
  'system_diagnosis': 'system_diagnosis',
};

const MODEL_TO_FUNCTION = {
  'claude-3.5-sonnet': { function: 'chat_v3', config_name: 'claude-3.5-sonnet' },
  'claude-3.7-sonnet': { function: 'chat_v3', config_name: 'claude-3.7-sonnet' },
  'claude-sonnet-4': { function: 'chat_v3', config_name: 'claude-sonnet-4' },
  'gpt-4o': { function: 'chat_v3', config_name: 'gpt-4o' },
  'gpt-4o-mini': { function: 'chat_v3', config_name: 'gpt-4o-mini' },
  'gemini-2.0-flash': { function: 'chat_v3', config_name: 'gemini-2.0-flash' },
  'gemini-2.5-pro': { function: 'chat_v3', config_name: 'gemini-2.5-pro' },
  'deepseek-v3': { function: 'chat_v3', config_name: 'deepseek-v3' },
  'deepseek-r1': { function: 'chat_v3', config_name: 'deepseek-r1' },
  'doubao-1.5-pro': { function: 'chat_v3', config_name: 'doubao-1.5-pro' },
  'doubao-1-6': { function: 'chat_v3', config_name: 'Doubao_1_6' },
  'glm-5': { function: 'chat_v3', config_name: 'glm-5' },
  'glm-5.1': { function: 'chat_v3', config_name: 'glm-5.1' },
};

const MODEL_MAP = {
  'claude-3.5-sonnet': 'claude-3.5-sonnet',
  'claude-3.7-sonnet': 'claude37',
  'claude-sonnet-4': 'claude-sonnet-4',
  'gpt-4o': 'gpt-4o',
  'gpt-4o-mini': 'gpt-4o-mini',
  'gemini-2.0-flash': 'gemini-2.0-flash',
  'gemini-2.5-pro': 'gemini-2.5-pro',
  'deepseek-v3': 'deepseek-v3',
  'deepseek-r1': 'deepseek-r1',
  'doubao-1.5-pro': 'doubao-1.5-pro',
  'doubao-1-6': 'doubao-1-6',
  'glm-5': 'glm-5',
  'glm-5.1': 'glm-5.1',
  'auto': 'auto'
};

const REVERSE_MODEL_MAP = {};
for (const [k, v] of Object.entries(MODEL_MAP)) {
  REVERSE_MODEL_MAP[v] = k;
}

function resolveModelId(modelName) {
  const lower = modelName.toLowerCase();
  if (MODEL_MAP[lower]) return MODEL_MAP[lower];
  for (const [key, val] of Object.entries(MODEL_MAP)) {
    if (lower.includes(key) || lower.includes(val)) return val;
  }
  return lower;
}

function resolveModelOptions(modelName) {
  const lower = (modelName || '').toLowerCase();
  if (lower === 'auto' || !lower) {
    return { function: 'inline_chat', config_name: null };
  }
  if (MODEL_TO_FUNCTION[lower]) {
    return MODEL_TO_FUNCTION[lower];
  }
  for (const [key, val] of Object.entries(MODEL_TO_FUNCTION)) {
    if (lower.includes(key)) return val;
  }
  return { function: 'chat_v3', config_name: modelName };
}

async function ensureAuth() {
  const authInfo = await refreshTokenIfNeeded();
  const deviceIds = getDeviceIds();
  const apiHost = getApiHost();
  const headers = buildCommonHeaders(authInfo, deviceIds);
  return { authInfo, deviceIds, apiHost, headers };
}

async function llmUtilsChat(messages, model, stream, options) {
  return retryWithBackoff(async () => {
    const { authInfo, deviceIds, apiHost } = await ensureAuth();

    const modelOpts = resolveModelOptions(model);
    const funcName = options?.function || modelOpts.function || 'inline_chat';

    const traeMessages = messages.map(m => ({
      role: m.role,
      content: Array.isArray(m.content)
        ? m.content.map(c => {
            if (typeof c === 'string') return { type: 'text', text: c };
            return c;
          })
        : [{ type: 'text', text: String(m.content || '') }]
    }));

    const body = {
      messages: traeMessages,
      function: funcName,
      stream: stream !== false,
    };

    if (options?.config_name && funcName !== 'inline_chat') {
      body.config_name = options.config_name;
    }

    const modelName = options?.model_name || (model && model !== 'auto' ? model : null);
    if (modelName) {
      body.model = modelName;
    }

    const requestId = uuidv4();
    const headers = buildStreamHeaders(authInfo, deviceIds, requestId);

    const endpoint = `${apiHost}/api/agent/v3/llm_utils_chat`;

    // 记录请求
    const logId = trafficLogger.logRequest('llmUtilsChat', {
      url: endpoint,
      method: 'POST',
      headers: headers,
      body: body
    });

    console.log(`[llmUtilsChat] POST ${endpoint}, function=${funcName}, config_name=${options?.config_name || 'default'}, model=${body.model || 'default'}, stream=${stream}, logId=${logId}`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 300000); // 5 min timeout

    let resp;
    try {
      resp = await fetch(endpoint, applyProxy({
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      }));
      clearTimeout(timeout);
    } catch (err) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        trafficLogger.logError(logId, 'llm_utils_chat request timed out after 300s');
        trafficLogger.finalizeLog(logId);
        throw new Error('llm_utils_chat request timed out after 300s');
      }
      throw err;
    }

    trafficLogger.logResponseStatus(logId, resp.status);

    if (!resp.ok) {
      const errText = await resp.text();
      trafficLogger.logError(logId, `llm_utils_chat failed: ${resp.status} ${errText}`);
      trafficLogger.finalizeLog(logId);
      throw new Error(`llm_utils_chat failed: ${resp.status} ${errText}`);
    }

    if (stream !== false) {
      return {
        body: resp.body,
        function: funcName,
        logId: logId,
      };
    }

    const data = await resp.json();
    trafficLogger.logResponseData(logId, data);
    trafficLogger.finalizeLog(logId);

    return {
      data: data,
      function: funcName,
      logId: logId,
    };
  });
}

async function getModelDetailParam(functionName) {
  const { headers, apiHost } = await ensureAuth();
  const body = {
    function: functionName || 'chat_v3',
    config_names: null,
    need_prompt: false,
    current_config_info: null,
    poly_prompt: true,
    mode_type: null,
    agent_type: null
  };
  const resp = await fetch(`${apiHost}/api/ide/v1/get_detail_param`, applyProxy({
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  }));
  if (!resp.ok) {
    throw new Error(`get_detail_param failed: ${resp.status} ${await resp.text()}`);
  }
  return resp.json();
}

async function getChatModes() {
  const { headers, apiHost } = await ensureAuth();
  const resp = await fetch(`${apiHost}/api/v1/commercial/chat_mode`, applyProxy({
    method: 'POST',
    headers,
    body: JSON.stringify({})
  }));
  if (!resp.ok) {
    throw new Error(`chat_mode failed: ${resp.status} ${await resp.text()}`);
  }
  return resp.json();
}

function generateId() {
  return uuidv4().replace(/-/g, '').substring(0, 24) +
    Date.now().toString(16).slice(-8);
}

async function createAgentTask(messages, model, stream, options) {
  const { authInfo, deviceIds, apiHost } = await ensureAuth();
  const modelId = resolveModelId(model);

  const sessionId = options?.session_id || generateId();
  const taskId = generateId();
  const messageId = generateId();

  const traeMessages = messages.map(m => ({
    role: m.role,
    content: Array.isArray(m.content)
      ? m.content.map(c => {
          if (typeof c === 'string') return { type: 'text', text: c };
          return c;
        })
      : [{ type: 'text', text: m.content || '' }]
  }));

  const workspaceDir = options?.workspace_dir || process.env.WORKSPACE_DIR || '';
  const workspaceId = options?.workspace_id || '';

  const body = {
    session_id: sessionId,
    task_id: taskId,
    message_id: messageId,
    conversation_id: sessionId,
    user_id: authInfo.userId,
    messages: traeMessages,
    model: modelId,
    stream: stream !== false,
    mode_type: 1,
    agent_type: 'builder_v3',
    enable_chat_memory: false,
    workspace_folder: workspaceDir,
    workspace_id: workspaceId,
    workspace_path: workspaceDir,
    user_input: {
      id: messageId,
      user_input: typeof messages[messages.length - 1]?.content === 'string'
        ? messages[messages.length - 1].content
        : '',
      placeholder_map: '{}',
    },
    ide_version: '3.3.55',
    ide_version_code: '20260401',
    device_id: getDeviceInfo().device_id,
    extra_info: JSON.stringify({
      workspace_folder: workspaceDir,
      workspace_id: workspaceId,
      workspace_path: workspaceDir
    }),
  };

  const requestId = uuidv4();
  const headers = buildStreamHeaders(authInfo, deviceIds, requestId);

  const endpoint = `${apiHost}/api/agent/v3/create_agent_task`;

  // 记录请求
  const logId = trafficLogger.logRequest('createAgentTask', {
    url: endpoint,
    method: 'POST',
    headers: headers,
    body: body
  });

  console.log(`[createAgentTask] POST ${endpoint}, model=${modelId}, stream=${stream}, session=${sessionId}, logId=${logId}`);

  const resp = await fetch(endpoint, applyProxy({
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  }));

  trafficLogger.logResponseStatus(logId, resp.status);

  if (!resp.ok) {
    const errText = await resp.text();
    trafficLogger.logError(logId, `create_agent_task failed: ${resp.status} ${errText}`);
    trafficLogger.finalizeLog(logId);
    throw new Error(`create_agent_task failed: ${resp.status} ${errText}`);
  }

  if (stream !== false) {
    return {
      body: resp.body,
      sessionId,
      taskId,
      messageId,
      logId: logId,
    };
  }

  const data = await resp.json();
  trafficLogger.logResponseData(logId, data);
  trafficLogger.finalizeLog(logId);

  return {
    data: data,
    sessionId,
    taskId,
    messageId,
    logId: logId,
  };
}

async function chatCompletion(messages, model, stream, options) {
  const { headers, apiHost } = await ensureAuth();
  const modelId = resolveModelId(model);

  const traeMessages = messages.map(m => ({
    role: m.role,
    content: Array.isArray(m.content)
      ? m.content.map(c => {
          if (typeof c === 'string') return { type: 'text', text: c };
          return c;
        })
      : [{ type: 'text', text: String(m.content || '') }]
  }));

  const body = {
    model: modelId,
    messages: traeMessages,
    stream: !!stream,
    function: 'chat_v3',
    ...options
  };

  const url = `${apiHost}/api/ide/v1/chat`;

  // 记录请求
  const logId = trafficLogger.logRequest('chatCompletion', {
    url: url,
    method: 'POST',
    headers: headers,
    body: body
  });

  console.log(`[chatCompletion] POST ${url}, model=${modelId}, stream=${stream}, logId=${logId}`);

  const resp = await fetch(url, applyProxy({
    method: 'POST',
    headers: {
      ...headers,
      'Accept': stream ? 'text/event-stream' : 'application/json'
    },
    body: JSON.stringify(body)
  }));

  trafficLogger.logResponseStatus(logId, resp.status);

  if (!resp.ok) {
    const errText = await resp.text();
    trafficLogger.logError(logId, `chat completion failed: ${resp.status} ${errText}`);
    trafficLogger.finalizeLog(logId);
    throw new Error(`chat completion failed: ${resp.status} ${errText}`);
  }

  if (stream) {
    return { body: resp.body, logId: logId };
  }

  const data = await resp.json();
  trafficLogger.logResponseData(logId, data);
  trafficLogger.finalizeLog(logId);

  return data;
}

module.exports = {
  MODEL_MAP,
  REVERSE_MODEL_MAP,
  MODEL_TO_FUNCTION,
  FUNCTION_MAP,
  resolveModelId,
  resolveModelOptions,
  getModelDetailParam,
  getChatModes,
  llmUtilsChat,
  chatCompletion,
  createAgentTask,
  generateId,
  retryWithBackoff,
  sleep
};
