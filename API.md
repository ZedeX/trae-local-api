# API 接口文档

Trae Local API 提供与 OpenAI API 兼容的接口，基础地址为 `http://localhost:19900`。

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
| `save_to` | string | 否 | 将 AI 回复内容保存到文件（相对路径基于 WORKSPACE_DIR，绝对路径直接使用） |
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
  "device_ids": { "machine_id": "abc123..." }
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
| `save_to` 参数 | 不支持 | 支持（流式保存到文件） |
| `/v1/chat/file` | 不支持 | 支持（专用文件生成端点） |
| `/v1/files` | 不支持 | 支持（工作区文件管理） |

---

### POST /v1/chat/file

专用文件生成端点。AI 生成内容后直接保存到硬盘文件，返回 JSON 结果（非流式）。

**请求体**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `messages` | array | 是 | 消息列表，格式同 OpenAI |
| `filename` | string | 是 | 输出文件名（如 `"report.md"`、`"page.html"`），相对路径基于 WORKSPACE_DIR |
| `model` | string | 否 | 模型名称，默认 `"auto"` |
| `function` | string | 否 | Trae 函数类型 |
| `workspace_dir` | string | 否 | 工作区目录，默认使用 .env 中的 WORKSPACE_DIR |
| `overwrite` | boolean | 否 | 是否覆盖已存在的文件，默认 `false` |

**请求示例**：

```json
{
  "model": "auto",
  "messages": [
    { "role": "user", "content": "Write a markdown report about Python best practices" }
  ],
  "filename": "python-report.md",
  "overwrite": true
}
```

**成功响应**：

```json
{
  "id": "chatcmpl-xxx",
  "object": "chat.completion.file",
  "created": 1778172000,
  "model": "auto",
  "filename": "python-report.md",
  "saved_to": "/path/to/your/workspace/python-report.md",
  "file_size": 2048,
  "content_preview": "# Python Best Practices\n\n...",
  "finish_reason": "stop",
  "usage": {
    "prompt_tokens": 50,
    "completion_tokens": 500,
    "total_tokens": 550
  }
}
```

**文件已存在响应**（HTTP 409）：

```json
{
  "error": {
    "message": "File already exists: /path/to/your/workspace/report.md. Set overwrite=true to replace.",
    "type": "file_exists",
    "path": "/path/to/your/workspace/report.md"
  }
}
```

**使用场景**：

- 生成 Markdown 文档
- 生成 HTML 页面
- 生成代码文件
- 生成配置文件
- 任何需要将 AI 输出保存为文件的场景

---

### GET /v1/files

列出工作区目录中的文件。

**查询参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `workspace_dir` | string | 否 | 工作区目录，默认使用 .env 中的 WORKSPACE_DIR |

**响应**：

```json
{
  "workspace": "/path/to/your/workspace",
  "files": [
    { "name": "report.md", "path": "report.md", "size": 2048, "modified": "2026-05-08T10:00:00.000Z" },
    { "name": "page.html", "path": "page.html", "size": 4096, "modified": "2026-05-08T10:05:00.000Z" }
  ],
  "total": 2
}
```

---

### GET /v1/files/read

读取工作区中的文件内容。

**查询参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `path` | string | 是 | 文件路径（相对于工作区目录） |
| `workspace_dir` | string | 否 | 工作区目录，默认使用 .env 中的 WORKSPACE_DIR |

**请求示例**：

```
GET /v1/files/read?path=report.md
```

**响应**：

```json
{
  "path": "report.md",
  "full_path": "/path/to/your/workspace/report.md",
  "size": 2048,
  "content": "# Report\n\nThis is the content..."
}
```

---

### save_to 参数（/v1/chat/completions）

在 `/v1/chat/completions` 端点中添加 `save_to` 参数，可以在流式输出的同时将完整内容保存到文件。

**使用方式**：

```json
{
  "model": "auto",
  "messages": [
    { "role": "user", "content": "Write a summary of AI trends" }
  ],
  "stream": true,
  "save_to": "ai-summary.md"
}
```

**行为说明**：

- 流式输出正常进行（客户端可以实时看到内容）
- 流结束后，完整内容自动保存到指定文件
- 保存成功后，流中会追加一条提示：`[File saved: /path/to/your/workspace/ai-summary.md]`
- 保存失败时，流中会追加错误提示：`[File save failed: ...]`
- `save_to` 支持相对路径（基于 WORKSPACE_DIR）和绝对路径

**与 /v1/chat/file 的区别**：

| 特性 | `/v1/chat/completions` + `save_to` | `/v1/chat/file` |
|------|--------------------------------------|-----------------|
| 响应方式 | 流式（SSE） | JSON（非流式） |
| 实时查看 | 可以 | 不可以 |
| 文件覆盖 | 自动覆盖 | 需设置 `overwrite=true` |
| 返回内容 | SSE 流 + 保存提示 | 文件路径、大小、预览 |
| 适用场景 | 边看边存 | 只存不看 |

---

### GET /v1/sync/pending

查看待同步的文件列表（sandbox 限制导致无法直接写入目标目录时使用）。

**请求参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| 无 | - | - |

**响应示例**：

```json
{
  "workspace": "d:\\_program\\Trae\\zx-test\\output",
  "sync_dir": "/path/to/your/workspace",
  "pending_files": [
    {
      "src": "d:\\_program\\Trae\\zx-test\\output\\report.md",
      "dest": "/path/to/your/workspace/report.md",
      "rel": "report.md"
    }
  ],
  "count": 1
}
```

### POST /v1/sync/clear

清除待同步文件列表。

**响应示例**：

```json
{
  "cleared": 3
}
```

---

## Trae CN 解密模块

Trae CN 版的 `storage.json` 使用自定义 "tc" 加密格式存储认证数据。本项目已完全破解此加密格式，服务器启动时自动解密，无需手动干预。

### 加密格式说明

| 字段 | 偏移 | 长度 | 说明 |
|------|------|------|------|
| Header | 0 | 6 | 加密类型标识：`tc\x05\x10\x00\x00`（AES）或 `\x12\x39\x20\x20\x02\x03`（AES_PRIVATE） |
| RandomBytes | 6 | 32 | 随机数，用于密钥派生 |
| EncryptedData | 38 | 剩余 | AES-128-CBC 加密数据（前 64 字节为 SHA-512 哈希，剩余为明文） |

### 密钥派生

```
1. salt = SALT_A XOR SALT_B（AES 类型）或 SALT_C XOR SALT_D（AES_PRIVATE 类型）
2. hashOfRandom = SHA-512(randomBytes)
3. finalHash = SHA-512(hashOfRandom + salt)
4. aesKey = finalHash[0:16]
5. iv = finalHash[16:32]
```

### 测试解密

可通过 `api-test-advanced.bat` 的选项 10/11 测试解密功能，或直接使用 Node.js：

```javascript
const { decryptAuthData, decryptAllEncryptedValues } = require('./src/trae-decrypt');

// 解密认证数据
const auth = decryptAuthData();
console.log('Token expires at:', auth.expiredAt);

// 解密所有加密值
const all = decryptAllEncryptedValues();
console.log('Decrypted keys:', Object.keys(all));
```
