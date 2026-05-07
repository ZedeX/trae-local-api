# 架构设计文档

## 系统架构总览

```
┌─────────────────────────────────────────────────────────────────┐
│                        客户端应用                                │
│  (curl / Python OpenAI SDK / Node.js / 任意 HTTP 客户端)        │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTP/SSE
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Trae Local API Server                         │
│                    (Express, localhost:9900)                     │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  认证中间件   │  │  路由处理     │  │  响应格式转换         │  │
│  │  authenticate │  │  /v1/*       │  │  OpenAI Format       │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
│         │                  │                      │              │
│  ┌──────┴───────┐  ┌──────┴───────┐  ┌──────────┴───────────┐  │
│  │   auth.js    │  │ trae-client  │  │  openai-format.js    │  │
│  │  认证管理     │  │  API 客户端   │  │  SSE 解析 + 转换     │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────────────────┘  │
│         │                  │                                     │
│  ┌──────┴───────┐  ┌──────┴───────┐  ┌──────────────────────┐  │
│  │  crypto.js   │  │   uuid.js    │  │     .env 配置        │  │
│  │  加解密       │  │  ID 生成      │  │                      │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTPS/SSE
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Trae 后端 API 服务                            │
│                                                                  │
│  CN: https://trae-api-cn.mchost.guru                            │
│  SG: https://coresg-normal.trae.ai                               │
│                                                                  │
│  /api/agent/v3/llm_utils_chat     (主端点 - 轻量对话)            │
│  /api/ide/v1/chat                 (回退端点 1 - 标准对话)        │
│  /api/agent/v3/create_agent_task  (回退端点 2 - 完整代理)        │
│  /api/ide/v1/get_detail_param     (模型配置查询)                 │
│  /cloudide/api/v3/trae/oauth/ExchangeToken (Token 刷新)         │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    模型提供商                                     │
│  GLM / Doubao / DeepSeek / Claude / GPT / Gemini / ...          │
└─────────────────────────────────────────────────────────────────┘
```

## 核心模块说明

### 1. server.js - HTTP 服务器

**职责**：提供 OpenAI 兼容的 HTTP API 端点

**关键设计**：
- 使用 Express 框架处理 HTTP 请求
- `authenticate` 中间件验证 API Key
- 三级回退策略：`llmUtilsChat` → `chatCompletion` → `createAgentTask`
- 流式响应使用 SSE 格式，非流式响应使用标准 JSON

**请求处理流程**：
```
POST /v1/chat/completions
  → authenticate() 验证 API Key
  → refreshTokenIfNeeded() 检查/刷新 token
  → 解析请求参数（model, messages, stream, function）
  → 设置 SSE 响应头
  → 发送 role chunk（assistant 角色）
  → 尝试 llmUtilsChat()
    → 成功：handleLlmUtilsStream() 处理流式输出
    → 失败：回退到 chatCompletion()
      → 成功：handleLegacyStream() 处理流式输出
      → 失败：回退到 createAgentTask()
        → 成功/失败：返回结果或错误
```

### 2. trae-client.js - API 客户端

**职责**：与 Trae 后端 API 通信

**关键设计**：
- `llmUtilsChat()` - 主端点，轻量级对话，支持多种函数类型
- `chatCompletion()` - 回退端点 1，标准对话
- `createAgentTask()` - 回退端点 2，完整代理模式
- `resolveModelOptions()` - 根据模型名称自动选择函数和配置
- `retryWithBackoff()` - 指数退避重试，处理速率限制

**模型选择策略**：
```
model="auto"     → function="inline_chat", 不传 model 字段
model="glm-5.1"  → function="chat_v3", model="glm-5.1"
model="gpt-4o"   → function="chat_v3", model="gpt-4o"
model="doubao-1-6" → function="chat_v3", model="doubao-1-6"
```

> **重要**：`config_name` 参数在 `llm_utils_chat` 端点中不受支持。模型选择通过 `model` 字段实现。

**消息格式转换**：
```
OpenAI 格式:  { role: "user", content: "Hello" }
                    ↓ 自动转换
Trae 格式:    { role: "user", content: [{ type: "text", text: "Hello" }] }
```

### 3. auth.js - 认证管理

**职责**：从 Trae IDE 存储中提取认证信息，管理 token 生命周期

**关键设计**：
- 自动检测 CN/SG 版本（优先使用 `.env` 配置，其次按文件修改时间判断）
- SG 版直接读取明文 JSON，CN 版跳过加密数据
- Token 即将过期时自动刷新（提前 30 分钟）
- 刷新后回写 `storage.json`，保持 Trae IDE 一致性

**认证数据流**：
```
storage.json
  → 读取 iCubeAuthInfo://icube.cloudide
  → SG 版: JSON.parse(明文字符串)
  → CN 版: 跳过（加密格式，无法解密）
  → 检查 token 有效期
  → 即将过期: ExchangeToken API 刷新
  → 回写 storage.json
```

**HTTP 请求头构造**：
```
Authorization: Cloud-IDE-JWT <token>
X-Cloudide-Token: <token>
x-uid: <userId>
x-app-id: 6eefa01c-1036-4c7e-9ca5-d891f63bfcd8
x-device-id: <hash of machineId>
x-machine-id: <telemetry.machineId>
x-ide-version: 3.3.55 (CN) / 3.5.51 (SG)
Accept: text/event-stream
```

### 4. openai-format.js - 格式转换

**职责**：将 Trae 的 SSE 事件流转换为 OpenAI 兼容格式

**SSE 事件解析**：
```
Trae SSE 事件:
  event:output  data:{"response":"Hello",...}     → OpenAI delta.content
  event:output  data:{"reasoning_content":"...",..} → OpenAI delta.reasoning_content
  event:done    data:{"finish_reason":"stop"}       → OpenAI finish_reason
  event:error   data:{"code":4011,...}              → OpenAI delta.content (错误信息)
  event:token_usage data:{...}                      → 内部记录（不输出给客户端）
  event:metadata    data:{...}                      → 内部记录（不输出给客户端）
```

**输出格式**：
```json
{
  "id": "chatcmpl-<uuid>",
  "object": "chat.completion.chunk",
  "created": 1778167167,
  "model": "auto",
  "choices": [{
    "index": 0,
    "delta": { "content": "Hello" },
    "finish_reason": null
  }]
}
```

### 5. crypto.js - 加解密

**职责**：提供 AES-256-GCM 加解密功能

**设计**：
- 密钥来源：环境变量 `TRAE_API_ENCRYPT_KEY`，未设置时自动生成
- 加密格式：`<iv_hex>:<authTag_hex>:<encrypted_hex>`
- 用途：保护通过 API 传输的敏感数据

### 6. uuid.js - ID 生成

**职责**：生成 UUID v4 标识符

- 用于请求 ID、会话 ID、消息 ID 等
- 纯 JavaScript 实现，无外部依赖

## 数据流详解

### 流式对话完整流程

```
1. 客户端发送 POST /v1/chat/completions
   {
     "model": "auto",
     "messages": [{"role": "user", "content": "Hello"}],
     "stream": true
   }

2. 服务器验证 API Key

3. 服务器检查/刷新 Trae token

4. 服务器转换消息格式:
   content: "Hello" → content: [{type: "text", text: "Hello"}]

5. 服务器确定函数和配置:
   model="auto" → function="inline_chat", config_name=null

6. 服务器发送请求到 Trae 后端:
   POST https://trae-api-cn.mchost.guru/api/agent/v3/llm_utils_chat
   Headers: Cloud-IDE-JWT <token>, Accept: text/event-stream, ...
   Body: {messages, function: "inline_chat", stream: true}

7. Trae 后端返回 SSE 流:
   event:metadata
   data:{...}

   event:output
   data:{"response":"Hello","reasoning_content":null}

   event:token_usage
   data:{"prompt_tokens":35,"completion_tokens":4,"total_tokens":39}

   event:done
   data:{"finish_reason":"stop"}

8. 服务器逐行解析 SSE，转换为 OpenAI 格式:
   data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","choices":[{"delta":{"role":"assistant"}}]}

   data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","choices":[{"delta":{"content":"Hello"}}]}

   data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","choices":[{"delta":{},"finish_reason":"stop"}]}

   data: [DONE]

9. 客户端接收 OpenAI 兼容的 SSE 流
```

## 错误处理策略

### 三级回退

```
llmUtilsChat (主端点)
  ↓ 失败
chatCompletion (回退 1)
  ↓ 失败
createAgentTask (回退 2)
  ↓ 失败
返回错误信息给客户端
```

### 速率限制处理

```
请求 → 收到 4011/429 错误
  → 等待 2s + 随机抖动
  → 重试 (最多 3 次)
  → 等待时间指数增长: 2s → 4s → 8s
```

### Token 过期处理

```
每次请求前检查 token 有效期
  → 距过期 > 30 分钟: 使用当前 token
  → 距过期 < 30 分钟: 调用 ExchangeToken 刷新
  → 刷新成功: 使用新 token，回写 storage.json
  → 刷新失败 + token 未过期: 继续使用旧 token
  → 刷新失败 + token 已过期: 返回 401 错误
```

## 安全设计

1. **API Key 认证** - 所有端点需要 Bearer Token 认证
2. **JWT 自动管理** - Token 自动刷新，无需手动维护
3. **传输加密** - 与 Trae 后端通信使用 HTTPS
4. **数据加密** - 敏感数据可使用 AES-256-GCM 加密
5. **无日志泄露** - Token 等敏感信息不在日志中完整输出
