const { v4: uuidv4 } = require('./uuid');

function createAnthropicMessage(id, model, content, stopReason, usage, thinking) {
  const contentBlocks = [];

  if (thinking) {
    contentBlocks.push({
      type: 'thinking',
      thinking: thinking
    });
  }

  if (typeof content === 'string') {
    contentBlocks.push({
      type: 'text',
      text: content
    });
  } else if (Array.isArray(content)) {
    contentBlocks.push(...content);
  }

  return {
    id: id || `msg_${uuidv4().replace(/-/g, '').substring(0, 24)}`,
    type: 'message',
    role: 'assistant',
    content: contentBlocks,
    model: model,
    stop_reason: stopReason || 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: usage?.input_tokens || usage?.prompt_tokens || 0,
      output_tokens: usage?.output_tokens || usage?.completion_tokens || 0
    }
  };
}

function createAnthropicStreamEvent(eventType, data) {
  return {
    type: eventType,
    ...data
  };
}

function createAnthropicMessageStart(id, model, usage) {
  return createAnthropicStreamEvent('message_start', {
    message: {
      id: id || `msg_${uuidv4().replace(/-/g, '').substring(0, 24)}`,
      type: 'message',
      role: 'assistant',
      content: [],
      model: model,
      stop_reason: null,
      stop_sequence: null,
      usage: {
        input_tokens: usage?.input_tokens || usage?.prompt_tokens || 0,
        output_tokens: 0
      }
    }
  });
}

function createAnthropicContentBlockStart(index, type, data) {
  return createAnthropicStreamEvent('content_block_start', {
    index: index,
    content_block: {
      type: type || 'text',
      ...data
    }
  });
}

function createAnthropicContentBlockDelta(index, delta) {
  return createAnthropicStreamEvent('content_block_delta', {
    index: index,
    delta: delta
  });
}

function createAnthropicContentBlockStop(index) {
  return createAnthropicStreamEvent('content_block_stop', {
    index: index
  });
}

function createAnthropicMessageDelta(stopReason, usage) {
  const result = {
    type: 'message_delta',
    delta: {
      stop_reason: stopReason || 'end_turn',
      stop_sequence: null
    }
  };
  if (usage) {
    result.usage = {
      output_tokens: usage.output_tokens || usage.completion_tokens || 0
    };
  }
  return result;
}

function createAnthropicMessageStop() {
  return createAnthropicStreamEvent('message_stop', {});
}

function createAnthropicPing() {
  return createAnthropicStreamEvent('ping', {});
}

function createAnthropicError(error) {
  return {
    type: 'error',
    error: {
      type: error.type || 'api_error',
      message: error.message || 'An error occurred'
    }
  };
}

function anthropicToOpenAIMessages(messages, system) {
  const openaiMessages = [];

  // Sanitize system content: strip billing header if present
  function sanitizeContent(text) {
    if (typeof text === 'string') {
      // Remove x-anthropic-billing-header line that may leak into content
      text = text.replace(/^x-anthropic-billing-header:.*\n?/gm, '');
      // Remove leading/trailing whitespace that accumulates
      text = text.trim();
    }
    return text;
  }

  if (system) {
    let systemContent = typeof system === 'string' ? system :
      (Array.isArray(system) ? system.map(s => s.text).join('\n') : '');
    systemContent = sanitizeContent(systemContent);
    if (systemContent) {
      openaiMessages.push({
        role: 'system',
        content: systemContent
      });
    }
  }

  for (const msg of messages) {
    const role = msg.role;
    let content = msg.content;

    if (typeof content === 'string') {
      openaiMessages.push({ role, content: role === 'system' ? sanitizeContent(content) : content });
    } else if (Array.isArray(content)) {
      const textParts = [];
      const toolResults = [];

      for (const block of content) {
        if (block.type === 'text') {
          textParts.push(block.text);
        } else if (block.type === 'image') {
          const source = block.source;
          if (source && source.type === 'base64') {
            textParts.push({
              type: 'image_url',
              image_url: {
                url: `data:${source.media_type};base64,${source.data}`
              }
            });
          }
        } else if (block.type === 'tool_use') {
          // Convert tool_use to <toolcall> format so the model continues using the correct format
          const toolCallText = `<toolcall>${JSON.stringify({ name: block.name, params: block.input || {} })}</toolcall>`;
          textParts.push(toolCallText);
        } else if (block.type === 'tool_result') {
          // Convert tool_result to user message with <tool_result> format
          const resultContent = typeof block.content === 'string' ? block.content :
            (Array.isArray(block.content) ? block.content.map(c => c.text || '').join('\n') : JSON.stringify(block.content));
          toolResults.push({
            role: 'user',
            content: `<tool_result for="${block.tool_use_id}">\n${resultContent}\n</tool_result>`
          });
        }
      }

      if (textParts.length > 0) {
        const textContent = textParts.map(p => typeof p === 'string' ? p : '').join('');
        openaiMessages.push({ role, content: textContent });
      }

      openaiMessages.push(...toolResults);
    }
  }

  return openaiMessages;
}

function openAIToAnthropicMessages(messages) {
  const anthropicMessages = [];
  let system = null;

  for (const msg of messages) {
    if (msg.role === 'system') {
      system = msg.content;
      continue;
    }

    if (msg.role === 'tool') {
      const lastAssistant = [...anthropicMessages].reverse().find(m => m.role === 'assistant');
      if (lastAssistant) {
        if (!lastAssistant.content) lastAssistant.content = [];
        if (typeof lastAssistant.content === 'string') {
          lastAssistant.content = [{ type: 'text', text: lastAssistant.content }];
        }
        lastAssistant.content.push({
          type: 'tool_result',
          tool_use_id: msg.tool_call_id,
          content: msg.content
        });
      }
      continue;
    }

    if (msg.role === 'assistant' && msg.tool_calls) {
      const content = [];
      if (msg.content) {
        content.push({ type: 'text', text: msg.content });
      }
      for (const tc of msg.tool_calls) {
        content.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.function?.name || tc.name,
          input: typeof tc.function?.arguments === 'string' ?
            JSON.parse(tc.function.arguments) : (tc.input || {})
        });
      }
      anthropicMessages.push({ role: 'assistant', content });
      continue;
    }

    anthropicMessages.push({
      role: msg.role,
      content: msg.content
    });
  }

  return { messages: anthropicMessages, system };
}

function openAIToAnthropicTools(tools) {
  if (!tools || !Array.isArray(tools)) return undefined;

  return tools.map(tool => {
    if (tool.type === 'function') {
      return {
        name: tool.function.name,
        description: tool.function.description || '',
        input_schema: tool.function.parameters || { type: 'object', properties: {} }
      };
    }
    return {
      name: tool.name,
      description: tool.description || '',
      input_schema: tool.input_schema || tool.parameters || { type: 'object', properties: {} }
    };
  });
}

function anthropicToOpenAITools(tools) {
  if (!tools || !Array.isArray(tools)) return undefined;

  return tools.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description || '',
      parameters: tool.input_schema || { type: 'object', properties: {} }
    }
  }));
}

function openAIResponseToAnthropic(response, model) {
  const choice = response.choices?.[0];
  const content = [];
  let stopReason = 'end_turn';

  if (choice?.message?.content) {
    content.push({
      type: 'text',
      text: choice.message.content
    });
  }

  if (choice?.message?.tool_calls) {
    for (const tc of choice.message.tool_calls) {
      content.push({
        type: 'tool_use',
        id: tc.id,
        name: tc.function?.name || tc.name,
        input: typeof tc.function?.arguments === 'string' ?
          JSON.parse(tc.function.arguments) : (tc.input || {})
      });
    }
    stopReason = 'tool_use';
  }

  if (choice?.finish_reason === 'length') {
    stopReason = 'max_tokens';
  } else if (choice?.finish_reason === 'stop') {
    stopReason = 'end_turn';
  }

  return createAnthropicMessage(
    response.id?.replace('chatcmpl-', 'msg_'),
    model || response.model,
    content,
    stopReason,
    response.usage
  );
}

function openAIStreamToAnthropic(chunk, messageId, model, state) {
  if (!state) {
    state = {
      messageStarted: false,
      contentBlockIndex: -1,
      currentContentType: null,
      textContent: '',
      toolCalls: []
    };
  }

  const events = [];

  if (!state.messageStarted) {
    events.push({
      event: 'message_start',
      data: createAnthropicMessageStart(messageId, model, { input_tokens: 0 })
    });
    state.messageStarted = true;
  }

  const choice = chunk.choices?.[0];

  if (choice?.delta?.content) {
    if (state.currentContentType !== 'text') {
      if (state.contentBlockIndex >= 0) {
        events.push({
          event: 'content_block_stop',
          data: { index: state.contentBlockIndex }
        });
      }
      state.contentBlockIndex++;
      state.currentContentType = 'text';
      events.push({
        event: 'content_block_start',
        data: createAnthropicContentBlockStart(state.contentBlockIndex, 'text', { text: '' })
      });
    }
    events.push({
      event: 'content_block_delta',
      data: createAnthropicContentBlockDelta(state.contentBlockIndex, {
        type: 'text_delta',
        text: choice.delta.content
      })
    });
    state.textContent += choice.delta.content;
  }

  if (choice?.delta?.tool_calls) {
    for (const tc of choice.delta.tool_calls) {
      if (tc.function?.name) {
        if (state.contentBlockIndex >= 0 && state.currentContentType !== 'tool_use') {
          events.push({
            event: 'content_block_stop',
            data: { index: state.contentBlockIndex }
          });
        }
        state.contentBlockIndex++;
        state.currentContentType = 'tool_use';
        state.toolCalls[state.contentBlockIndex] = {
          id: tc.id || `toolu_${uuidv4().replace(/-/g, '').substring(0, 24)}`,
          name: tc.function.name,
          input: ''
        };
        events.push({
          event: 'content_block_start',
          data: createAnthropicContentBlockStart(state.contentBlockIndex, 'tool_use', {
            id: state.toolCalls[state.contentBlockIndex].id,
            name: tc.function.name,
            input: {}
          })
        });
      }
      if (tc.function?.arguments && state.toolCalls[state.contentBlockIndex]) {
        events.push({
          event: 'content_block_delta',
          data: createAnthropicContentBlockDelta(state.contentBlockIndex, {
            type: 'input_json_delta',
            partial_json: tc.function.arguments
          })
        });
        state.toolCalls[state.contentBlockIndex].input += tc.function.arguments;
      }
    }
  }

  if (choice?.finish_reason) {
    if (state.contentBlockIndex >= 0) {
      events.push({
        event: 'content_block_stop',
        data: { index: state.contentBlockIndex }
      });
    }
    const stopReason = choice.finish_reason === 'tool_use' || state.toolCalls.length > 0 ?
      'tool_use' : (choice.finish_reason === 'length' ? 'max_tokens' : 'end_turn');
    events.push({
      event: 'message_delta',
      data: createAnthropicMessageDelta(stopReason, { output_tokens: 0 })
    });
    events.push({
      event: 'message_stop',
      data: {}
    });
  }

  return { events, state };
}

function llmUtilsChunkToAnthropic(chunk, messageId, model, state, toolMap) {
  if (!state) {
    state = {
      messageStarted: false,
      messageStopped: false,
      contentBlockIndex: -1,
      currentContentType: null,  // 'thinking' | 'text' | 'tool_use'
      textContent: '',
      reasoningContent: '',
      outputTokenCount: 0,
      hasToolUse: false,
      toolCallIndex: {},  // maps tool call index to {id, name, input}
      // Tool call streaming detection
      toolCallBuffer: '',     // buffer for detecting <toolcall> tags in text stream
      inToolCall: false,      // currently inside a <toolcall> tag
      pendingToolCalls: [],   // extracted tool calls waiting to be emitted
      suppressStopEvents: true, // always suppress - outer loop controls when to emit stop events
      stopReason: null,       // last stop reason from done event
    };
  }

  const events = [];

  // Skip any chunks after message_stop has been sent
  if (state.messageStopped) {
    return { events, state };
  }

  if (!state.messageStarted) {
    events.push({
      event: 'message_start',
      data: createAnthropicMessageStart(messageId, model, { input_tokens: 0 })
    });
    state.messageStarted = true;
  }

  // Handle reasoning/thinking content
  if (chunk.type === 'text' && chunk.reasoning) {
    if (state.currentContentType !== 'thinking') {
      // Close previous content block if any
      if (state.contentBlockIndex >= 0) {
        events.push({
          event: 'content_block_stop',
          data: createAnthropicStreamEvent('content_block_stop', { index: state.contentBlockIndex })
        });
      }
      state.contentBlockIndex++;
      state.currentContentType = 'thinking';
      events.push({
        event: 'content_block_start',
        data: createAnthropicContentBlockStart(state.contentBlockIndex, 'thinking', { thinking: '' })
      });
    }
    events.push({
      event: 'content_block_delta',
      data: createAnthropicContentBlockDelta(state.contentBlockIndex, {
        type: 'thinking_delta',
        thinking: chunk.reasoning
      })
    });
    state.reasoningContent += chunk.reasoning;
    state.outputTokenCount += Math.ceil(chunk.reasoning.length / 4);
  }

  // Handle text content - with <toolcall> tag detection and filtering
  if (chunk.type === 'text' && chunk.content) {
    state.textContent += chunk.content;
    state.outputTokenCount += Math.ceil(chunk.content.length / 4);

    // Process text through <toolcall> tag detector
    let textToEmit = '';
    const content = chunk.content;

    for (let i = 0; i < content.length; i++) {
      const ch = content[i];

      if (state.inToolCall) {
        // Inside a <toolcall> tag - buffer until </toolcall>
        state.toolCallBuffer += ch;
        // Check if buffer ends with </toolcall>
        if (state.toolCallBuffer.endsWith('</toolcall>')) {
          // Extract the tool call JSON
          const inner = state.toolCallBuffer.slice(0, -'</toolcall>'.length);
          try {
            const toolData = JSON.parse(inner.trim());
            state.pendingToolCalls.push({
              name: toolData.name || toolData.function?.name || '',
              input: toolData.params || toolData.arguments || toolData.input || {}
            });
          } catch (e) {
            console.error(`[anthropic-format] Failed to parse toolcall: ${e.message}, raw: ${inner.substring(0, 100)}`);
          }
          state.inToolCall = false;
          state.toolCallBuffer = '';
        }
      } else {
        // Not inside a toolcall - check for <toolcall> start
        state.toolCallBuffer += ch;

        // Check if buffer might be starting a <toolcall> tag
        if (ch === '>') {
          if (state.toolCallBuffer.endsWith('<toolcall>')) {
            // Found <toolcall> start - switch to tool call mode
            state.inToolCall = true;
            // Emit any text before the <toolcall> tag
            const beforeTag = state.toolCallBuffer.slice(0, -'<toolcall>'.length);
            textToEmit += beforeTag;
            state.toolCallBuffer = '';
            continue;
          }
        }

        // If buffer is getting long and doesn't match <toolcall>, flush it
        // <toolcall> is 10 chars, so we only need to buffer up to that length
        if (state.toolCallBuffer.length > 10) {
          // Check if buffer could still form <toolcall>
          const buf = state.toolCallBuffer;
          const couldBeToolcall = '<toolcall>'.startsWith(buf) || buf.includes('<');
          if (!couldBeToolcall) {
            // No chance of forming <toolcall>, flush the buffer
            textToEmit += buf;
            state.toolCallBuffer = '';
          } else if (buf.includes('<') && !'<toolcall>'.startsWith(buf.slice(buf.lastIndexOf('<')))) {
            // Has '<' but it can't form <toolcall>, flush up to and including '<'
            const ltIndex = buf.lastIndexOf('<');
            textToEmit += buf.slice(0, ltIndex + 1);
            state.toolCallBuffer = buf.slice(ltIndex + 1);
          }
        }
      }
    }

    // Emit filtered text (text without <toolcall> tags)
    if (textToEmit) {
      if (state.currentContentType !== 'text') {
        // Close previous content block if any
        if (state.contentBlockIndex >= 0) {
          events.push({
            event: 'content_block_stop',
            data: createAnthropicStreamEvent('content_block_stop', { index: state.contentBlockIndex })
          });
        }
        state.contentBlockIndex++;
        state.currentContentType = 'text';
        events.push({
          event: 'content_block_start',
          data: createAnthropicContentBlockStart(state.contentBlockIndex, 'text', { text: '' })
        });
      }
      events.push({
        event: 'content_block_delta',
        data: createAnthropicContentBlockDelta(state.contentBlockIndex, {
          type: 'text_delta',
          text: textToEmit
        })
      });
    }
  }

  // Handle tool calls
  if (chunk.type === 'text' && chunk.tool_calls && Array.isArray(chunk.tool_calls)) {
    for (let i = 0; i < chunk.tool_calls.length; i++) {
      const tc = chunk.tool_calls[i];

      // Close previous content block if any
      if (state.contentBlockIndex >= 0 && state.currentContentType !== 'tool_use') {
        events.push({
          event: 'content_block_stop',
          data: createAnthropicStreamEvent('content_block_stop', { index: state.contentBlockIndex })
        });
      }

      state.contentBlockIndex++;
      state.currentContentType = 'tool_use';
      state.hasToolUse = true;

      const toolId = tc.id || `toolu_${uuidv4().replace(/-/g, '').substring(0, 24)}`;
      const toolName = tc.function?.name || tc.name || '';
      const toolInput = tc.function?.arguments || '{}';

      state.toolCallIndex[state.contentBlockIndex] = {
        id: toolId,
        name: toolName,
        input: toolInput
      };

      events.push({
        event: 'content_block_start',
        data: createAnthropicContentBlockStart(state.contentBlockIndex, 'tool_use', {
          id: toolId,
          name: toolName,
          input: {}
        })
      });

      // Send the input as a single delta (Trae sends complete tool calls, not streaming)
      if (toolInput && toolInput !== '{}') {
        events.push({
          event: 'content_block_delta',
          data: createAnthropicContentBlockDelta(state.contentBlockIndex, {
            type: 'input_json_delta',
            partial_json: typeof toolInput === 'string' ? toolInput : JSON.stringify(toolInput)
          })
        });
      }

      // Close this tool_use block immediately since we have the complete data
      events.push({
        event: 'content_block_stop',
        data: createAnthropicStreamEvent('content_block_stop', { index: state.contentBlockIndex })
      });
      state.currentContentType = null;
    }
  }

  if (chunk.type === 'token_usage' && chunk.data) {
    if (chunk.data.completion_tokens) {
      state.outputTokenCount = chunk.data.completion_tokens;
    }
  }

  if (chunk.type === 'done') {
    // Flush toolCallBuffer
    if (state.toolCallBuffer) {
      if (state.inToolCall) {
        // <toolcall> was opened but </toolcall> never arrived (e.g. max_tokens truncation)
        // Try to extract tool call from the incomplete buffer
        const bufferContent = state.toolCallBuffer.trim();
        try {
          const toolData = JSON.parse(bufferContent);
          state.pendingToolCalls.push({
            name: toolData.name || toolData.function?.name || '',
            input: toolData.params || toolData.arguments || toolData.input || {}
          });
          console.log(`[anthropic-format] Recovered incomplete toolcall from buffer: ${toolData.name}`);
        } catch (e) {
          // Buffer is not valid JSON on its own - try to find JSON in it
          const jsonMatch = bufferContent.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try {
              const toolData = JSON.parse(jsonMatch[0]);
              state.pendingToolCalls.push({
                name: toolData.name || toolData.function?.name || '',
                input: toolData.params || toolData.arguments || toolData.input || {}
              });
              console.log(`[anthropic-format] Recovered toolcall from partial buffer: ${toolData.name}`);
            } catch (e2) {
              console.warn(`[anthropic-format] Could not parse incomplete toolcall buffer, discarding: ${bufferContent.substring(0, 100)}`);
            }
          }
        }
        state.inToolCall = false;
        state.toolCallBuffer = '';
      } else {
        // Not inside a toolcall - flush remaining buffer as text
        const remaining = state.toolCallBuffer;
        state.toolCallBuffer = '';
        if (remaining) {
          if (state.currentContentType !== 'text') {
            if (state.contentBlockIndex >= 0) {
              events.push({
                event: 'content_block_stop',
                data: createAnthropicStreamEvent('content_block_stop', { index: state.contentBlockIndex })
              });
            }
            state.contentBlockIndex++;
            state.currentContentType = 'text';
            events.push({
              event: 'content_block_start',
              data: createAnthropicContentBlockStart(state.contentBlockIndex, 'text', { text: '' })
            });
          }
          events.push({
            event: 'content_block_delta',
            data: createAnthropicContentBlockDelta(state.contentBlockIndex, {
              type: 'text_delta',
              text: remaining
            })
          });
        }
      }
    }

    // Fallback: check for <toolcall> tags in accumulated textContent
    // (in case the streaming detector missed some due to chunk boundaries)
    // Support both closed and unclosed tags
    const extractedToolCalls = [];

    // Strict match: <toolcall>...</toolcall>
    const strictRegex = /<toolcall>\s*([\s\S]*?)\s*<\/toolcall>/g;
    let match;
    while ((match = strictRegex.exec(state.textContent)) !== null) {
      try {
        const toolData = JSON.parse(match[1]);
        const tc = {
          name: toolData.name || toolData.function?.name || '',
          input: toolData.params || toolData.arguments || toolData.input || {}
        };
        const alreadyDetected = state.pendingToolCalls.some(
          p => p.name === tc.name && JSON.stringify(p.input) === JSON.stringify(tc.input)
        );
        if (!alreadyDetected) {
          extractedToolCalls.push(tc);
        }
      } catch (e) {
        console.error(`[anthropic-format] Failed to parse toolcall (strict): ${e.message}`);
      }
    }

    // Loose match: <toolcall>... without closing tag (handles truncation)
    const looseRegex = /<toolcall>\s*([\s\S]*?)(?:<\/toolcall>|$)/g;
    while ((match = looseRegex.exec(state.textContent)) !== null) {
      try {
        const raw = match[1].trim();
        if (!raw) continue;
        const toolData = JSON.parse(raw);
        const tc = {
          name: toolData.name || toolData.function?.name || '',
          input: toolData.params || toolData.arguments || toolData.input || {}
        };
        const alreadyDetected = state.pendingToolCalls.some(
          p => p.name === tc.name && JSON.stringify(p.input) === JSON.stringify(tc.input)
        ) || extractedToolCalls.some(
          p => p.name === tc.name && JSON.stringify(p.input) === JSON.stringify(tc.input)
        );
        if (!alreadyDetected) {
          extractedToolCalls.push(tc);
          console.log(`[anthropic-format] Recovered toolcall from loose match: ${tc.name}`);
        }
      } catch (e) {
        // Not valid JSON, skip
      }
    }

    // Merge streaming-detected and fallback-detected tool calls
    const allToolCalls = [...state.pendingToolCalls, ...extractedToolCalls];
    const hasToolCalls = allToolCalls.length > 0;

    // Close any open content block (but DON'T reset contentBlockIndex)
    if (state.contentBlockIndex >= 0 && state.currentContentType !== null) {
      events.push({
        event: 'content_block_stop',
        data: createAnthropicStreamEvent('content_block_stop', { index: state.contentBlockIndex })
      });
      state.currentContentType = null;
      // IMPORTANT: Do NOT reset contentBlockIndex, keep it incrementing for tool_use blocks
    }

    // Create tool_use content blocks for all extracted tool calls
    if (hasToolCalls) {
      state.hasToolUse = true;

      for (const tc of allToolCalls) {
        // Map tool name using toolMap if available
        let mappedName = tc.name;
        if (toolMap) {
          const nameLower = tc.name.toLowerCase();
          if (toolMap[nameLower]) {
            mappedName = toolMap[nameLower];
          } else if (toolMap[tc.name]) {
            mappedName = toolMap[tc.name];
          }
        }

        state.contentBlockIndex++;
        const toolId = `toolu_${uuidv4().replace(/-/g, '').substring(0, 24)}`;

        events.push({
          event: 'content_block_start',
          data: createAnthropicContentBlockStart(state.contentBlockIndex, 'tool_use', {
            id: toolId,
            name: mappedName,
            input: {}
          })
        });

        const inputJson = typeof tc.input === 'string' ? tc.input : JSON.stringify(tc.input);
        if (inputJson && inputJson !== '{}') {
          events.push({
            event: 'content_block_delta',
            data: createAnthropicContentBlockDelta(state.contentBlockIndex, {
              type: 'input_json_delta',
              partial_json: inputJson
            })
          });
        }

        events.push({
          event: 'content_block_stop',
          data: createAnthropicStreamEvent('content_block_stop', { index: state.contentBlockIndex })
        });
      }

      console.log(`[anthropic-format] Extracted ${allToolCalls.length} tool calls: ${allToolCalls.map(t => t.name).join(', ')} -> mapped: ${allToolCalls.map(t => toolMap?.[t.name.toLowerCase()] || t.name).join(', ')}`);
    }

    // Determine stop_reason
    let stopReason = 'end_turn';
    if (state.hasToolUse) {
      stopReason = 'tool_use';
    } else if (chunk.finish_reason === 'max_tokens') {
      stopReason = 'max_tokens';
    }
    state.stopReason = stopReason;

    // Only emit message_delta and message_stop if not suppressed (auto-continue may suppress these)
    if (!state.suppressStopEvents) {
      events.push({
        event: 'message_delta',
        data: createAnthropicMessageDelta(stopReason, { output_tokens: state.outputTokenCount })
      });
      events.push({
        event: 'message_stop',
        data: createAnthropicStreamEvent('message_stop', {})
      });
    }
    state.messageStopped = true;
  }

  if (chunk.type === 'error') {
    // Close any open content block before sending error
    if (state.contentBlockIndex >= 0 && state.currentContentType !== null) {
      events.push({
        event: 'content_block_stop',
        data: createAnthropicStreamEvent('content_block_stop', { index: state.contentBlockIndex })
      });
      state.contentBlockIndex = -1;
    }
    events.push({
      event: 'message_delta',
      data: createAnthropicMessageDelta('end_turn', { output_tokens: state.outputTokenCount })
    });
    events.push({
      event: 'message_stop',
      data: createAnthropicStreamEvent('message_stop', {})
    });
    state.messageStopped = true;
  }

  return { events, state };
}

module.exports = {
  createAnthropicMessage,
  createAnthropicStreamEvent,
  createAnthropicMessageStart,
  createAnthropicContentBlockStart,
  createAnthropicContentBlockDelta,
  createAnthropicContentBlockStop,
  createAnthropicMessageDelta,
  createAnthropicMessageStop,
  createAnthropicPing,
  createAnthropicError,
  anthropicToOpenAIMessages,
  openAIToAnthropicMessages,
  openAIToAnthropicTools,
  anthropicToOpenAITools,
  openAIResponseToAnthropic,
  openAIStreamToAnthropic,
  llmUtilsChunkToAnthropic
};
