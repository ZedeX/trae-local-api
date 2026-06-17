/**
 * Traffic Logger - 记录 Trae API 与上游服务器之间的所有请求和响应
 *
 * 日志保存到 logs/ 目录，按日期和workspace组织：
 *   logs/2026-05-25/
 *     default/
 *       req-000001-llmUtilsChat.json
 *     d-zProject-traelocalapi/
 *       req-000002-llmUtilsChat.json
 *
 * 每个文件包含：
 *   {
 *     "id": "req-000001",
 *     "workspace": "default",
 *     "timestamp": "2026-05-23T10:30:00.000Z",
 *     "type": "llmUtilsChat",
 *     "request": {
 *       "url": "https://trae-api-cn.mchost.guru/api/agent/v3/llm_utils_chat",
 *       "method": "POST",
 *       "headers": { ... },
 *       "body": { ... }
 *     },
 *     "response": {
 *       "status": 200,
 *       "chunks": [ ... ],
 *       "fullContent": "...",
 *       "fullReasoning": "...",
 *       "tokenUsage": { ... },
 *       "duration_ms": 5230
 *     }
 *   }
 */

const fs = require('fs');
const path = require('path');

const LOGS_DIR = path.join(__dirname, '..', 'logs');

// 请求计数器，每天+workspace重置
let dailyCounter = 0;
let currentDate = '';
let currentWorkspace = '';

// 活跃的请求记录（流式响应时暂存）
const activeLogs = new Map();

// Periodic sweep: remove abandoned log entries older than 10 minutes
setInterval(() => {
  const now = Date.now();
  const SWEEP_TIMEOUT = 10 * 60 * 1000; // 10 minutes
  for (const [logId, active] of activeLogs.entries()) {
    const age = now - (active.startTime || 0);
    if (age > SWEEP_TIMEOUT) {
      console.warn(`[traffic-logger] Sweeping abandoned log: ${logId} (age: ${Math.round(age/1000)}s)`);
      try {
        activeLogs.delete(logId);
      } catch (e) {}
    }
  }
}, 5 * 60 * 1000).unref(); // Run every 5 minutes, don't keep process alive

/**
 * 获取今天的日志目录（按workspace分目录）
 */
function getLogDir(workspace) {
  const today = new Date().toISOString().split('T')[0];
  const ws = workspace || 'default';
  // Sanitize workspace for filesystem
  const wsSafe = ws.replace(/[<>:"/\\|?*]/g, '_').replace(/[^a-zA-Z0-9_\-\.\u4e00-\u9fff]/g, '-').substring(0, 64) || 'default';
  if (today !== currentDate || wsSafe !== currentWorkspace) {
    currentDate = today;
    currentWorkspace = wsSafe;
    dailyCounter = 0;
  }
  const dir = path.join(LOGS_DIR, today, wsSafe);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * 获取下一个请求编号
 */
function nextReqNumber() {
  dailyCounter++;
  return String(dailyCounter).padStart(6, '0');
}

/**
 * 生成请求 ID
 */
function generateReqId() {
  return `req-${nextReqNumber()}`;
}

/**
 * 清理 headers 中的敏感信息（token 等）
 */
function sanitizeHeaders(headers) {
  const sanitized = { ...headers };
  const sensitiveKeys = [
    'authorization', 'x-cloudide-token', 'cookie',
    'x-device-id', 'x-machine-id', 'x-uid'
  ];
  for (const key of Object.keys(sanitized)) {
    const lower = key.toLowerCase();
    for (const sensitive of sensitiveKeys) {
      if (lower.includes(sensitive)) {
        const val = String(sanitized[key]);
        sanitized[key] = val.length > 10
          ? val.substring(0, 6) + '***' + val.substring(val.length - 4)
          : '***';
        break;
      }
    }
  }
  return sanitized;
}

/**
 * 记录请求开始
 * @param {string} type - 请求类型 (llmUtilsChat / chatCompletion / createAgentTask)
 * @param {object} params - { url, method, headers, body }
 * @returns {string} logId - 用于后续记录响应
 */
function logRequest(type, params, workspace) {
  const logId = generateReqId();
  const entry = {
    id: logId,
    workspace: workspace || 'default',
    timestamp: new Date().toISOString(),
    type: type,
    request: {
      url: params.url || '',
      method: params.method || 'POST',
      headers: sanitizeHeaders(params.headers || {}),
      body: params.body || null
    },
    response: {
      status: null,
      chunks: [],
      fullContent: '',
      fullReasoning: '',
      tokenUsage: null,
      duration_ms: null
    }
  };

  activeLogs.set(logId, {
    entry,
    startTime: Date.now()
  });

  return logId;
}

/**
 * 记录响应状态
 * @param {string} logId
 * @param {number} status - HTTP 状态码
 */
function logResponseStatus(logId, status) {
  const active = activeLogs.get(logId);
  if (active) {
    active.entry.response.status = status;
  }
}

/**
 * 记录响应中的 SSE chunk
 * @param {string} logId
 * @param {string} eventName - SSE 事件名
 * @param {object} data - 解析后的数据
 */
function logResponseChunk(logId, eventName, data) {
  const active = activeLogs.get(logId);
  if (active) {
    active.entry.response.chunks.push({
      event: eventName,
      data: data,
      ts: Date.now() - active.startTime
    });
  }
}

/**
 * 记录聚合的文本内容
 * @param {string} logId
 * @param {string} content
 * @param {string} reasoning
 */
function logResponseContent(logId, content, reasoning) {
  const active = activeLogs.get(logId);
  if (active) {
    if (content) active.entry.response.fullContent += content;
    if (reasoning) active.entry.response.fullReasoning += reasoning;
  }
}

/**
 * 记录 token 使用量
 * @param {string} logId
 * @param {object} usage
 */
function logTokenUsage(logId, usage) {
  const active = activeLogs.get(logId);
  if (active) {
    // Merge instead of replace — Trae SSE may send multiple token_usage events
    // with partial data (e.g. completion_tokens only in one, full data in another)
    if (!active.entry.response.tokenUsage) {
      active.entry.response.tokenUsage = {};
    }
    Object.assign(active.entry.response.tokenUsage, usage);
  }
}

/**
 * 记录非流式响应的完整数据
 * @param {string} logId
 * @param {object} data
 */
function logResponseData(logId, data) {
  const active = activeLogs.get(logId);
  if (active) {
    active.entry.response.status = 200;
    active.entry.response.fullContent = typeof data === 'string' ? data : JSON.stringify(data);
    active.entry.response.rawData = data;
  }
}

/**
 * 完成请求记录，写入文件
 * @param {string} logId
 * @param {object} [extras] - 额外信息
 */
function finalizeLog(logId, extras) {
  const active = activeLogs.get(logId);
  if (!active) return;

  active.entry.response.duration_ms = Date.now() - active.startTime;

  if (extras) {
    Object.assign(active.entry.response, extras);
  }

  const logDir = getLogDir(active.entry.workspace);
  const filename = `${logId}-${active.entry.type}.json`;
  const filePath = path.join(logDir, filename);

  try {
    fs.writeFileSync(filePath, JSON.stringify(active.entry, null, 2), 'utf-8');
    console.log(`[traffic] Saved: ${filePath} (${active.entry.response.duration_ms}ms, ${active.entry.response.chunks.length} chunks)`);
  } catch (err) {
    console.error(`[traffic] Failed to save log: ${err.message}`);
  }

  activeLogs.delete(logId);
}

/**
 * 记录错误
 * @param {string} logId
 * @param {Error|string} error
 */
function logError(logId, error) {
  const active = activeLogs.get(logId);
  if (active) {
    active.entry.response.error = error instanceof Error
      ? { message: error.message, stack: error.stack }
      : { message: String(error) };
  }
}

/**
 * 获取当前活跃请求数
 */
function getActiveCount() {
  return activeLogs.size;
}

/**
 * 获取活跃请求详情（用于仪表盘）
 */
function getActiveRequests() {
  const requests = [];
  for (const [logId, active] of activeLogs) {
    // 从 chunks 中提取排队位置
    let queuePosition = 0;
    let queueTiming = 0;
    const chunks = active.entry.response.chunks;
    
    // 找最新的排队位置
    for (let i = chunks.length - 1; i >= 0; i--) {
      const c = chunks[i];
      if (c.event === 'request_wait_in_queue') {
        const data = c.data || {};
        queuePosition = data.data?.position || data.position || 0;
        break;
      }
    }
    
    // 从 timing_cost 提取排队时间
    for (const c of chunks) {
      if (c.event === 'timing_cost') {
        const data = c.data || {};
        queueTiming = data.queue_timing || data.data?.queue_timing || 0;
        break;
      }
    }
    
    requests.push({
      id: logId,
      workspace: active.entry.workspace,
      type: active.entry.type,
      startTime: new Date(active.startTime).toISOString(),
      elapsed_ms: Date.now() - active.startTime,
      chunkCount: chunks.length,
      queuePosition: queuePosition,
      queueTiming: queueTiming
    });
  }
  return requests;
}

/**
 * 获取所有日志目录的列表
 */
function getLogDirectories() {
  const result = [];
  if (!fs.existsSync(LOGS_DIR)) return result;
  const dates = fs.readdirSync(LOGS_DIR).filter(d => {
    const dp = path.join(LOGS_DIR, d);
    return fs.statSync(dp).isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(d);
  });
  for (const date of dates.sort().reverse()) {
    const dateDir = path.join(LOGS_DIR, date);
    const workspaces = fs.readdirSync(dateDir).filter(w => fs.statSync(path.join(dateDir, w)).isDirectory());
    for (const ws of workspaces.sort()) {
      const wsDir = path.join(dateDir, ws);
      const files = fs.readdirSync(wsDir).filter(f => f.endsWith('.json'));
      result.push({ date, workspace: ws, fileCount: files.length, path: wsDir });
    }
  }
  return result;
}

/**
 * 从 tokenUsage 对象中安全提取字段值
 * tokenUsage 可能是 {prompt_tokens: N, completion_tokens: N, total_tokens: N}
 * 也可能被 Trae SSE 嵌套为 {type:"token_usage", data:{prompt_tokens:N, ...}}
 */
function extractTokenField(tokenUsage, snakeKey, camelKey) {
  if (!tokenUsage || typeof tokenUsage !== 'object') return 0;
  // Direct access (snake_case)
  if (typeof tokenUsage[snakeKey] === 'number') return tokenUsage[snakeKey];
  // Direct access (camelCase)
  if (typeof tokenUsage[camelKey] === 'number') return tokenUsage[camelKey];
  // Nested: {data: {prompt_tokens: N, ...}} (Trae SSE wraps token data)
  if (tokenUsage.data && typeof tokenUsage.data === 'object') {
    if (typeof tokenUsage.data[snakeKey] === 'number') return tokenUsage.data[snakeKey];
    if (typeof tokenUsage.data[camelKey] === 'number') return tokenUsage.data[camelKey];
    // Double-nested: {data: {data: {prompt_tokens: N, ...}}}
    if (tokenUsage.data.data && typeof tokenUsage.data.data === 'object') {
      if (typeof tokenUsage.data.data[snakeKey] === 'number') return tokenUsage.data.data[snakeKey];
      if (typeof tokenUsage.data.data[camelKey] === 'number') return tokenUsage.data.data[camelKey];
    }
  }
  return 0;
}

/**
 * 读取最近的日志条目（用于仪表盘）
 */
function readRecentLogs(workspace, limit = 50, offset = 0) {
  const entries = [];
  const dirs = getLogDirectories();
  for (const dir of dirs) {
    if (workspace && dir.workspace !== workspace) continue;
    const files = fs.readdirSync(dir.path).filter(f => f.endsWith('.json')).sort().reverse();
    for (const fname of files) {
      if (entries.length >= offset + limit) break;
      try {
        const content = fs.readFileSync(path.join(dir.path, fname), 'utf-8');
        const entry = JSON.parse(content);
        // Lightweight: exclude heavy arrays from list view
        entries.push({
          id: entry.id,
          workspace: entry.workspace,
          timestamp: entry.timestamp,
          type: entry.type,
          model: entry.request?.body?.model || entry.request?.body?.function || 'auto',
          status: entry.response?.status || 0,
          duration_ms: entry.response?.duration_ms,
          tokens: extractTokenField(entry.response?.tokenUsage, 'total_tokens', 'totalTokens'),
          promptTokens: extractTokenField(entry.response?.tokenUsage, 'prompt_tokens', 'promptTokens'),
          completionTokens: extractTokenField(entry.response?.tokenUsage, 'completion_tokens', 'completionTokens'),
          contentLength: (entry.response?.fullContent || '').length,
          chunkCount: (entry.response?.chunks || []).length
        });
      } catch (e) {
        // Skip corrupt files
      }
    }
    if (entries.length >= offset + limit) break;
  }
  return entries.slice(offset, offset + limit);
}

/**
 * 读取完整的单条日志
 */
function readLogEntry(date, workspace, logId) {
  const dir = path.join(LOGS_DIR, date, workspace);
  // Files are saved as ${logId}-${type}.json, so glob for the pattern
  try {
    if (!fs.existsSync(dir)) return null;
    const files = fs.readdirSync(dir);
    const match = files.find(f => f.startsWith(logId + '-') && f.endsWith('.json'));
    if (!match) {
      // Also try exact match (legacy format)
      const exactPath = path.join(dir, `${logId}.json`);
      if (fs.existsSync(exactPath)) {
        return JSON.parse(fs.readFileSync(exactPath, 'utf-8'));
      }
      return null;
    }
    return JSON.parse(fs.readFileSync(path.join(dir, match), 'utf-8'));
  } catch (e) {
    return null;
  }
}

function getActiveRequestDetail(logId) {
  const active = activeLogs.get(logId);
  if (!active) return null;
  const entry = active.entry;
  const chunks = entry.response.chunks || [];
  let queuePosition = 0;
  for (let i = chunks.length - 1; i >= 0; i--) {
    const c = chunks[i];
    if (c.event === 'request_wait_in_queue') {
      const data = c.data || {};
      queuePosition = data.data?.position || data.position || 0;
      break;
    }
  }
  return {
    id: entry.id,
    workspace: entry.workspace,
    timestamp: entry.timestamp,
    type: entry.type,
    request: {
      url: entry.request.url,
      method: entry.request.method,
      body: entry.request.body
    },
    response: {
      status: entry.response.status,
      fullContent: entry.response.fullContent || '',
      fullReasoning: entry.response.fullReasoning || '',
      tokenUsage: entry.response.tokenUsage,
      duration_ms: Date.now() - active.startTime,
      chunkCount: chunks.length,
      queuePosition
    },
    isActive: true
  };
}

module.exports = {
  logRequest,
  logResponseStatus,
  logResponseChunk,
  logResponseContent,
  logTokenUsage,
  logResponseData,
  logError,
  finalizeLog,
  getActiveCount,
  getActiveRequests,
  getActiveRequestDetail,
  getLogDirectories,
  readRecentLogs,
  readLogEntry,
  extractTokenField
};
