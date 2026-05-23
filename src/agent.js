const { llmUtilsChat, chatCompletion, createAgentTask, resolveModelOptions } = require('./trae-client');
const { parseLlmUtilsChatStream, parseAgentTaskStream, parseTraeStreamChunk, createOpenAIStreamChunk } = require('./openai-format');
const { executeTool, getToolDefinitions, getToolSystemPrompt } = require('./tools');
const { v4: uuidv4 } = require('./uuid');

const MAX_TOOL_ROUNDS = 8;
const TOOL_CALL_PATTERN = /<tool_call\b[^>]*>([\s\S]*?)<\/tool_call\s*>/gi;
const TOOL_CALL_JSON = /\{"name"\s*:\s*"(\w+)"\s*,\s*"arguments"\s*:\s*(\{[\s\S]*?\})\s*\}/;

async function runAgentLoop(messages, model, stream, options) {
  const toolDefs = getToolDefinitions(options?.tool_names);
  const systemPrompt = getToolSystemPrompt();
  const maxRounds = options?.max_tool_rounds || MAX_TOOL_ROUNDS;

  const agentMessages = [...messages];
  if (!agentMessages.some(m => m.role === 'system')) {
    agentMessages.unshift({ role: 'system', content: systemPrompt });
  }

  const allToolCalls = [];
  let round = 0;
  let finalContent = '';
  let finalReasoning = '';

  while (round < maxRounds) {
    round++;
    console.log(`[agent] Round ${round}/${maxRounds}`);

    const roundResult = await callLlmWithTools(agentMessages, model, toolDefs, options);

    if (roundResult.toolCalls && roundResult.toolCalls.length > 0) {
      for (const tc of roundResult.toolCalls) {
        console.log(`[agent] Tool call: ${tc.name}(${JSON.stringify(tc.arguments).substring(0, 100)})`);

        const toolResult = await executeTool(tc.name, tc.arguments);
        const resultStr = JSON.stringify(toolResult);

        allToolCalls.push({
          round: round,
          name: tc.name,
          arguments: tc.arguments,
          result: toolResult
        });

        agentMessages.push({
          role: 'assistant',
          content: `[Tool Call: ${tc.name}]\nArguments: ${JSON.stringify(tc.arguments)}\n\nResult:\n${resultStr.substring(0, 3000)}`
        });

        agentMessages.push({
          role: 'user',
          content: `The tool "${tc.name}" returned the following result:\n\`\`\`json\n${resultStr.substring(0, 5000)}\n\`\`\`\n\nPlease analyze this result and respond to the user. If you need more information, call another tool. Otherwise, provide your final answer.`
        });
      }
    } else {
      finalContent = roundResult.content || '';
      finalReasoning = roundResult.reasoning || '';
      break;
    }

    if (round >= maxRounds) {
      finalContent = roundResult.content || 'Reached maximum tool call rounds. Here is what I found so far:';
      break;
    }
  }

  return {
    content: finalContent,
    reasoning: finalReasoning,
    toolCalls: allToolCalls,
    rounds: round,
  };
}

async function callLlmWithTools(messages, model, toolDefs, options) {
  const toolPrompt = buildToolPrompt(toolDefs);
  const enhancedMessages = [...messages];

  const lastUserMsg = enhancedMessages.findIndex(m => m.role === 'user');
  if (lastUserMsg >= 0) {
    const existing = enhancedMessages[lastUserMsg].content;
    if (typeof existing === 'string' && !existing.includes('Available tools:')) {
      enhancedMessages[lastUserMsg] = {
        ...enhancedMessages[lastUserMsg],
        content: existing + '\n\n' + toolPrompt
      };
    }
  }

  const result = await llmUtilsChat(enhancedMessages, model, true, options);

  let fullContent = '';
  let fullReasoning = '';
  let buffer = '';
  let currentEventName = '';

  if (result.body) {
    await new Promise((resolve, reject) => {
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

          if (parsed.type === 'text' && parsed.content) {
            fullContent += parsed.content;
          }
          if (parsed.type === 'text' && parsed.reasoning) {
            fullReasoning += parsed.reasoning;
          }
          if (parsed.type === 'done') {
            // stream done
          }
        }
      });

      result.body.on('end', resolve);
      result.body.on('error', reject);
    });
  }

  const toolCalls = extractToolCalls(fullContent);

  if (toolCalls.length > 0) {
    let cleanedContent = fullContent;
    for (const tc of toolCalls) {
      cleanedContent = cleanedContent.replace(tc._raw, '');
    }
    cleanedContent = cleanedContent.trim();

    return {
      content: cleanedContent,
      reasoning: fullReasoning,
      toolCalls: toolCalls,
    };
  }

  return {
    content: fullContent,
    reasoning: fullReasoning,
    toolCalls: [],
  };
}

function buildToolPrompt(toolDefs) {
  const toolDescs = toolDefs.map(t => {
    const fn = t.function;
    const params = fn.parameters?.properties
      ? Object.entries(fn.parameters.properties).map(([k, v]) => `${k}: ${v.description || v.type}`).join(', ')
      : '';
    return `- ${fn.name}(${params}): ${fn.description}`;
  }).join('\n');

  return `[Available tools - use XML format to call them]:
${toolDescs}

To call a tool, include this in your response:
<tool_call >
{"name": "tool_name", "arguments": {"param1": "value1"}}
</tool_call >

You can call multiple tools in one response. After receiving tool results, analyze them and respond to the user. Call tools ONLY when needed for the user's request.`;
}

function extractToolCalls(content) {
  const calls = [];
  let match;

  TOOL_CALL_PATTERN.lastIndex = 0;
  while ((match = TOOL_CALL_PATTERN.exec(content)) !== null) {
    const inner = match[1].trim();
    const jsonMatch = TOOL_CALL_JSON.exec(inner);
    if (jsonMatch) {
      try {
        const name = jsonMatch[1];
        const args = JSON.parse(jsonMatch[2]);
        calls.push({
          name: name,
          arguments: args,
          _raw: match[0],
        });
      } catch (e) {
        console.log(`[agent] Failed to parse tool call JSON: ${e.message}`);
      }
    } else {
      try {
        const parsed = JSON.parse(inner);
        if (parsed.name) {
          calls.push({
            name: parsed.name,
            arguments: parsed.arguments || {},
            _raw: match[0],
          });
        }
      } catch (e) {
        console.log(`[agent] Failed to parse tool call: ${e.message}`);
      }
    }
  }

  return calls;
}

async function runAgentStream(messages, model, res, completionId, modelName, options) {
  const toolDefs = getToolDefinitions(options?.tool_names);
  const systemPrompt = getToolSystemPrompt();
  const maxRounds = options?.max_tool_rounds || MAX_TOOL_ROUNDS;

  const agentMessages = [...messages];
  if (!agentMessages.some(m => m.role === 'system')) {
    agentMessages.unshift({ role: 'system', content: systemPrompt });
  }

  const allToolCalls = [];
  let round = 0;

  while (round < maxRounds) {
    round++;
    console.log(`[agent-stream] Round ${round}/${maxRounds}`);

    const toolPrompt = buildToolPrompt(toolDefs);
    const enhancedMessages = [...agentMessages];

    const lastUserMsg = enhancedMessages.findIndex(m => m.role === 'user');
    if (lastUserMsg >= 0) {
      const existing = enhancedMessages[lastUserMsg].content;
      if (typeof existing === 'string' && !existing.includes('Available tools:')) {
        enhancedMessages[lastUserMsg] = {
          ...enhancedMessages[lastUserMsg],
          content: existing + '\n\n' + toolPrompt
        };
      }
    }

    if (round > 1) {
      const roundInfo = createOpenAIStreamChunk(completionId, modelName, {
        content: `\n\n[Agent Round ${round}...] `
      }, null);
      res.write(`data: ${JSON.stringify(roundInfo)}\n\n`);
    }

    const streamResult = await llmUtilsChat(enhancedMessages, model, true, options);

    let fullContent = '';
    let fullReasoning = '';
    let buffer = '';
    let currentEventName = '';
    let streamDone = false;

    if (streamResult.body) {
      await new Promise((resolve, reject) => {
        streamResult.body.on('data', (chunk) => {
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

            if (parsed.type === 'text' && parsed.content) {
              fullContent += parsed.content;
            }
            if (parsed.type === 'text' && parsed.reasoning) {
              fullReasoning += parsed.reasoning;
            }
            if (parsed.type === 'done') {
              streamDone = true;
            }
          }
        });

        streamResult.body.on('end', resolve);
        streamResult.body.on('error', reject);
      });
    }

    const toolCalls = extractToolCalls(fullContent);

    if (toolCalls.length > 0) {
      let cleanedContent = fullContent;
      for (const tc of toolCalls) {
        cleanedContent = cleanedContent.replace(tc._raw, '');
      }
      cleanedContent = cleanedContent.trim();

      if (cleanedContent) {
        const contentChunk = createOpenAIStreamChunk(completionId, modelName, {
          content: cleanedContent
        }, null);
        res.write(`data: ${JSON.stringify(contentChunk)}\n\n`);
      }

      for (const tc of toolCalls) {
        console.log(`[agent-stream] Tool call: ${tc.name}`);

        const toolInfo = createOpenAIStreamChunk(completionId, modelName, {
          content: `\n[Calling tool: ${tc.name}...] `
        }, null);
        res.write(`data: ${JSON.stringify(toolInfo)}\n\n`);

        const toolResult = await executeTool(tc.name, tc.arguments);
        const resultStr = JSON.stringify(toolResult);

        allToolCalls.push({
          round: round,
          name: tc.name,
          arguments: tc.arguments,
          result: toolResult
        });

        const toolResultInfo = createOpenAIStreamChunk(completionId, modelName, {
          content: `\n[Tool ${tc.name} completed] `
        }, null);
        res.write(`data: ${JSON.stringify(toolResultInfo)}\n\n`);

        agentMessages.push({
          role: 'assistant',
          content: `[Tool Call: ${tc.name}]\nArguments: ${JSON.stringify(tc.arguments)}\n\nResult:\n${resultStr.substring(0, 3000)}`
        });

        agentMessages.push({
          role: 'user',
          content: `The tool "${tc.name}" returned the following result:\n\`\`\`json\n${resultStr.substring(0, 5000)}\n\`\`\`\n\nPlease analyze this result and respond to the user. If you need more information, call another tool. Otherwise, provide your final answer.`
        });
      }
    } else {
      if (fullContent) {
        const contentChunk = createOpenAIStreamChunk(completionId, modelName, {
          content: fullContent
        }, null);
        res.write(`data: ${JSON.stringify(contentChunk)}\n\n`);
      }
      break;
    }

    if (round >= maxRounds) {
      const limitInfo = createOpenAIStreamChunk(completionId, modelName, {
        content: '\n\n[Reached maximum tool call rounds]'
      }, null);
      res.write(`data: ${JSON.stringify(limitInfo)}\n\n`);
      break;
    }
  }

  return {
    toolCalls: allToolCalls,
    rounds: round,
  };
}

module.exports = {
  runAgentLoop,
  runAgentStream,
  extractToolCalls,
  MAX_TOOL_ROUNDS,
};
