/**
 * Traffic Logger - 记录 Trae API 与上游服务器之间的所有请求和响应
 *
 * 日志保存到 logs/ 目录，按日期组织：
 *   logs/2026-05-23/
 *     req-001-llmUtilsChat.json   - 完整的请求+响应记录
 *     req-002-chatCompletion.json
 *     ...
 *
 * 每个文件包含：
 *   {
 *     "id": "req-001",
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
 *       "chunks": [ ... ],       // 原始 SSE 事件列表
 *       "fullContent": "...",    // 聚合的文本内容
 *       "fullReasoning": "...",  // 聚合的推理内容
 *       "tokenUsage": { ... },   // token 使用量
 *       "duration_ms": 5230      // 总耗时
 *     }
 *   }
 */

const fs = require('fs');
const path = require('path');

const LOGS_DIR = path.join(__dirname, '..', 'logs');

// 请求计数器，每天重置
let dailyCounter = 0;
let currentDate = '';

// 活跃的请求记录（流式响应时暂存）
const activeLogs = new Map();

/**
 * 获取今天的日志目录
 */
function getLogDir() {
  const today = new Date().toISOString().split('T')[0];
  if (today !== currentDate) {
    currentDate = today;
    dailyCounter = 0;
  }
  const dir = path.join(LOGS_DIR, today);
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
  return String(dailyCounter).padStart(3, '0');
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
function logRequest(type, params) {
  const logId = generateReqId();
  const entry = {
    id: logId,
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
    active.entry.response.tokenUsage = usage;
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

  const logDir = getLogDir();
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

module.exports = {
  logRequest,
  logResponseStatus,
  logResponseChunk,
  logResponseContent,
  logTokenUsage,
  logResponseData,
  logError,
  finalizeLog,
  getActiveCount
};
