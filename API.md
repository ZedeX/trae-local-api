# API 接口文档

Trae Local API 提供与 OpenAI API 兼容的接口，基础地址为 `http://localhost:9900`。

## 认证

所有 API 请求需要在 Header 中携带 API Key：

```
Authorization: Bearer trae-local-api-key
```

API Key 在 `.env` 文件中的 `API_KEY` 字段配置，默认为 `trae-local-api-key`。

---

## 端点列表

### POST /v1/chat/completions

OpenAI 兼容的对话补全接口。

**请求体**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `messages` | array | 是 | 消息列表，格式同 OpenAI |
| `model` | string | 否 | 模型名称，默认 `"auto"` |
| `stream` | boolean | 否 | 是否流式输出，默认 `true` |
| `function` | string | 否 | Trae 函数类型，默认根据 model 自动选择 |
| `config_name` | string | 否 | 模型配置名称，默认根据 model 自动选择 |
| `workspace_dir` | string | 否 | 工作区目录 |
| `temperature` | number | 否 | 温度参数（当前未传递给后端） |
| `max_tokens` | number | 否 | 最大 token 数（当前未传递给后端） |

**messages 格式**：

```json
[
  { "role": "system", "content": "You are a helpful assistant." },
  { "role": "user", "content": "Hello!" },
  { "role": "assistant", "content": "Hi there!" },
  { "role": "user", "content": "How are you?" }
]
```

`content` 字段支持字符串和数组两种格式，服务器会自动转换为 Trae 所需的数组格式。

**请求示例**：

```json
{
  "model": "auto",
  "messages": [
    { "role": "user", "content": "Hello!" }
  ],
  "stream": true
}
```

**流式响应**（SSE 格式）：

```
data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","created":1778167167,"model":"auto","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}

data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","created":1778167168,"model":"auto","choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}

data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","created":1778167168,"model":"auto","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: [DONE]
```

**非流式响应**：

```json
{
  "id": "chatcmpl-xxx",
  "object": "chat.completion",
  "created": 1778167167,
  "model": "auto",
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "Hello"
    },
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 0,
    "completion_tokens": 0,
    "total_tokens": 0
  }
}
```

**推理内容响应**（使用 `solo_coder` 或推理模型时）：

```
data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"reasoning_content":"Let me think..."},"finish_reason":null}]}

data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"4"},"finish_reason":null}]}

data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: [DONE]
```

**错误响应**：

```json
{
  "error": {
    "message": "Error description",
    "type": "auth_error | invalid_request_error | internal_error"
  }
}
```

| HTTP 状态码 | 类型 | 说明 |
|------------|------|------|
| 400 | `invalid_request_error` | 请求参数错误 |
| 401 | `auth_error` | API Key 无效或 Trae token 过期 |
| 500 | `internal_error` | 服务器内部错误 |

---

### GET /v1/models

获取可用模型列表。

**响应**：

```json
{
  "object": "list",
  "data": [
    { "id": "auto", "object": "model", "created": 1778167167, "owned_by": "trae" },
    { "id": "glm-5.1", "object": "model", "created": 1778167167, "owned_by": "trae" },
    { "id": "deepseek-v3", "object": "model", "created": 1778167167, "owned_by": "trae" }
  ]
}
```

---

### GET /v1/models/detail

获取详细的模型配置信息。

**查询参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `function` | string | 否 | 函数类型，默认 `"chat_v3"` |

**请求示例**：

```
GET /v1/models/detail?function=chat_v3
```

**响应**：返回 Trae `get_detail_param` API 的原始响应，包含完整的模型配置列表。

---

### GET /v1/status

获取服务器状态和认证信息。

**响应**：

```json
{
  "status": "ok",
  "edition": "cn",
  "token_expired": false,
  "token_expires_at": "2026-05-21T12:00:00Z",
  "user_id": "1234567890",
  "user_region": { "region": "CN" },
  "api_host": "https://trae-api-cn.mchost.guru",
  "account": { "username": "user@example.com" },
  "workspace_dir": "d:\\_program\\Trae",
  "device_ids": { "machine_id": "87ddf83d..." }
}
```

---

### GET /v1/chat/modes

获取聊天模式信息。

**响应**：返回 Trae `chat_mode` API 的原始响应。

---

### POST /v1/encrypt

加密文本。

**请求体**：

```json
{
  "text": "需要加密的文本"
}
```

**响应**：

```json
{
  "encrypted": "<iv>:<authTag>:<ciphertext>",
  "hash": "<sha256_hash>"
}
```

---

### POST /v1/decrypt

解密文本。

**请求体**：

```json
{
  "encrypted": "<iv>:<authTag>:<ciphertext>"
}
```

**响应**：

```json
{
  "decrypted": "原始文本"
}
```

---

### GET /

获取 API 基本信息。

**响应**：

```json
{
  "name": "Trae Local API",
  "version": "2.0.0",
  "description": "OpenAI-compatible API wrapper for Trae IDE",
  "endpoints": {
    "chat": "POST /v1/chat/completions",
    "models": "GET /v1/models",
    "models_detail": "GET /v1/models/detail?function=chat_v3",
    "chat_modes": "GET /v1/chat/modes",
    "status": "GET /v1/status",
    "encrypt": "POST /v1/encrypt",
    "decrypt": "POST /v1/decrypt"
  },
  "primary_endpoint": "/api/agent/v3/llm_utils_chat",
  "functions": ["inline_chat", "solo_coder", "chat_v3", "builder_v3", "system_diagnosis"]
}
```

---

## 模型与函数映射

当指定 `model` 参数时，服务器会自动选择最合适的函数类型和配置：

| model 值 | 自动选择的 function | 实际传递方式 |
|----------|-------------------|-------------|
| `auto` | `inline_chat` | (不传 model 字段) |
| `glm-5` | `chat_v3` | `model: "glm-5"` |
| `glm-5.1` | `chat_v3` | `model: "glm-5.1"` |
| `deepseek-v3` | `chat_v3` | `model: "deepseek-v3"` |
| `deepseek-r1` | `chat_v3` | `model: "deepseek-r1"` |
| `doubao-1-6` | `chat_v3` | `model: "doubao-1-6"` |
| `claude-3.5-sonnet` | `chat_v3` | `model: "claude-3.5-sonnet"` |
| `gpt-4o` | `chat_v3` | `model: "gpt-4o"` |
| 其他 | `chat_v3` | `model: (模型名称原值)` |

> **重要**：`config_name` 参数在 `llm_utils_chat` 端点中不受支持（返回 4001/4023 错误）。模型选择通过 `model` 字段实现，请勿手动指定 `config_name`。

如果同时指定了 `function` 参数，则使用指定的函数类型，覆盖自动选择。

---

## SSE 事件类型参考

以下是 Trae 后端返回的原始 SSE 事件类型（服务器内部处理，客户端无需关心）：

| 事件 | 数据格式 | 说明 |
|------|---------|------|
| `metadata` | `{model, session_id, ...}` | 会话元数据 |
| `timing_cost` | `{preprocess_timing, ...}` | 性能指标 |
| `output` | `{response, reasoning_content, tool_calls}` | 内容输出 |
| `token_usage` | `{prompt_tokens, completion_tokens, total_tokens}` | Token 用量 |
| `extra_info` | `{model, version, content}` | 额外模型信息 |
| `progress_notice` | `"Processing_xxx"` | 进度通知 |
| `done` | `{finish_reason}` | 流结束 |
| `error` | `{code, message, extra}` | 错误事件 |

### 常见错误码

| 错误码 | 说明 | 处理方式 |
|--------|------|---------|
| 1005 | 未知错误 | 检查函数类型是否支持 |
| 2001 | 函数为空 | 确保请求包含 `function` 字段 |
| 4001 | 配置错误 | 检查 `config_name` 是否正确 |
| 4011 | 速率限制 | 等待后重试（服务器自动处理） |
| 4023 | 内部错误 | 稍后重试 |

---

## 与 OpenAI API 的兼容性

### 完全兼容

- `POST /v1/chat/completions` - 请求格式和响应格式
- `GET /v1/models` - 模型列表格式
- SSE 流式输出格式
- Bearer Token 认证

### 差异

| 特性 | OpenAI API | Trae Local API |
|------|-----------|----------------|
| `usage` 字段 | 精确的 token 计数 | 流式模式下可能为 0 |
| `reasoning_content` | DeepSeek 扩展 | 支持（solo_coder 函数） |
| `function` 参数 | 不支持 | 支持（Trae 特有） |
| `config_name` 参数 | 不支持 | 支持（Trae 特有） |
| `temperature` | 支持 | 当前未传递给后端 |
| `max_tokens` | 支持 | 当前未传递给后端 |
| `tools` / `function_call` | 支持 | 当前未支持 |
