const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const { getAuthInfo, getDeviceIds, isTokenExpired, getApiHost, refreshTokenIfNeeded, detectEdition } = require('./auth');
const { llmUtilsChat, chatCompletion, createAgentTask, getModelDetailParam, getChatModes, resolveModelId, MODEL_MAP, REVERSE_MODEL_MAP, FUNCTION_MAP } = require('./trae-client');
const { createOpenAIChatCompletion, createOpenAIStreamChunk, createOpenAIModels, parseLlmUtilsChatStream, llmUtilsChunkToOpenAI, parseAgentTaskStream, parseTraeStreamChunk, traeChunkToOpenAI } = require('./openai-format');
const { encrypt, decrypt, hashContent } = require('./crypto');
const { v4: uuidv4 } = require('./uuid');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const API_KEY = process.env.API_KEY || 'trae-local-api-key';
const PORT = process.env.PORT || 9900;
const WORKSPACE_DIR = process.env.WORKSPACE_DIR || '';
const OUTPUT_SYNC_DIR = process.env.OUTPUT_SYNC_DIR || '';

const pendingSyncFiles = [];

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
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ error: { message: 'Missing Authorization header', type: 'auth_error' } });
  }
  const token = authHeader.replace('Bearer ', '');
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

function handleLlmUtilsStream(responseBody, res, completionId, modelName, saveToPath) {
  let buffer = '';
  let currentEventName = '';
  let fullContent = '';
  let fullReasoning = '';
  let tokenUsage = null;

  responseBody.on('data', (chunk) => {
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
            res.write(`data: ${JSON.stringify(savedChunk)}\n\n`);
          } catch (fileErr) {
            console.error(`[file] Save failed: ${fileErr.message}`);
            const errChunk = createOpenAIStreamChunk(completionId, modelName, {
              content: `\n\n[File save failed: ${fileErr.message}]`
            }, null);
            res.write(`data: ${JSON.stringify(errChunk)}\n\n`);
          }
        }

        const doneChunk = createOpenAIStreamChunk(completionId, modelName, {}, parsed.finish_reason || 'stop');
        res.write(`data: ${JSON.stringify(doneChunk)}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
        return;
      }

      const openaiChunk = llmUtilsChunkToOpenAI(parsed, completionId, modelName, true);
      if (openaiChunk) {
        if (parsed.type === 'text' && parsed.content) {
          fullContent += parsed.content;
        }
        if (parsed.type === 'text' && parsed.reasoning) {
          fullReasoning += parsed.reasoning;
        }
        res.write(`data: ${JSON.stringify(openaiChunk)}\n\n`);
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
  });

  responseBody.on('error', (err) => {
    console.error('[stream] error:', err);
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
  try {
    const { messages, model, stream, temperature, max_tokens, function: funcName, config_name, workspace_dir, save_to } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: { message: 'messages is required and must be a non-empty array', type: 'invalid_request_error' } });
    }

    const modelName = model || 'auto';
    const isStream = stream !== false;
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
          handleLlmUtilsStream(result.body, res, completionId, modelName, saveToPath);
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

        const usage = tokenUsage ? {
          prompt_tokens: tokenUsage.prompt_tokens || 0,
          completion_tokens: tokenUsage.completion_tokens || 0,
          total_tokens: tokenUsage.total_tokens || 0,
        } : undefined;

        const response = createOpenAIChatCompletion(completionId, modelName, fullContent, finishReason, fullReasoning, usage);

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
      files: 'GET /v1/files',
      files_read: 'GET /v1/files/read?path=xxx',
      status: 'GET /v1/status',
      encrypt: 'POST /v1/encrypt',
      decrypt: 'POST /v1/decrypt',
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

app.listen(PORT, () => {
  console.log(`\n[Trae Local API] Server running on http://localhost:${PORT}`);
  console.log(`[Trae Local API] API Key: ${API_KEY}`);
  console.log(`[Trae Local API] Primary endpoint: llm_utils_chat (inline_chat)`);
  console.log(`[Trae Local API] Available functions: ${Object.keys(FUNCTION_MAP).join(', ')}`);
  console.log(`[Trae Local API] Workspace dir: ${WORKSPACE_DIR || 'not set'}`);
  if (OUTPUT_SYNC_DIR) {
    console.log(`[Trae Local API] Output sync dir: ${OUTPUT_SYNC_DIR}`);
  }
  console.log('');
});
