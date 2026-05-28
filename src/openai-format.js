const { v4: uuidv4 } = require('./uuid');

function createOpenAIChatCompletion(id, model, content, finishReason, reasoning, usage) {
  const message = {
    role: 'assistant',
    content: content
  };
  if (reasoning) {
    message.reasoning_content = reasoning;
  }
  return {
    id: id || `chatcmpl-${uuidv4()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: model,
    choices: [{
      index: 0,
      message: message,
      finish_reason: finishReason || 'stop'
    }],
    usage: usage || {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0
    }
  };
}

function createOpenAIStreamChunk(id, model, delta, finishReason) {
  return {
    id: id || `chatcmpl-${uuidv4()}`,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: model,
    choices: [{
      index: 0,
      delta: delta,
      finish_reason: finishReason || null
    }]
  };
}

function createOpenAIModels(models) {
  return {
    object: 'list',
    data: models.map(m => ({
      id: m,
      object: 'model',
      created: Math.floor(Date.now() / 1000),
      owned_by: 'trae'
    }))
  };
}

function parseLlmUtilsChatSSE(rawBody) {
  const events = [];
  const lines = rawBody.split('\n');
  let currentEvent = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('event:')) {
      currentEvent = { event: trimmed.substring(6).trim(), data: '' };
      events.push(currentEvent);
    } else if (trimmed.startsWith('data:') && currentEvent) {
      currentEvent.data = trimmed.substring(5).trim();
    }
  }

  return events;
}

function parseLlmUtilsChatStream(rawLine, currentEventName) {
  if (!rawLine || rawLine.trim() === '') return null;

  if (rawLine.startsWith('event:')) {
    return { _type: 'event_name', value: rawLine.substring(6).trim() };
  }

  if (rawLine.startsWith('data:')) {
    const data = rawLine.substring(5).trim();
    if (data === '[DONE]') return { done: true };

    try {
      const parsed = JSON.parse(data);
      return normalizeLlmUtilsChunk(parsed, currentEventName);
    } catch (e) {
      return { raw: data };
    }
  }

  return null;
}

function normalizeLlmUtilsChunk(chunk, eventName) {
  if (!chunk || typeof chunk !== 'object') return chunk;

  if (eventName === 'output') {
    const result = { type: 'text' };

    // Old format: {"response": "..."}
    if (chunk.response) {
      const resp = chunk.response;
      if (resp.startsWith('Building prompt:') || resp.startsWith('Completed building prompt')) {
        return { type: 'progress', data: resp };
      }
      result.content = (result.content || '') + resp;
    }
    // New format (2026-05): {"type":"text","content":"..."}
    if (chunk.content) {
      result.content = (result.content || '') + chunk.content;
    }

    // Old format: {"reasoning_content": "..."}
    if (chunk.reasoning_content) {
      result.reasoning = (result.reasoning || '') + chunk.reasoning_content;
    }
    // New format (2026-05): {"reasoning": "..."}
    if (chunk.reasoning) {
      result.reasoning = (result.reasoning || '') + chunk.reasoning;
    }

    if (chunk.tool_calls) {
      result.tool_calls = chunk.tool_calls;
    }
    if (!result.content && !result.reasoning && !result.tool_calls) return null;
    return result;
  }

  if (eventName === 'done') {
    return { type: 'done', finish_reason: chunk.finish_reason || 'stop' };
  }

  if (eventName === 'error') {
    return {
      type: 'error',
      code: chunk.code,
      message: chunk.message,
      extra: chunk.extra
    };
  }

  if (eventName === 'token_usage') {
    return { type: 'token_usage', data: chunk };
  }

  if (eventName === 'extra_info') {
    return { type: 'extra_info', data: chunk };
  }

  if (eventName === 'metadata') {
    return { type: 'metadata', data: chunk };
  }

  if (eventName === 'timing_cost') {
    return { type: 'timing_cost', data: chunk };
  }

  if (eventName === 'progress_notice') {
    return { type: 'progress', data: chunk };
  }

  // Queue events - 排队相关事件
  if (eventName === 'queue_begin') {
    return { type: 'queue_begin', data: chunk };
  }

  if (eventName === 'request_wait_in_queue') {
    const position = chunk?.data?.position || chunk?.position || 0;
    if (position > 0) {
      // 只在位置是 10 的倍数或 < 20 时输出，减少刷屏
      if (position <= 20 || position % 50 === 0) {
        console.log(`[queue] Position: ${position} - waiting...`);
      }
    }
    return { type: 'queue_wait', position: position, data: chunk };
  }

  if (eventName === 'queue_end') {
    console.log(`[queue] Queue ended - request processing...`);
    return { type: 'queue_end', data: chunk };
  }

  return { type: eventName || 'unknown', data: chunk };
}

function llmUtilsChunkToOpenAI(chunk, id, model, includeReasoning) {
  if (!chunk) return null;

  if (chunk.type === 'done') {
    return createOpenAIStreamChunk(id, model, {}, chunk.finish_reason || 'stop');
  }

  if (chunk.type === 'text') {
    const delta = {};
    if (chunk.content) {
      delta.content = chunk.content;
    }
    if (includeReasoning && chunk.reasoning) {
      delta.reasoning_content = chunk.reasoning;
    }
    if (Object.keys(delta).length === 0) return null;
    return createOpenAIStreamChunk(id, model, delta, null);
  }

  if (chunk.type === 'error') {
    return createOpenAIStreamChunk(id, model, {
      content: `\n[Error ${chunk.code || ''}: ${chunk.message || 'unknown'}]`
    }, null);
  }

  return null;
}

function parseTraeStreamChunk(rawLine) {
  if (!rawLine || rawLine.trim() === '') return null;
  if (rawLine.startsWith('data: ')) {
    const data = rawLine.substring(6).trim();
    if (data === '[DONE]') return { done: true };
    try {
      return JSON.parse(data);
    } catch (e) {
      return { raw: data };
    }
  }
  if (rawLine.startsWith('event:')) return null;
  if (rawLine.startsWith('id:')) return null;
  if (rawLine.startsWith('retry:')) return null;
  try {
    return JSON.parse(rawLine);
  } catch (e) {
    return null;
  }
}

function traeChunkToOpenAI(chunk, id, model) {
  if (!chunk) return null;

  if (chunk.done) {
    return createOpenAIStreamChunk(id, model, {}, 'stop');
  }

  if (chunk.type === 'message' || chunk.type === 'text') {
    const content = chunk.data?.text || chunk.data?.content || chunk.data || '';
    if (content) {
      return createOpenAIStreamChunk(id, model, { content: String(content) }, null);
    }
    return null;
  }

  if (chunk.type === 'message_start' || chunk.type === 'start') {
    return createOpenAIStreamChunk(id, model, { role: 'assistant', content: '' }, null);
  }

  if (chunk.type === 'message_end' || chunk.type === 'end' || chunk.type === 'finish') {
    return createOpenAIStreamChunk(id, model, {}, 'stop');
  }

  if (chunk.type === 'error') {
    return createOpenAIStreamChunk(id, model, {
      content: `\n[Error: ${chunk.data?.message || chunk.message || 'unknown error'}]`
    }, null);
  }

  if (chunk.choices && chunk.choices.length > 0) {
    const choice = chunk.choices[0];
    const delta = {};
    if (choice.delta) {
      if (choice.delta.content) delta.content = choice.delta.content;
      if (choice.delta.role) delta.role = choice.delta.role;
    } else if (choice.message) {
      delta.content = choice.message.content || '';
      delta.role = choice.message.role || 'assistant';
    }
    return createOpenAIStreamChunk(id, model, delta, choice.finish_reason || null);
  }

  if (chunk.content !== undefined) {
    return createOpenAIStreamChunk(id, model, { content: chunk.content }, null);
  }

  if (chunk.message !== undefined) {
    return createOpenAIStreamChunk(id, model, { content: chunk.message || '' }, null);
  }

  if (chunk.text !== undefined) {
    return createOpenAIStreamChunk(id, model, { content: chunk.text || '' }, null);
  }

  if (chunk.delta !== undefined) {
    return createOpenAIStreamChunk(id, model, { content: chunk.delta }, null);
  }

  if (chunk.finish_reason) {
    return createOpenAIStreamChunk(id, model, {}, 'stop');
  }

  return null;
}

function parseAgentTaskStream(rawLine) {
  if (!rawLine || rawLine.trim() === '') return null;
  if (rawLine.startsWith('data: ')) {
    const data = rawLine.substring(6).trim();
    if (data === '[DONE]') return { done: true };
    try {
      const parsed = JSON.parse(data);
      return normalizeAgentTaskChunk(parsed);
    } catch (e) {
      return { raw: data };
    }
  }
  if (rawLine.startsWith('event:')) return null;
  if (rawLine.startsWith('id:')) return null;
  try {
    const parsed = JSON.parse(rawLine);
    return normalizeAgentTaskChunk(parsed);
  } catch (e) {
    return null;
  }
}

function normalizeAgentTaskChunk(chunk) {
  if (!chunk || typeof chunk !== 'object') return chunk;

  if (chunk.event_type) {
    switch (chunk.event_type) {
      case 'message_start':
      case 'session_start':
      case 'task_start':
        return { type: 'message_start', data: chunk };
      case 'text_delta':
      case 'content_delta':
      case 'message_delta':
        return {
          type: 'text',
          data: chunk.data?.text || chunk.data?.content || chunk.text || chunk.content || ''
        };
      case 'tool_call':
      case 'function_call':
        return { type: 'tool_call', data: chunk.data || chunk };
      case 'tool_result':
      case 'function_result':
        return { type: 'tool_result', data: chunk.data || chunk };
      case 'message_end':
      case 'session_end':
      case 'task_end':
      case 'finish':
        return { type: 'message_end', data: chunk };
      case 'error':
        return { type: 'error', data: chunk.data || chunk };
      default:
        return chunk;
    }
  }

  if (chunk.type) return chunk;

  if (chunk.text || chunk.content || chunk.delta) {
    return {
      type: 'text',
      data: chunk.text || chunk.content || chunk.delta || ''
    };
  }

  return chunk;
}

module.exports = {
  createOpenAIChatCompletion,
  createOpenAIStreamChunk,
  createOpenAIModels,
  parseLlmUtilsChatSSE,
  parseLlmUtilsChatStream,
  normalizeLlmUtilsChunk,
  llmUtilsChunkToOpenAI,
  parseTraeStreamChunk,
  parseAgentTaskStream,
  normalizeAgentTaskChunk,
  traeChunkToOpenAI
};
