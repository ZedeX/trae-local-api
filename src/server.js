const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const { getAuthInfo, getDeviceIds, isTokenExpired, getApiHost, refreshTokenIfNeeded, detectEdition } = require('./auth');
const { llmUtilsChat, chatCompletion, createAgentTask, getModelDetailParam, getChatModes, resolveModelId, MODEL_MAP, REVERSE_MODEL_MAP, FUNCTION_MAP, getFallbackConfig, saveFallbackConfig, getFallbackChain, getRaceModels, isRaceFallbackEnabled, getTiers, getModelsInTier, getTierOfModel, isTieredFallbackEnabled, isRaceWithinTierEnabled, getFallbackModel, getSameTierModels, getNextTierModels, findMultimodalModel, getModelConfig, saveModelConfig, rebuildDerivedMaps } = require('./trae-client');
const { createOpenAIChatCompletion, createOpenAIStreamChunk, createOpenAIModels, parseLlmUtilsChatStream, llmUtilsChunkToOpenAI, parseAgentTaskStream, parseTraeStreamChunk, traeChunkToOpenAI } = require('./openai-format');
const {
  createAnthropicMessage,
  createAnthropicMessageStart,
  createAnthropicContentBlockStart,
  createAnthropicContentBlockDelta,
  createAnthropicContentBlockStop,
  createAnthropicMessageDelta,
  createAnthropicMessageStop,
  createAnthropicError,
  anthropicToOpenAIMessages,
  llmUtilsChunkToAnthropic
} = require('./anthropic-format');
const { encrypt, decrypt, hashContent } = require('./crypto');
const { v4: uuidv4 } = require('./uuid');
const trafficLogger = require('./traffic-logger');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const API_KEY = process.env.API_KEY || 'trae-local-api-key';
const PORT = process.env.PORT || 19900;
const WORKSPACE_DIR = process.env.WORKSPACE_DIR || '';
const OUTPUT_SYNC_DIR = process.env.OUTPUT_SYNC_DIR || '';
const AUTO_CONTINUE = process.env.AUTO_CONTINUE !== 'false'; // default true
const MAX_CONTINUES = parseInt(process.env.MAX_CONTINUES || '5', 10);

const pendingSyncFiles = [];

/**
 * Detect if the model response was truncated and should be auto-continued.
 * Returns true if the response seems incomplete.
 */
function isResponseTruncated(state) {
  if (!state || !state.messageStarted) return false;

  if (state.hasToolUse) return false;

  if (state.stopReason === 'max_tokens') return true;

  const text = state.textContent || '';
  const reasoning = state.reasoningContent || '';

  if (!text && !state.hasToolUse && reasoning.length > 0) return true;

  if (!state.hasToolUse && reasoning.length > 0 && text.length < 200) return true;

  if (!text) return false;

  // Open code block (``` without closing ```)
  const codeBlockOpens = (text.match(/```/g) || []).length;
  if (codeBlockOpens % 2 !== 0) return true;

  // Unclosed brackets/braces/parens at the end (common in code output)
  const last100 = text.slice(-100).trim();
  const openBrackets = (last100.match(/[\[{(]/g) || []).length;
  const closeBrackets = (last100.match(/[\]})]/g) || []).length;
  if (openBrackets > closeBrackets + 2) return true;

  // Ends mid-sentence (common truncation patterns)
  const truncatedEndings = [
    /,\s*$/,           // trailing comma
    /\|\s*$/,          // trailing pipe (table)
    /\.\.\.\s*$/,      // ellipsis
    /\\\s*$/,          // trailing backslash
    /\/\/\s*$/,        // trailing comment
    /#\s*$/,           // trailing hash comment
    /-\s*$/,           // trailing dash (list item)
  ];
  for (const pattern of truncatedEndings) {
    if (pattern.test(last100)) return true;
  }

  return false;
}

function syncFileToOutput(srcPath) {
  if (!OUTPUT_SYNC_DIR) return;
  try {
    const relPath = path.relative(WORKSPACE_DIR, srcPath);
    if (relPath.startsWith('..')) return;
    const destPath = path.join(OUTPUT_SYNC_DIR, relPath);
    const destDir = path.dirname(destPath);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(srcPath, destPath);
    console.log(`[sync] ${srcPath} -> ${destPath}`);
  } catch (e) {
    console.log(`[sync] Queued for external sync: ${srcPath}`);
    pendingSyncFiles.push(srcPath);
  }
}

function authenticate(req, res, next) {
  let token = null;
  
  if (req.headers['authorization']) {
    token = req.headers['authorization'].replace('Bearer ', '');
  } else if (req.headers['x-api-key']) {
    token = req.headers['x-api-key'];
  } else if (req.query?.key) {
    token = req.query.key;
  }
  
  if (!token) {
    return res.status(401).json({ error: { message: 'Missing API key (Authorization header, x-api-key, or ?key= query param)', type: 'auth_error' } });
  }
  
  if (token !== API_KEY) {
    return res.status(401).json({ error: { message: 'Invalid API key', type: 'auth_error' } });
  }
  next();
}

app.get('/v1/models', authenticate, (req, res) => {
  const models = Object.keys(MODEL_MAP);
  const functions = Object.keys(FUNCTION_MAP);
  res.json(createOpenAIModels([...models, ...functions]));
});

function handleLlmUtilsStream(responseBody, res, completionId, modelName, saveToPath, logId) {
  let buffer = '';
  let currentEventName = '';
  let fullContent = '';
  let fullReasoning = '';
  let tokenUsage = null;
  let llmFinalized = false;

  const finalizeLlmLog = () => {
    if (llmFinalized) return;
    llmFinalized = true;
    if (logId) trafficLogger.finalizeLog(logId, { fullContent, fullReasoning, tokenUsage });
  };

  responseBody.on('data', (chunk) => {
    try {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const parsed = parseLlmUtilsChatStream(trimmed, currentEventName);
        if (!parsed) continue;

        if (parsed._type === 'event_name') {
          currentEventName = parsed.value;
          if (logId) trafficLogger.logResponseChunk(logId, currentEventName, null);
          continue;
        }

        if (logId) trafficLogger.logResponseChunk(logId, currentEventName, parsed);

        if (parsed.type === 'token_usage') {
          tokenUsage = parsed.data;
          if (logId) trafficLogger.logTokenUsage(logId, tokenUsage);
          continue;
        }

        if (parsed.type === 'done') {
          const usage = tokenUsage ? {
            prompt_tokens: tokenUsage.prompt_tokens || 0,
            completion_tokens: tokenUsage.completion_tokens || 0,
            total_tokens: tokenUsage.total_tokens || 0,
          } : undefined;

          if (saveToPath && fullContent) {
            try {
              const dir = path.dirname(saveToPath);
              if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
              fs.writeFileSync(saveToPath, fullContent, 'utf-8');
              console.log(`[file] Saved to: ${saveToPath}`);
              syncFileToOutput(saveToPath);
              const savedChunk = createOpenAIStreamChunk(completionId, modelName, {
                content: `\n\n[File saved: ${saveToPath}]`
              }, null);
              if (!res.writableEnded) res.write(`data: ${JSON.stringify(savedChunk)}\n\n`);
            } catch (fileErr) {
              console.error(`[file] Save failed: ${fileErr.message}`);
              const errChunk = createOpenAIStreamChunk(completionId, modelName, {
                content: `\n\n[File save failed: ${fileErr.message}]`
              }, null);
              if (!res.writableEnded) res.write(`data: ${JSON.stringify(errChunk)}\n\n`);
            }
          }

          if (!res.writableEnded) {
            const doneChunk = createOpenAIStreamChunk(completionId, modelName, {}, parsed.finish_reason || 'stop');
            res.write(`data: ${JSON.stringify(doneChunk)}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
          }

          if (logId) trafficLogger.finalizeLog(logId, { fullContent, fullReasoning, tokenUsage });
          return;
        }

        const openaiChunk = llmUtilsChunkToOpenAI(parsed, completionId, modelName, true);
        if (openaiChunk) {
          if (parsed.type === 'text' && parsed.content) {
            fullContent += parsed.content;
            if (logId) trafficLogger.logResponseContent(logId, parsed.content, null);
          }
          if (parsed.type === 'text' && parsed.reasoning) {
            fullReasoning += parsed.reasoning;
            if (logId) trafficLogger.logResponseContent(logId, null, parsed.reasoning);
          }
          if (!res.writableEnded) res.write(`data: ${JSON.stringify(openaiChunk)}\n\n`);
        }
      }
    } catch (err) {
      console.error('[stream] Error in data callback:', err);
      if (logId) trafficLogger.logError(logId, err);
      try { responseBody.destroy(); } catch (e) {}
      if (!res.writableEnded) {
        try {
          const errChunk = createOpenAIStreamChunk(completionId, modelName, { content: `\n\n[Stream error: ${err.message}]` }, 'stop');
          res.write(`data: ${JSON.stringify(errChunk)}\n\n`);
          res.write('data: [DONE]\n\n');
          res.end();
        } catch (e) {}
      }
    }
  });

  responseBody.on('end', () => {
    if (!res.writableEnded) {
      const doneChunk = createOpenAIStreamChunk(completionId, modelName, {}, 'stop');
      res.write(`data: ${JSON.stringify(doneChunk)}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    }
    finalizeLlmLog();
  });

  responseBody.on('close', () => {
    finalizeLlmLog();
  });

  responseBody.on('error', (err) => {
    console.error('[stream] error:', err);
    if (logId) trafficLogger.logError(logId, err);
    finalizeLlmLog();
    if (!res.writableEnded) {
      const errChunk = createOpenAIStreamChunk(completionId, modelName, { content: `\n\n[Error: ${err.message}]` }, 'stop');
      res.write(`data: ${JSON.stringify(errChunk)}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    }
  });
}

function handleLegacyStream(responseBody, res, completionId, modelName) {
  let buffer = '';

  responseBody.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const parsed = parseAgentTaskStream(trimmed) || parseTraeStreamChunk(trimmed);
      if (!parsed) continue;

      if (parsed.done) {
        const doneChunk = createOpenAIStreamChunk(completionId, modelName, {}, 'stop');
        res.write(`data: ${JSON.stringify(doneChunk)}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
        return;
      }

      const openaiChunk = traeChunkToOpenAI(parsed, completionId, modelName);
      if (openaiChunk) {
        res.write(`data: ${JSON.stringify(openaiChunk)}\n\n`);
      }
    }
  });

  responseBody.on('end', () => {
    if (!res.writableEnded) {
      const doneChunk = createOpenAIStreamChunk(completionId, modelName, {}, 'stop');
      res.write(`data: ${JSON.stringify(doneChunk)}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    }
  });

  responseBody.on('error', (err) => {
    console.error('[stream] error:', err);
    if (!res.writableEnded) {
      const errChunk = createOpenAIStreamChunk(completionId, modelName, { content: `\n\n[Error: ${err.message}]` }, 'stop');
      res.write(`data: ${JSON.stringify(errChunk)}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    }
  });
}

app.post('/v1/chat/completions', authenticate, async (req, res) => {
  const reqId = uuidv4().substring(0, 8);
  const startTime = Date.now();

  try {
    const { messages, model, stream, temperature, max_tokens, function: funcName, config_name, workspace_dir, save_to } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: { message: 'messages is required and must be a non-empty array', type: 'invalid_request_error' } });
    }

    const modelName = model || 'auto';
    const isStream = stream !== false;

    console.log(`[openai ${reqId}] POST /v1/chat/completions model=${modelName} stream=${isStream} messages=${messages.length} function=${funcName || 'auto'}`);
    const completionId = `chatcmpl-${uuidv4()}`;

    let saveToPath = null;
    if (save_to) {
      const wsDir = workspace_dir || WORKSPACE_DIR;
      if (path.isAbsolute(save_to)) {
        saveToPath = save_to;
      } else if (wsDir) {
        saveToPath = path.join(wsDir, save_to);
      } else {
        return res.status(400).json({ error: { message: 'save_to requires workspace_dir or WORKSPACE_DIR env', type: 'invalid_request_error' } });
      }
    }

    const authInfo = await refreshTokenIfNeeded();
    if (isTokenExpired(authInfo)) {
      return res.status(401).json({ error: { message: 'Trae token expired. Please restart Trae IDE to refresh.', type: 'auth_error' } });
    }

    const options = {};
    if (funcName) options.function = funcName;
    if (config_name) options.config_name = config_name;
    if (workspace_dir) options.workspace_dir = workspace_dir;
    options.workspace = extractWorkspace(req);

    if (isStream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      const roleChunk = createOpenAIStreamChunk(completionId, modelName, { role: 'assistant' }, null);
      res.write(`data: ${JSON.stringify(roleChunk)}\n\n`);

      try {
        const result = await llmUtilsChat(messages, modelName, true, options);

        if (result.body) {
          handleLlmUtilsStream(result.body, res, completionId, modelName, saveToPath, result.logId);
          req.on('close', () => {
            if (result.body && result.body.destroy) result.body.destroy();
          });
        } else {
          const doneChunk = createOpenAIStreamChunk(completionId, modelName, {}, 'stop');
          res.write(`data: ${JSON.stringify(doneChunk)}\n\n`);
          res.write('data: [DONE]\n\n');
          res.end();
        }
      } catch (llmErr) {
        console.log(`[llmUtilsChat] failed: ${llmErr.message}, falling back to chatCompletion`);

        try {
          const responseBody = await chatCompletion(messages, modelName, true, options);
          handleLegacyStream(responseBody, res, completionId, modelName);
          req.on('close', () => {
            if (responseBody && responseBody.destroy) responseBody.destroy();
          });
        } catch (chatErr) {
          console.log(`[chatCompletion] failed: ${chatErr.message}, falling back to createAgentTask`);

          try {
            const agentResult = await createAgentTask(messages, modelName, true, options);
            if (agentResult.body) {
              handleLegacyStream(agentResult.body, res, completionId, modelName);
              req.on('close', () => {
                if (agentResult.body && agentResult.body.destroy) agentResult.body.destroy();
              });
            } else {
              const doneChunk = createOpenAIStreamChunk(completionId, modelName, {}, 'stop');
              res.write(`data: ${JSON.stringify(doneChunk)}\n\n`);
              res.write('data: [DONE]\n\n');
              res.end();
            }
          } catch (agentErr) {
            console.error('All endpoints failed:', agentErr);
            if (!res.writableEnded) {
              const errChunk = createOpenAIStreamChunk(completionId, modelName, { content: `[Error: ${agentErr.message}]` }, 'stop');
              res.write(`data: ${JSON.stringify(errChunk)}\n\n`);
              res.write('data: [DONE]\n\n');
              res.end();
            }
          }
        }
      }
    } else {
      try {
        const result = await llmUtilsChat(messages, modelName, true, options);
        let fullContent = '';
        let fullReasoning = '';
        let tokenUsage = null;
        let finishReason = 'stop';
        const upstreamLogId = result.logId;

        if (result.body) {
          await new Promise((resolve, reject) => {
            let buffer = '';
            let currentEventName = '';

            result.body.on('data', (chunk) => {
              buffer += chunk.toString();
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;

                const parsed = parseLlmUtilsChatStream(trimmed, currentEventName);
                if (!parsed) continue;

                if (parsed._type === 'event_name') {
                  currentEventName = parsed.value;
                  if (upstreamLogId) trafficLogger.logResponseChunk(upstreamLogId, currentEventName, null);
                  continue;
                }

                if (upstreamLogId) trafficLogger.logResponseChunk(upstreamLogId, currentEventName, parsed);

                if (parsed.type === 'token_usage') {
                  tokenUsage = parsed.data;
                  if (upstreamLogId) trafficLogger.logTokenUsage(upstreamLogId, tokenUsage);
                  continue;
                }

                if (parsed.type === 'done') {
                  finishReason = parsed.finish_reason || 'stop';
                  continue;
                }

                if (parsed.type === 'text' && parsed.content) {
                  fullContent += parsed.content;
                  if (upstreamLogId) trafficLogger.logResponseContent(upstreamLogId, parsed.content, null);
                }
                if (parsed.type === 'text' && parsed.reasoning) {
                  fullReasoning += parsed.reasoning;
                  if (upstreamLogId) trafficLogger.logResponseContent(upstreamLogId, null, parsed.reasoning);
                }
              }
            });

            result.body.on('end', resolve);
            result.body.on('error', reject);
          });
        }

        const usage = tokenUsage ? {
          prompt_tokens: tokenUsage.prompt_tokens || 0,
          completion_tokens: tokenUsage.completion_tokens || 0,
          total_tokens: tokenUsage.total_tokens || 0,
        } : undefined;

        const response = createOpenAIChatCompletion(completionId, modelName, fullContent, finishReason, fullReasoning, usage);

        if (upstreamLogId) trafficLogger.finalizeLog(upstreamLogId, { fullContent, fullReasoning, tokenUsage });

        if (saveToPath && fullContent) {
          try {
            const dir = path.dirname(saveToPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(saveToPath, fullContent, 'utf-8');
            console.log(`[file] Saved to: ${saveToPath}`);
            syncFileToOutput(saveToPath);
            response.saved_to = saveToPath;
          } catch (fileErr) {
            console.error(`[file] Save failed: ${fileErr.message}`);
            response.save_error = fileErr.message;
          }
        }

        res.json(response);
      } catch (llmErr) {
        console.log(`[llmUtilsChat] non-stream failed: ${llmErr.message}, falling back`);

        let content = '';
        try {
          const responseBody = await chatCompletion(messages, modelName, true, options);
          await new Promise((resolve, reject) => {
            let buffer = '';

            responseBody.on('data', (chunk) => {
              buffer += chunk.toString();
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;

                const parsed = parseAgentTaskStream(trimmed) || parseTraeStreamChunk(trimmed);
                if (!parsed) continue;

                if (parsed.done) {
                  return;
                }

                if (parsed.content) {
                  content += parsed.content;
                }
              }
            });

            responseBody.on('end', resolve);
            responseBody.on('error', reject);
          });
        } catch (chatErr) {
          try {
            const agentResult = await createAgentTask(messages, modelName, true, options);
            if (agentResult.body) {
              await new Promise((resolve, reject) => {
                let buffer = '';

                agentResult.body.on('data', (chunk) => {
                  buffer += chunk.toString();
                  const lines = buffer.split('\n');
                  buffer = lines.pop() || '';

                  for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) continue;

                    const parsed = parseAgentTaskStream(trimmed) || parseTraeStreamChunk(trimmed);
                    if (!parsed) continue;

                    if (parsed.content) {
                      content += parsed.content;
                    }
                  }
                });

                agentResult.body.on('end', resolve);
                agentResult.body.on('error', reject);
              });
            }
          } catch (agentErr) {
            throw new Error(`All endpoints failed: [llm] ${llmErr.message} [chat] ${chatErr.message} [agent] ${agentErr.message}`);
          }
        }

        const response = createOpenAIChatCompletion(completionId, modelName, content, 'stop');
        res.json(response);
      }
    }
  } catch (err) {
    console.error('Chat completion error:', err);
    res.status(500).json({
      error: {
        message: err.message,
        type: 'internal_error'
      }
    });
  }
});

app.get('/v1/status', authenticate, async (req, res) => {
  try {
    const authInfo = await refreshTokenIfNeeded();
    const deviceIds = getDeviceIds();
    const apiHost = getApiHost();
    const edition = detectEdition();
    res.json({
      status: 'ok',
      edition: edition,
      token_expired: isTokenExpired(authInfo),
      token_expires_at: authInfo.expiredAt,
      user_id: authInfo.userId,
      user_region: authInfo.userRegion,
      api_host: apiHost,
      account: authInfo.account?.username,
      workspace_dir: WORKSPACE_DIR,
      auto_continue: AUTO_CONTINUE,
      max_continues: MAX_CONTINUES,
      device_ids: {
        machine_id: deviceIds.machineId ? deviceIds.machineId.substring(0, 8) + '...' : 'N/A'
      }
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.post('/v1/encrypt', authenticate, (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'text is required' });
    const encrypted = encrypt(text);
    res.json({ encrypted, hash: hashContent(text) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/v1/decrypt', authenticate, (req, res) => {
  try {
    const { encrypted } = req.body;
    if (!encrypted) return res.status(400).json({ error: 'encrypted is required' });
    const decrypted = decrypt(encrypted);
    res.json({ decrypted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/v1/models/detail', authenticate, async (req, res) => {
  try {
    const funcName = req.query.function || 'chat_v3';
    const result = await getModelDetailParam(funcName);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/v1/chat/modes', authenticate, async (req, res) => {
  try {
    const result = await getChatModes();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/v1/chat/file', authenticate, async (req, res) => {
  try {
    const { messages, model, function: funcName, filename, workspace_dir, overwrite } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: { message: 'messages is required', type: 'invalid_request_error' } });
    }
    if (!filename) {
      return res.status(400).json({ error: { message: 'filename is required (e.g. "output.md" or "report.html")', type: 'invalid_request_error' } });
    }

    const wsDir = workspace_dir || WORKSPACE_DIR;
    if (!wsDir) {
      return res.status(400).json({ error: { message: 'workspace_dir or WORKSPACE_DIR env is required', type: 'invalid_request_error' } });
    }

    const saveToPath = path.isAbsolute(filename) ? filename : path.join(wsDir, filename);

    if (fs.existsSync(saveToPath) && !overwrite) {
      return res.status(409).json({ error: { message: `File already exists: ${saveToPath}. Set overwrite=true to replace.`, type: 'file_exists', path: saveToPath } });
    }

    const modelName = model || 'auto';
    const options = {};
    if (funcName) options.function = funcName;
    options.workspace = extractWorkspace(req);

    const completionId = `chatcmpl-${uuidv4()}`;

    const authInfo = await refreshTokenIfNeeded();
    if (isTokenExpired(authInfo)) {
      return res.status(401).json({ error: { message: 'Trae token expired', type: 'auth_error' } });
    }

    console.log(`[chat/file] Generating file: ${saveToPath}`);

    const result = await llmUtilsChat(messages, modelName, true, options);
    let fullContent = '';
    let fullReasoning = '';
    let tokenUsage = null;
    let finishReason = 'stop';

    if (result.body) {
      await new Promise((resolve, reject) => {
        let buffer = '';
        let currentEventName = '';

        result.body.on('data', (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            const parsed = parseLlmUtilsChatStream(trimmed, currentEventName);
            if (!parsed) continue;

            if (parsed._type === 'event_name') {
              currentEventName = parsed.value;
              continue;
            }
            if (parsed.type === 'token_usage') {
              tokenUsage = parsed.data;
              continue;
            }
            if (parsed.type === 'done') {
              finishReason = parsed.finish_reason || 'stop';
              continue;
            }
            if (parsed.type === 'text' && parsed.content) {
              fullContent += parsed.content;
            }
            if (parsed.type === 'text' && parsed.reasoning) {
              fullReasoning += parsed.reasoning;
            }
          }
        });

        result.body.on('end', resolve);
        result.body.on('error', reject);
      });
    }

    const dir = path.dirname(saveToPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(saveToPath, fullContent, 'utf-8');
    console.log(`[file] Saved to: ${saveToPath} (${fullContent.length} chars)`);
    syncFileToOutput(saveToPath);

    const usage = tokenUsage ? {
      prompt_tokens: tokenUsage.prompt_tokens || 0,
      completion_tokens: tokenUsage.completion_tokens || 0,
      total_tokens: tokenUsage.total_tokens || 0,
    } : undefined;

    res.json({
      id: completionId,
      object: 'chat.completion.file',
      created: Math.floor(Date.now() / 1000),
      model: modelName,
      filename: filename,
      saved_to: saveToPath,
      file_size: fullContent.length,
      content_preview: fullContent.substring(0, 500),
      finish_reason: finishReason,
      usage: usage,
    });
  } catch (err) {
    console.error('[chat/file] error:', err);
    res.status(500).json({ error: { message: err.message, type: 'internal_error' } });
  }
});

app.get('/v1/files', authenticate, (req, res) => {
  try {
    const wsDir = req.query.workspace_dir || WORKSPACE_DIR;
    if (!wsDir) {
      return res.status(400).json({ error: 'workspace_dir or WORKSPACE_DIR env is required' });
    }

    const pattern = req.query.pattern || '';
    const files = [];

    function walkDir(dir, base) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relPath = base ? `${base}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          walkDir(fullPath, relPath);
        } else {
          if (!pattern || relPath.includes(pattern)) {
            const stat = fs.statSync(fullPath);
            files.push({
              name: entry.name,
              path: relPath,
              size: stat.size,
              modified: stat.mtime.toISOString(),
            });
          }
        }
      }
    }

    if (fs.existsSync(wsDir)) {
      walkDir(wsDir, '');
    }

    res.json({ workspace: wsDir, files: files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/v1/files/read', authenticate, (req, res) => {
  try {
    const wsDir = req.query.workspace_dir || WORKSPACE_DIR;
    const filePath = req.query.path;
    if (!wsDir || !filePath) {
      return res.status(400).json({ error: 'workspace_dir and path are required' });
    }

    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(wsDir, filePath);

    if (!fullPath.startsWith(wsDir) && !path.isAbsolute(filePath)) {
      return res.status(403).json({ error: 'Path must be within workspace' });
    }

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: `File not found: ${filePath}` });
    }

    const stat = fs.statSync(fullPath);
    if (stat.size > 1024 * 1024) {
      return res.status(400).json({ error: 'File too large (max 1MB)' });
    }

    const content = fs.readFileSync(fullPath, 'utf-8');
    res.json({ path: filePath, size: stat.size, content: content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => {
  res.json({
    name: 'Trae Local API',
    version: '2.0.0',
    description: 'OpenAI-compatible API wrapper for Trae IDE',
    endpoints: {
      chat: 'POST /v1/chat/completions',
      chat_file: 'POST /v1/chat/file',
      models: 'GET /v1/models',
      models_detail: 'GET /v1/models/detail?function=chat_v3',
      chat_modes: 'GET /v1/chat/modes',
      anthropic: 'POST /v1/messages',
      files: 'GET /v1/files',
      files_read: 'GET /v1/files/read?path=xxx',
      status: 'GET /v1/status',
      encrypt: 'POST /v1/encrypt',
      decrypt: 'POST /v1/decrypt',
      dashboard: 'GET /v1/dashboard (HTML page)',
      dashboard_api: 'GET /v1/dashboard/status|sessions|requests|stats',
    },
    primary_endpoint: '/api/agent/v3/llm_utils_chat',
    functions: Object.keys(FUNCTION_MAP),
  });
});

app.get('/v1/sync/pending', authenticate, (req, res) => {
  res.json({
    workspace: WORKSPACE_DIR,
    sync_dir: OUTPUT_SYNC_DIR || null,
    pending_files: pendingSyncFiles.map(f => ({
      src: f,
      dest: OUTPUT_SYNC_DIR ? path.join(OUTPUT_SYNC_DIR, path.relative(WORKSPACE_DIR, f)) : null,
      rel: path.relative(WORKSPACE_DIR, f),
    })),
    count: pendingSyncFiles.length,
  });
});

app.post('/v1/sync/clear', authenticate, (req, res) => {
  const cleared = pendingSyncFiles.length;
  pendingSyncFiles.length = 0;
  res.json({ cleared });
});

// ==================== Dashboard API ====================

/**
 * 从请求中提取 workspace 标识
 * 优先级: X-Workspace header > workspace query param > body.workspace > 'default'
 */
function extractWorkspace(req) {
  // 1. X-Workspace header
  const headerWs = req.headers['x-workspace'];
  if (headerWs) return sanitizeWorkspace(headerWs);
  // 2. Query parameter
  const queryWs = req.query?.workspace;
  if (queryWs) return sanitizeWorkspace(queryWs);
  // 3. Body parameter
  const bodyWs = req.body?.workspace;
  if (bodyWs) return sanitizeWorkspace(bodyWs);
  return 'default';
}

function sanitizeWorkspace(ws) {
  return String(ws).replace(/[<>:"/\\|?*]/g, '_').replace(/[^a-zA-Z0-9_\-\.\u4e00-\u9fff]/g, '-').substring(0, 64) || 'default';
}

// 服务启动时间
const serverStartTime = Date.now();

app.get('/v1/dashboard/status', authenticate, (req, res) => {
  const uptime = Date.now() - serverStartTime;
  const uptimeStr = `${Math.floor(uptime / 3600000)}h ${Math.floor((uptime % 3600000) / 60000)}m ${Math.floor((uptime % 60000) / 1000)}s`;
  res.json({
    name: 'Trae Local API',
    version: '2.0.0',
    port: PORT,
    uptime: uptimeStr,
    uptime_ms: uptime,
    startedAt: new Date(serverStartTime).toISOString(),
    activeRequests: trafficLogger.getActiveCount(),
    autoContinue: AUTO_CONTINUE,
    maxContinues: MAX_CONTINUES,
    workspaceDir: WORKSPACE_DIR,
    outputSyncDir: OUTPUT_SYNC_DIR
  });
});

app.get('/v1/dashboard/sessions', authenticate, (req, res) => {
  const active = trafficLogger.getActiveRequests();
  const dirs = trafficLogger.getLogDirectories();
  const workspaces = new Map();
  for (const d of dirs) {
    const ws = workspaces.get(d.workspace) || { workspace: d.workspace, totalRequests: 0, dates: [] };
    ws.totalRequests += d.fileCount;
    ws.dates.push({ date: d.date, requests: d.fileCount });
    workspaces.set(d.workspace, ws);
  }
  res.json({
    activeRequests: active,
    workspaces: Array.from(workspaces.values()),
    activeCount: active.length
  });
});

app.get('/v1/dashboard/requests', authenticate, (req, res) => {
  const workspace = req.query.workspace || '';
  const limit = parseInt(req.query.limit) || 50;
  const offset = parseInt(req.query.offset) || 0;
  const entries = trafficLogger.readRecentLogs(workspace, limit, offset);
  res.json({ requests: entries, total: entries.length, limit, offset, workspace: workspace || 'all' });
});

app.get('/v1/dashboard/stats', authenticate, (req, res) => {
  const workspace = req.query.workspace || '';
  const entries = trafficLogger.readRecentLogs(workspace, 500, 0);
  
  // Aggregate stats
  let totalTokens = 0;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalDuration = 0;
  let totalContentLength = 0;
  const modelStats = {};
  const timelineStats = {}; // hour -> { tokens, count }
  
  for (const e of entries) {
    totalTokens += e.tokens || 0;
    totalPromptTokens += e.promptTokens || 0;
    totalCompletionTokens += e.completionTokens || 0;
    totalDuration += e.duration_ms || 0;
    totalContentLength += e.contentLength || 0;
    
    const model = e.model || 'unknown';
    if (!modelStats[model]) modelStats[model] = { requests: 0, tokens: 0, duration: 0 };
    modelStats[model].requests++;
    modelStats[model].tokens += e.tokens || 0;
    modelStats[model].duration += e.duration_ms || 0;
    
    if (e.timestamp) {
      const hour = e.timestamp.substring(0, 13); // "2026-05-25T15"
      if (!timelineStats[hour]) timelineStats[hour] = { tokens: 0, count: 0 };
      timelineStats[hour].tokens += e.tokens || 0;
      timelineStats[hour].count++;
    }
  }
  
  res.json({
    workspace: workspace || 'all',
    totalRequests: entries.length,
    totalTokens,
    totalPromptTokens,
    totalCompletionTokens,
    totalDurationMs: totalDuration,
    avgDurationMs: entries.length ? Math.round(totalDuration / entries.length) : 0,
    totalContentLength,
    modelStats,
    timelineStats: Object.entries(timelineStats).sort().map(([hour, data]) => ({ hour: hour.substring(11), ...data }))
  });
});

app.get('/v1/dashboard/log/:date/:workspace/:logId', authenticate, (req, res) => {
  const { date, workspace, logId } = req.params;
  const entry = trafficLogger.readLogEntry(date, workspace, logId);
  if (!entry) return res.status(404).json({ error: 'Log not found' });
  res.json(entry);
});

app.get('/v1/dashboard/active/:logId', authenticate, (req, res) => {
  const { logId } = req.params;
  const detail = trafficLogger.getActiveRequestDetail(logId);
  if (!detail) return res.status(404).json({ error: 'Active request not found', isActive: false });
  res.json(detail);
});

// Fallback config API
app.get('/v1/dashboard/fallback-config', authenticate, (req, res) => {
  res.json(getFallbackConfig());
});

app.post('/v1/dashboard/fallback-config', authenticate, (req, res) => {
  try {
    const config = req.body;
    if (typeof config.autoFallback !== 'boolean') {
      return res.status(400).json({ error: 'autoFallback must be boolean' });
    }
    if (typeof config.queueThreshold !== 'number' || config.queueThreshold < 0) {
      return res.status(400).json({ error: 'queueThreshold must be non-negative number' });
    }
    if (typeof config.mappings !== 'object') {
      return res.status(400).json({ error: 'mappings must be object' });
    }
    saveFallbackConfig(config);
    console.log('[fallback] Config updated via dashboard');
    res.json({ ok: true, config: getFallbackConfig() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/v1/dashboard/model-config', authenticate, (req, res) => {
  res.json(getModelConfig());
});

app.post('/v1/dashboard/model-config', authenticate, (req, res) => {
  try {
    const config = req.body;
    if (typeof config !== 'object' || config === null) {
      return res.status(400).json({ error: 'Config must be an object' });
    }
    if (config.models && typeof config.models !== 'object') {
      return res.status(400).json({ error: 'models must be an object' });
    }
    saveModelConfig(config);
    rebuildDerivedMaps();
    console.log('[model-config] Updated via dashboard');
    res.json({ ok: true, config: getModelConfig() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/v1/dashboard/model-config/models', authenticate, (req, res) => {
  try {
    const { key, function: fn, config_name, category, toolcall_compatible } = req.body;
    if (!key || !config_name) {
      return res.status(400).json({ error: 'key and config_name are required' });
    }
    const config = getModelConfig();
    if (!config.models) config.models = {};
    config.models[key] = {
      function: fn || 'chat_v3',
      config_name,
      category: category || 'custom',
      toolcall_compatible: toolcall_compatible !== undefined ? toolcall_compatible : null,
    };
    saveModelConfig(config);
    rebuildDerivedMaps();
    console.log(`[model-config] Added/updated model: ${key} → ${config_name}`);
    res.json({ ok: true, config: getModelConfig() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/v1/dashboard/model-config/models/:key', authenticate, (req, res) => {
  try {
    const config = getModelConfig();
    if (config.models && config.models[req.params.key]) {
      delete config.models[req.params.key];
      saveModelConfig(config);
      rebuildDerivedMaps();
      console.log(`[model-config] Deleted model: ${req.params.key}`);
      res.json({ ok: true, config: getModelConfig() });
    } else {
      res.status(404).json({ error: 'Model not found' });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/v1/dashboard', (req, res) => {
  const filePath = path.join(__dirname, '..', 'web', 'dashboard.html');
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).send('Dashboard page not found');
  }
});

// ==================== Anthropic Endpoint ====================

app.post('/v1/messages', authenticate, async (req, res) => {
  const reqId = uuidv4().substring(0, 8);
  const startTime = Date.now();

  try {
    const { model, messages, max_tokens, system, stream, temperature, tools, tool_choice, thinking } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json(createAnthropicError({
        type: 'invalid_request_error',
        message: 'messages is required and must be a non-empty array'
      }));
    }

    const modelName = model || 'auto';
    const isStream = stream === true;
    const messageId = `msg_${uuidv4().replace(/-/g, '').substring(0, 24)}`;

    console.log(`[anthropic ${reqId}] POST /v1/messages model=${modelName} stream=${isStream} messages=${messages.length} max_tokens=${max_tokens || 'default'} has_tools=${!!tools} has_system=${!!system} thinking=${JSON.stringify(thinking) || 'none'}`);

    const openaiMessages = anthropicToOpenAIMessages(messages, system);

    // Detect if this is a multi-turn tool call conversation (has tool_result in messages)
    let hasToolResult = false;
    let hasToolUse = false;
    for (const msg of messages) {
      if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'tool_result') hasToolResult = true;
          if (block.type === 'tool_use') hasToolUse = true;
        }
      }
    }
    const isToolContinuation = hasToolResult && hasToolUse;

    // If Claude Code sends tools, inject them into the conversation
    // so the Trae model knows about available tools and uses correct tool names
    let toolMap = null;  // maps lowercase tool name -> original tool name
    if (tools && Array.isArray(tools) && tools.length > 0) {
      toolMap = {};
      const toolDescriptions = tools.map(t => {
        const nameLower = t.name.toLowerCase();
        toolMap[nameLower] = t.name;
        // Map all Claude Code tool name variants
        // File operations
        if (nameLower === 'read' || nameLower === 'read_file') {
          toolMap['read_file'] = t.name;
          toolMap['read'] = t.name;
        }
        if (nameLower === 'write' || nameLower === 'write_file') {
          toolMap['write_file'] = t.name;
          toolMap['write'] = t.name;
        }
        if (nameLower === 'edit' || nameLower === 'edit_file') {
          toolMap['edit_file'] = t.name;
          toolMap['edit'] = t.name;
        }
        if (nameLower === 'multiedit' || nameLower === 'multi_edit') {
          toolMap['multiedit'] = t.name;
          toolMap['multi_edit'] = t.name;
        }
        // Search/list operations
        if (nameLower === 'glob' || nameLower === 'listdir' || nameLower === 'list_files') {
          toolMap['listdir'] = t.name;
          toolMap['glob'] = t.name;
          toolMap['list_files'] = t.name;
        }
        if (nameLower === 'grep' || nameLower === 'search_files') {
          toolMap['grep'] = t.name;
          toolMap['search_files'] = t.name;
        }
        // Command execution
        if (nameLower === 'bash' || nameLower === 'execute_command' || nameLower === 'run_command') {
          toolMap['execute_command'] = t.name;
          toolMap['bash'] = t.name;
          toolMap['run_command'] = t.name;
        }
        // Web operations
        if (nameLower === 'webfetch' || nameLower === 'fetch_url' || nameLower === 'web_fetch') {
          toolMap['webfetch'] = t.name;
          toolMap['fetch_url'] = t.name;
          toolMap['web_fetch'] = t.name;
        }
        if (nameLower === 'websearch' || nameLower === 'search_internet' || nameLower === 'web_search') {
          toolMap['websearch'] = t.name;
          toolMap['search_internet'] = t.name;
          toolMap['web_search'] = t.name;
        }
        const params = t.input_schema?.properties ? Object.keys(t.input_schema.properties).join(', ') : '';
        return `- ${t.name}(${params}): ${t.description?.substring(0, 200) || ''}`;
      }).join('\n');

      // Build tool system message with clear instructions for multi-turn tool use
      let toolSystemMsg = `\n\n<available_tools>\nYou have access to the following tools. To call a tool, output a toolcall block in JSON format:\n<toolcall>{"name": "ToolName", "params": {"param1": "value1"}}</toolcall>\n\nCRITICAL RULES:\n- The <toolcall> block MUST contain valid JSON with "name" and "params" keys\n- Do NOT use XML attributes like: ToolName param="value"\n- Do NOT use <arg_key>/<arg_value> tags\n- Use the EXACT tool names listed below (case-sensitive)\n- Output the <toolcall> block directly in your response, not inside other tags\n\nAvailable tools:\n${toolDescriptions}\n`;

      // If this is a tool continuation (tool_result was sent back), add explicit instruction
      if (isToolContinuation) {
        toolSystemMsg += `\nCRITICAL: You are in a multi-turn tool use conversation. The user has sent back tool results from your previous tool calls. You MUST:\n1. Analyze the tool results carefully\n2. If you need more information, call another tool using <toolcall> format\n3. If you have enough information to answer the user's question, provide your final answer as text\n4. Do NOT just say "I've completed the task" without providing the actual information or result the user requested\n5. Do NOT stop prematurely - continue working until the task is fully complete\n`;
      }

      toolSystemMsg += `</available_tools>`;

      // Inject into the first system message or prepend as system message
      const systemMsg = openaiMessages.find(m => m.role === 'system');
      if (systemMsg) {
        systemMsg.content += toolSystemMsg;
      } else {
        openaiMessages.unshift({ role: 'system', content: toolSystemMsg });
      }

      console.log(`[anthropic ${reqId}] Injected ${tools.length} tools into system prompt, isToolContinuation=${isToolContinuation}, toolMap: ${JSON.stringify(Object.keys(toolMap))}`);
    } else if (isToolContinuation) {
      // Tool continuation but no tools sent in this request - still need to instruct the model
      const systemMsg = openaiMessages.find(m => m.role === 'system');
      const continuationMsg = `\n\nIMPORTANT: You are in a multi-turn tool use conversation. The user has sent back tool results. You MUST analyze the results and continue working. If you need more information, call another tool. Otherwise, provide a complete answer. Do NOT stop prematurely.`;
      if (systemMsg) {
        systemMsg.content += continuationMsg;
      } else {
        openaiMessages.unshift({ role: 'system', content: continuationMsg });
      }
      console.log(`[anthropic ${reqId}] Tool continuation detected (no tools in request), added continuation instruction`);
    }

    // Log first user message for context
    const firstUserMsg = openaiMessages.find(m => m.role === 'user');
    if (firstUserMsg) {
      const preview = typeof firstUserMsg.content === 'string' ? firstUserMsg.content.substring(0, 100) : '(array)';
      console.log(`[anthropic ${reqId}] first user msg: "${preview}..."`);
    }

    const authInfo = await refreshTokenIfNeeded();
    if (isTokenExpired(authInfo)) {
      return res.status(401).json(createAnthropicError({
        type: 'authentication_error',
        message: 'Trae token expired. Please restart Trae IDE to refresh.'
      }));
    }

    const options = {};
    if (max_tokens) options.max_tokens = max_tokens;
    if (temperature !== undefined) options.temperature = temperature;
    options.workspace = extractWorkspace(req);

    // Multimodal detection: if messages contain image content, switch to a multimodal model
    const hasImageContent = openaiMessages.some(m => {
      if (Array.isArray(m.content)) {
        return m.content.some(c => c.type === 'image' || c.type === 'image_url');
      }
      return false;
    });

    if (hasImageContent) {
      const currentConfig = resolveModelId(modelName);
      const modelEntry = MODEL_MAP[Object.keys(MODEL_MAP).find(k => MODEL_MAP[k].config_name === currentConfig)];
      if (!modelEntry?.multimodal) {
        const mmModel = findMultimodalModel(currentConfig);
        if (mmModel) {
          console.log(`[anthropic ${reqId}] Image content detected, switching to multimodal model: ${mmModel}`);
          options.config_name = mmModel;
        }
      }
    }

    if (isStream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      const sendEvent = (eventType, data) => {
        if (res.writableEnded) return;
        if (eventType === 'message_stop') {
          const elapsed = Date.now() - startTime;
          const textLen = streamState ? streamState.textContent.length : 0;
          console.log(`[anthropic ${reqId}] message_stop sent: ${elapsed}ms, text=${textLen} chars, output_tokens=${streamState?.outputTokenCount || 0}`);
        }
        res.write(`event: ${eventType}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      let streamState = null;
      let continueCount = 0;
      let lastShortText = '';
      let lastQueuePosition = 0;
      let currentMessages = [...openaiMessages];
      let fallbackAttempted = {};  // 记录已尝试的降级模型
      let raceTriggered = false;   // 是否已触发并发竞速
      let currentConfigName = null;  // 当前使用的 config_name

      // Helper: process a single llmUtilsChat stream
      const processStream = async (messages, configNameOverride = null) => {
        if (configNameOverride) {
          currentConfigName = configNameOverride;
        }
        const result = await llmUtilsChat(messages, modelName, true, { ...options, config_name: configNameOverride || options?.config_name });
        const logId = result.logId;

        if (!result.body) {
          throw new Error('No stream body from llmUtilsChat');
        }

        return new Promise((resolve, reject) => {
          let streamBuffer = '';
          let streamEventName = '';

          // Send message_start immediately so CC doesn't time out during queue wait
          // CC expects message_start as the first event; without it, CC aborts after ~60s
          if (!streamState || !streamState.messageStarted) {
            if (!streamState) {
              streamState = {
                messageStarted: false, messageStopped: false,
                contentBlockIndex: -1, currentContentType: null,
                textContent: '', toolCalls: [], outputTokenCount: 0,
                reasoningContent: '', stopReason: null,
                suppressStopEvents: false, pendingToolCalls: [],
                toolCallBuffer: '', inToolCall: false, hasToolUse: false,
                toolCallIndex: {}
              };
            }
            sendEvent('message_start', createAnthropicMessageStart(messageId, modelName, { input_tokens: 0 }));
            streamState.messageStarted = true;
            console.log(`[anthropic ${reqId}] Sent message_start early (before queue/content)`);
          }

          result.body.on('data', (chunk) => {
            try {
              streamBuffer += chunk.toString();
              const lines = streamBuffer.split('\n');
              streamBuffer = lines.pop() || '';

              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;

                const parsed = parseLlmUtilsChatStream(trimmed, streamEventName);
                if (!parsed) continue;

                if (parsed._type === 'event_name') {
                  streamEventName = parsed.value;
                  if (logId) trafficLogger.logResponseChunk(logId, streamEventName, null);
                  continue;
                }

                if (logId) trafficLogger.logResponseChunk(logId, streamEventName, parsed);
                if (logId && parsed.type === 'text' && parsed.content) {
                  trafficLogger.logResponseContent(logId, parsed.content, parsed.reasoning);
                }
                if (logId && parsed.type === 'token_usage') {
                  trafficLogger.logTokenUsage(logId, parsed.data);
                }

                // Send keep-alive ping for progress events
                if (parsed.type === 'progress') {
                  sendEvent('ping', { type: 'ping' });
                  continue;
                }

                // Queue position handling - send as ping only, NOT as text content
                // Text content would pollute Claude Code's conversation history
                if (parsed.type === 'queue_wait' && parsed.position > 0) {
                  if (parsed.position !== lastQueuePosition) {
                    lastQueuePosition = parsed.position;

                    // Show waiting hint for popular models with long queues
                    if (parsed.position > 50) {
                      console.log(`[anthropic ${reqId}] ⚠️  Model is busy - queue position #${parsed.position}. This may take a few minutes. Consider using fallback models.`);
                    } else if (parsed.position > 20) {
                      console.log(`[anthropic ${reqId}] ⏳  Waiting in queue - position #${parsed.position}. Estimated wait: ~${Math.ceil(parsed.position * 30 / 60)} minutes.`);
                    }

                    // 检查是否需要降级
                    const fbConfig = getFallbackConfig();
                    if (fbConfig.autoFallback && parsed.position > fbConfig.queueThreshold) {
                      // Tier-based fallback: try same-tier race first, then next tier
                      if (isTieredFallbackEnabled()) {
                        const currentConfig = currentConfigName || modelName;
                        const sameTier = getSameTierModels(currentConfig).filter(m => !fallbackAttempted[m]);

                        if (sameTier.length > 0 && isRaceWithinTierEnabled()) {
                          // Race within same tier: all untried same-tier models concurrently
                          for (const m of sameTier) fallbackAttempted[m] = true;
                          console.log(`[fallback] Queue #${parsed.position} > threshold, RACE within tier: ${sameTier.join(', ')}`);

                          result.body.destroy();
                          finalizeStreamLog();
                          sendEvent('ping', { type: 'ping' });
                          lastQueuePosition = 0;

                          resolve({ fallback: true, raceModels: sameTier });
                          return;
                        }

                        // No same-tier models left, try next tier
                        const attemptedList = Object.keys(fallbackAttempted);
                        const nextTierModels = getNextTierModels(currentConfig, attemptedList);
                        if (nextTierModels.length > 0) {
                          const nextModel = nextTierModels[0];
                          fallbackAttempted[nextModel] = true;
                          console.log(`[fallback] Queue #${parsed.position} > threshold, falling back to next tier: ${nextModel}`);

                          result.body.destroy();
                          finalizeStreamLog();
                          sendEvent('ping', { type: 'ping' });
                          lastQueuePosition = 0;

                          resolve({ fallback: true, nextModel });
                          return;
                        }

                        // All tiers exhausted - use fallbackModel as last resort
                        const fbModel = getFallbackModel();
                        if (!fallbackAttempted[fbModel]) {
                          fallbackAttempted[fbModel] = true;
                          console.log(`[fallback] All tiers exhausted, using fallback model: ${fbModel}`);

                          result.body.destroy();
                          finalizeStreamLog();
                          sendEvent('ping', { type: 'ping' });
                          lastQueuePosition = 0;

                          resolve({ fallback: true, nextModel: fbModel });
                          return;
                        }
                      }

                      // Legacy fallback chain (for backward compatibility)
                      const fallbackChain = getFallbackChain(modelName);
                      const nextModel = fallbackChain.find(m => !fallbackAttempted[m]);
                      if (nextModel) {
                        fallbackAttempted[nextModel] = true;
                        console.log(`[fallback] Queue #${parsed.position} > threshold ${fbConfig.queueThreshold}, falling back to ${nextModel}`);

                        result.body.destroy();
                        finalizeStreamLog();
                        sendEvent('ping', { type: 'ping' });
                        lastQueuePosition = 0;

                        resolve({ fallback: true, nextModel });
                        return;
                      }
                    }

                    // Send ping to keep connection alive during queue wait
                    // Do NOT send queue position as text - it pollutes Claude Code's context
                    sendEvent('ping', { type: 'ping' });
                  }
                  continue;
                }

                if (parsed.type === 'queue_begin') {
                  sendEvent('ping', { type: 'ping' });
                  continue;
                }

                if (parsed.type === 'queue_end') {
                  lastQueuePosition = 0;
                  continue;
                }

                const { events, state } = llmUtilsChunkToAnthropic(parsed, messageId, modelName, streamState, toolMap);
                streamState = state;

                for (const ev of events) {
                  sendEvent(ev.event, ev.data);
                }
              }
            } catch (err) {
              console.error(`[anthropic ${reqId}] Error processing chunk:`, err);
              if (!res.writableEnded && streamState && streamState.messageStarted && !streamState.messageStopped) {
                try {
                  if (streamState.contentBlockIndex >= 0 && streamState.currentContentType !== null) {
                    sendEvent('content_block_stop', { type: 'content_block_stop', index: streamState.contentBlockIndex });
                  }
                  sendEvent('message_delta', createAnthropicMessageDelta('end_turn', { output_tokens: streamState.outputTokenCount || 0 }));
                  sendEvent('message_stop', { type: 'message_stop' });
                } catch (closeErr) { /* ignore */ }
                res.end();
              }
              reject(err);
            }
          });

          let streamFinalized = false;
          const finalizeStreamLog = () => {
            if (streamFinalized) return;
            streamFinalized = true;
            if (logId) trafficLogger.finalizeLog(logId, {
              fullContent: streamState?.textContent || '',
              fullReasoning: streamState?.reasoningContent || '',
            });
          };

          result.body.on('end', () => {
            finalizeStreamLog();
            resolve({ fallback: false });
          });

          result.body.on('close', () => {
            finalizeStreamLog();
          });

          result.body.on('error', (err) => {
            console.error(`[anthropic ${reqId}] stream error:`, err);
            finalizeStreamLog();
            reject(err);
          });

          req.on('close', () => {
            const elapsed = Date.now() - startTime;
            console.log(`[anthropic ${reqId}] client disconnected after ${elapsed}ms`);
            if (result.body && result.body.destroy) result.body.destroy();
            finalizeStreamLog();
            reject(new Error('Client disconnected'));
          });
        });
      };

      try {
        // Main loop: process stream, auto-continue if truncated
        while (continueCount <= MAX_CONTINUES) {
          // Always suppress stop events from llmUtilsChunkToAnthropic
          // We'll send them manually after checking if we need to continue
          // This must be set BEFORE processStream so the done event handler knows not to emit
          if (streamState) {
            streamState.suppressStopEvents = true;
          }

          const streamResult = await processStream(currentMessages, currentConfigName);

          // 处理降级重试
          if (streamResult && streamResult.fallback) {
            if (streamResult.raceModels) {
              // Tier-based race: concurrent requests to same-tier models
              // First to produce content wins, others are abandoned
              console.log(`[anthropic ${reqId}] Launching TIER RACE: concurrent requests to ${streamResult.raceModels.join(', ')}`);

              const raceModels = streamResult.raceModels;
              let raceWinner = null;
              const raceAborted = new Set();

              const racePromises = raceModels.map(raceModel => {
                return processStream(currentMessages, raceModel).then(r => {
                  if (!r.fallback && !raceWinner) {
                    raceWinner = raceModel;
                    console.log(`[anthropic ${reqId}] TIER RACE winner: ${raceModel}`);
                    // Abort other race participants
                    for (const m of raceModels) {
                      if (m !== raceModel) raceAborted.add(m);
                    }
                  }
                  return { ...r, _raceModel: raceModel };
                });
              });

              // Wait for first to produce content
              await Promise.race(racePromises);

              if (!raceWinner) {
                // All race models also queued - continue with original model
                console.log(`[anthropic ${reqId}] All tier race models also queued, continuing with original`);
              }
            } else if (streamResult.race) {
              // Legacy race fallback
              console.log(`[anthropic ${reqId}] Launching RACE mode: concurrent requests to ${getRaceModels().join(', ')}`);

              const raceModels = getRaceModels();
              let raceWinner = null;

              const racePromises = raceModels.map(raceModel => {
                return processStream(currentMessages, raceModel).then(r => {
                  if (!r.fallback && !raceWinner) {
                    raceWinner = raceModel;
                    console.log(`[anthropic ${reqId}] RACE winner: ${raceModel}`);
                  }
                  return { ...r, _raceModel: raceModel };
                });
              });

              await Promise.race(racePromises);

              if (!raceWinner) {
                console.log(`[anthropic ${reqId}] All race models also queued, continuing with original`);
              }
            } else {
              console.log(`[anthropic ${reqId}] Retrying with fallback model: ${streamResult.nextModel}`);
              continue;  // 重新进入循环，用降级模型重试
            }
          }

          const elapsed = Date.now() - startTime;
          console.log(`[anthropic ${reqId}] stream ended: ${elapsed}ms, stopReason=${streamState?.stopReason}, suppressStopEvents=${streamState?.suppressStopEvents}, continueCount=${continueCount}`);

          // Check if we should auto-continue
          if (AUTO_CONTINUE && streamState && streamState.messageStopped && isResponseTruncated(streamState) && continueCount < MAX_CONTINUES) {
            const currentText = (streamState.textContent || '').trim();
            const isShortResponse = currentText.length < 200;

            if (isShortResponse && lastShortText && currentText.length > 0) {
              const overlap = Math.min(lastShortText.length, currentText.length);
              let sameChars = 0;
              for (let i = 0; i < overlap; i++) {
                if (lastShortText[i] === currentText[i]) sameChars++;
              }
              const similarity = overlap > 0 ? sameChars / overlap : 0;
              if (similarity > 0.5) {
                console.log(`[anthropic ${reqId}] Short response repeated (similarity=${(similarity*100).toFixed(0)}%), stopping auto-continue to avoid loop`);
                if (streamState.messageStopped && streamState.suppressStopEvents && !res.writableEnded) {
                  const finalReason = streamState.hasToolUse ? 'tool_use' : (streamState.stopReason || 'end_turn');
                  sendEvent('message_delta', createAnthropicMessageDelta(finalReason, { output_tokens: streamState.outputTokenCount || 0 }));
                  sendEvent('message_stop', { type: 'message_stop' });
                }
                break;
              }
            }

            if (isShortResponse) {
              lastShortText = currentText;
            }

            continueCount++;
            const isEmptyResponse = !streamState.textContent && !streamState.hasToolUse && (streamState.reasoningContent || '').length > 0;
            const continueMsg = isEmptyResponse
              ? 'Your previous response contained only thinking/reasoning with no actual output. Please provide your actual response now - either text content or a tool call.'
              : '请继续输出，从你中断的地方继续。';
            console.log(`[anthropic ${reqId}] ${isEmptyResponse ? 'Empty response (reasoning only)' : 'Response truncated'} (stopReason=${streamState.stopReason}), auto-continuing (${continueCount}/${MAX_CONTINUES})...`);

            const assistantText = streamState.textContent || '';
            currentMessages.push({ role: 'assistant', content: assistantText });
            currentMessages.push({ role: 'user', content: continueMsg });

            // Reset streamState for the next iteration
            const savedContentBlockIndex = streamState.contentBlockIndex;
            const savedMessageStarted = streamState.messageStarted;
            const savedOutputTokenCount = streamState.outputTokenCount;

            streamState = {
              messageStarted: savedMessageStarted,
              messageStopped: false,
              contentBlockIndex: savedContentBlockIndex,
              currentContentType: null,
              textContent: '',
              reasoningContent: '',
              outputTokenCount: savedOutputTokenCount,
              hasToolUse: false,
              toolCallIndex: {},
              toolCallBuffer: '',
              inToolCall: false,
              pendingToolCalls: [],
              suppressStopEvents: true,
              stopReason: null
            };

            // Don't send message_start again - just continue with content blocks
            continue;
          }

          // Response is complete or max continues reached
          // Only send final events if they were suppressed (not already sent by llmUtilsChunkToAnthropic)
          if (streamState && streamState.messageStopped && streamState.suppressStopEvents && !res.writableEnded) {
            const finalReason = streamState.hasToolUse ? 'tool_use' : (streamState.stopReason || 'end_turn');
            sendEvent('message_delta', createAnthropicMessageDelta(finalReason, { output_tokens: streamState.outputTokenCount || 0 }));
            sendEvent('message_stop', { type: 'message_stop' });
          }
          break;
        }

        // Finalize: if message_stop was already sent by llmUtilsChunkToAnthropic, just end
        if (streamState && streamState.messageStopped) {
          if (!res.writableEnded) res.end();
        } else if (streamState && streamState.messageStarted) {
          // Stream ended without proper done event - send closing events
          if (!res.writableEnded) {
            if (streamState.contentBlockIndex >= 0 && streamState.currentContentType !== null) {
              sendEvent('content_block_stop', { type: 'content_block_stop', index: streamState.contentBlockIndex });
            }
            const finalReason = streamState.hasToolUse ? 'tool_use' : 'end_turn';
            sendEvent('message_delta', createAnthropicMessageDelta(finalReason, { output_tokens: streamState.outputTokenCount || 0 }));
            sendEvent('message_stop', { type: 'message_stop' });
            res.end();
          }
        } else {
          // No content was received at all
          if (!res.writableEnded) {
            sendEvent('message_start', createAnthropicMessageStart(messageId, modelName, { input_tokens: 0 }));
            sendEvent('content_block_start', createAnthropicContentBlockStart(0, 'text', { text: '' }));
            sendEvent('content_block_stop', { type: 'content_block_stop', index: 0 });
            sendEvent('message_delta', createAnthropicMessageDelta('end_turn', { output_tokens: 0 }));
            sendEvent('message_stop', { type: 'message_stop' });
            res.end();
          }
        }
      } catch (err) {
        console.error('[anthropic stream] error:', err);
        if (!res.writableEnded) {
          sendEvent('error', createAnthropicError({
            type: 'api_error',
            message: err.message
          }));
          res.end();
        }
      }
    } else {
      try {
        const result = await llmUtilsChat(openaiMessages, modelName, true, options);
        let fullContent = '';
        let fullReasoning = '';
        let tokenUsage = null;
        let hasToolUse = false;
        const toolCalls = [];
        const upstreamLogId = result.logId;

        if (result.body) {
          await new Promise((resolve, reject) => {
            let buffer = '';
            let currentEventName = '';

            result.body.on('data', (chunk) => {
              buffer += chunk.toString();
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;

                const parsed = parseLlmUtilsChatStream(trimmed, currentEventName);
                if (!parsed) continue;

                if (parsed._type === 'event_name') {
                  currentEventName = parsed.value;
                  if (upstreamLogId) trafficLogger.logResponseChunk(upstreamLogId, currentEventName, null);
                  continue;
                }

                if (upstreamLogId) trafficLogger.logResponseChunk(upstreamLogId, currentEventName, parsed);

                if (parsed.type === 'token_usage') {
                  tokenUsage = parsed.data;
                  if (upstreamLogId) trafficLogger.logTokenUsage(upstreamLogId, tokenUsage);
                  continue;
                }

                if (parsed.type === 'text' && parsed.content) {
                  fullContent += parsed.content;
                  if (upstreamLogId) trafficLogger.logResponseContent(upstreamLogId, parsed.content, null);
                }
                if (parsed.type === 'text' && parsed.reasoning) {
                  fullReasoning += parsed.reasoning;
                  if (upstreamLogId) trafficLogger.logResponseContent(upstreamLogId, null, parsed.reasoning);
                }
                if (parsed.type === 'text' && parsed.tool_calls) {
                  hasToolUse = true;
                  toolCalls.push(...parsed.tool_calls);
                }
              }
            });

            result.body.on('end', resolve);
            result.body.on('error', reject);
          });
        }

        const usage = tokenUsage ? {
          input_tokens: tokenUsage.prompt_tokens || 0,
          output_tokens: tokenUsage.completion_tokens || 0
        } : undefined;

        if (upstreamLogId) trafficLogger.finalizeLog(upstreamLogId, { fullContent, fullReasoning, tokenUsage });

        // Build content blocks for non-streaming response
        const contentBlocks = [];
        if (fullReasoning) {
          contentBlocks.push({ type: 'thinking', thinking: fullReasoning });
        }
        if (fullContent) {
          contentBlocks.push({ type: 'text', text: fullContent });
        }
        for (const tc of toolCalls) {
          const toolId = tc.id || `toolu_${uuidv4().replace(/-/g, '').substring(0, 24)}`;
          const toolName = tc.function?.name || tc.name || '';
          const toolInput = typeof tc.function?.arguments === 'string'
            ? (function(){ try { return JSON.parse(tc.function.arguments); } catch(e) { return { _raw: tc.function.arguments }; } })() : (tc.input || {});
          contentBlocks.push({
            type: 'tool_use',
            id: toolId,
            name: toolName,
            input: toolInput
          });
        }

        const stopReason = hasToolUse ? 'tool_use' : 'end_turn';
        const response = createAnthropicMessage(messageId, modelName, contentBlocks.length > 0 ? contentBlocks : '', stopReason, usage);
        res.json(response);
      } catch (err) {
        console.error('[anthropic] error:', err);
        res.status(500).json(createAnthropicError({
          type: 'api_error',
          message: err.message
        }));
      }
    }
  } catch (err) {
    console.error('[/v1/messages] error:', err);
    res.status(500).json(createAnthropicError({
      type: 'internal_error',
      message: err.message
    }));
  }
});

app.listen(PORT, () => {
  console.log(`\n[Trae Local API] Server running on http://localhost:${PORT}`);
  console.log(`[Trae Local API] API Key: ${API_KEY.substring(0, 8)}${API_KEY.length > 8 ? '***' : ''}`);
  console.log(`[Trae Local API] OpenAI endpoint: http://localhost:${PORT}/v1/chat/completions`);
  console.log(`[Trae Local API] Anthropic endpoint: http://localhost:${PORT}/v1/messages`);
  console.log(`[Trae Local API] Agent tools: read_file, write_file, list_files, search_internet, fetch_url, execute_command`);
  console.log(`[Trae Local API] Workspace dir: ${WORKSPACE_DIR || 'not set'}`);
  console.log(`[Trae Local API] Auto-continue: ${AUTO_CONTINUE ? `enabled (max ${MAX_CONTINUES})` : 'disabled'}`);
  if (OUTPUT_SYNC_DIR) {
    console.log(`[Trae Local API] Output sync dir: ${OUTPUT_SYNC_DIR}`);
  }
  console.log('');
});
