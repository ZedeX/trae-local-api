# Trae Local API 包装器 - 项目进展

## 1. 项目概述

**目标**：将 Trae IDE 包装为本地 API 服务，通过 API 调用替代聊天框输入，与 Trae 底层模型交互。

**核心需求**：
- 通过 API 接收交互指令
- 流式传输返回模型回复
- 用户身份认证（一次性手动完成即可）
- 通信内容加解密
- 自动解析返回值
- 配置默认项目目录

**工作目录**：`d:\_program\Trae\zx-test\`

**当前状态**：**API 服务器已完全可用** - CN 版和 SG 版均支持流式响应。

---

## 2. 架构分析

### 2.1 Trae 版本对比

| 特性 | CN 版（国内版） | SG 版（国际版） |
|------|---------------|---------------|
| 数据目录 | `%APPDATA%\Trae CN` | `%APPDATA%\Trae` |
| 认证存储 | 加密（自定义 "tc" 格式） | 明文 JSON |
| API 主机 | `trae-api-cn.mchost.guru` | `coresg-normal.trae.ai` |
| 认证方案 | `Cloud-IDE-JWT` | `Cloud-IDE-JWT` |
| IDE 版本 | 3.3.55 | 3.5.51 |

### 2.2 通信流程

```
用户输入（聊天 UI）
    → VS Code Workbench (workbench.desktop.main.js)
        → IPC/WebSocket → ai-agent 进程（Rust 二进制）
            → HTTP/SSE → Trae 后端 API (mchost.guru / trae.ai)
                → 模型提供商（GLM, Doubao 等）
```

### 2.3 关键 API 端点

| 端点 | 方法 | 用途 | 状态 |
|------|------|------|------|
| `/api/agent/v3/llm_utils_chat` | POST | **主要对话端点（已可用！）** | 可用 |
| `/api/agent/v3/create_agent_task` | POST | 完整代理对话（复杂请求） | 受阻 |
| `/api/ide/v1/chat` | POST | 简单对话端点（限速） | 部分 |
| `/api/ide/v1/get_detail_param` | POST | 获取模型配置 | 可用 |
| `/cloudide/api/v3/trae/oauth/ExchangeToken` | POST | 刷新 JWT token | 可用 |

---

## 3. 重大突破：`/api/agent/v3/llm_utils_chat`

### 3.1 发现过程

`llm_utils_chat` 端点是一个**轻量级对话 API**，具有以下特点：
- 不需要 `create_agent_task` 所需的 107KB 请求体
- 不需要 summary config、工具定义或工作区上下文
- 接受简单的消息格式（数组内容）
- 返回标准 SSE 流，包含 `output`、`token_usage`、`done` 事件
- 支持多种 `function` 类型

### 3.2 可用函数

| 函数 | 说明 | 可用 | 备注 |
|------|------|------|------|
| `inline_chat` | 快速内联对话 | **是** | 最适合简单问答，响应最快 |
| `solo_coder` | 带推理的代码对话 | **是** | 返回 reasoning_content（思维链） |
| `chat_v3` | 标准对话 | **是** | 返回 progress_notice 事件 |
| `builder_v3` | 代理构建模式 | 部分 | 返回进度但可能出错 |
| `system_diagnosis` | 系统诊断 | 部分 | 返回进度但可能出错 |
| `fast_apply` | 快速代码应用 | 否 | "no function config found" |
| `summary` | 摘要生成 | 否 | "no function config found" |

### 3.3 请求格式

**关键**：`messages.content` 必须是 `LLMRawMessageContent` 对象的**数组**，不能是字符串！

```json
{
  "messages": [
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "你的消息" }
      ]
    }
  ],
  "function": "inline_chat",
  "stream": true
}
```

### 3.4 响应格式（SSE）

```
event:metadata
data:{"model":"","session_id":"...","prompt_completion_id":0,...}

event:timing_cost
data:{"name":"llm_raw_chat_v2","preprocess_timing":88,...}

event:output
data:{"response":"Hello","reasoning_content":null,"tool_calls":null,...}

event:token_usage
data:{"name":"","prompt_tokens":35,"completion_tokens":4,"total_tokens":39,...}

event:done
data:{"finish_reason":"stop"}
```

---

## 4. 尝试历史与结果

### 阶段 1：认证与 Token 提取

| 尝试 | 方法 | 结果 | 状态 |
|------|------|------|------|
| 1 | 直接读取 SG 版 storage.json | 成功提取明文 JWT token | 已解决 |
| 2 | 读取 CN 版 storage.json | 认证数据使用自定义 "tc" 前缀加密 | 受阻 |
| 3 | 使用 Local State 密钥进行 AES-256-GCM 解密 | 自定义加密格式（v0x1005）不兼容 | 受阻 |
| 4 | 通过 PowerShell 进行 DPAPI 解密 | Trae 使用 Electron safeStorage，非标准 DPAPI | 受阻 |
| 5 | 从 ai-agent 日志提取 token | 在 stdout 日志中找到 JWT token | 已解决 |
| 6 | 通过 ExchangeToken API 刷新 token | 成功实现 JWT 刷新 | 已解决 |

### 阶段 2：API 请求格式探索

| 尝试 | 错误 | 修复 | 状态 |
|------|------|------|------|
| test-cn-v2 | 缺少 device_id | 添加 device_id 字段 | 已解决 |
| test-cn-v3 | 缺少 ide_version | 添加 ide_version + ide_version_code | 已解决 |
| test-cn-v3 | 缺少 user_input | 添加 user_input 对象 | 已解决 |
| test-cn-v3 | x-app-id 为 nil | 修复请求头键名格式（下划线→连字符） | 已解决 |
| test-cn-v3 | 缺少 conversation_id | 添加 conversation_id = session_id | 已解决 |
| test-cn-v3 | mode_type 枚举错误 | 从字符串 "Manual" 改为数字 1 | 已解决 |
| test-cn-v4 | model config is empty | 添加 current_config_info | 部分解决 |
| test-cn-v5 | failed to get summary config | 测试多种模型 + enable_chat_memory | 失败 |
| test-cn-v6 | failed to get summary config | 添加 summary_config_info，尝试 chat_v3 | 失败 |

### 阶段 3：`llm_utils_chat` 突破

| 尝试 | 脚本 | 错误 | 修复 | 状态 |
|------|------|------|------|------|
| 1 | test-new-endpoints.js | messages.content 必须为数组 | 改为 `[{type:"text",text:"..."}]` | 已解决 |
| 2 | test-array-content.js | function 为空（错误码 2001） | 添加 `function: "inline_chat"` | 已解决 |
| 3 | test-functions.js | 各种函数错误 | 测试所有函数类型 | 已解决 |
| 4 | test-inline-chat.js | config_name 导致 4001 | inline_chat 不使用 config_name | 已解决 |
| 5 | test-api-server.js | 服务器语法错误 | 修复引号混用 | 已解决 |
| 6 | test-api-server.js | **端到端测试** | **CN 和 SG 版均正常！** | **已解决** |

---

## 5. 关键技术发现

### 5.1 认证
- JWT token 格式：`Cloud-IDE-JWT <token>`
- Token 刷新端点：`/cloudide/api/v3/trae/oauth/ExchangeToken`
- 刷新参数：ClientID=`ono9krqynydwx5`, RefreshToken, ClientSecret=`-`
- Token 有效期：约 14 天

### 5.2 必需的 HTTP 请求头
```
Content-Type: application/json
Authorization: Cloud-IDE-JWT <token>
X-Cloudide-Token: <token>
x-uid: <user_id>
x-app-id: 6eefa01c-1036-4c7e-9ca5-d891f63bfcd8
x-device-id: <device_id>
x-machine-id: <machine_id>
x-ide-version: 3.3.55
x-ide-version-type: stable
request-traffic-type: prod
Accept: text/event-stream
```

### 5.3 消息内容格式（关键）

`llm_utils_chat` 端点要求 `messages.content` 为 `LLMRawMessageContent` 对象的**数组**：

```json
// 正确：
{ "role": "user", "content": [{"type": "text", "text": "Hello"}] }

// 错误（返回 400）：
{ "role": "user", "content": "Hello" }
```

使用字符串内容时的错误信息：
```
"cannot unmarshal string into Go struct field LLMRawMessage.messages.content of type []*idecopilot.LLMRawMessageContent"
```

### 5.4 模型配置
- API 中的模型名使用 `__dev` 后缀：`Doubao_1_6__dev`、`glm-5__dev`
- 配置名不使用 `__dev` 后缀：`Doubao_1_6`、`glm-5`
- `encrypted_model_params` 字段包含 `RequestPin`、`RequestAt`、`EncryptedStr`
- `inline_chat` 和 `solo_coder` 函数无需指定 config_name 即可工作
- 在 `inline_chat` 中指定 `config_name` 会导致 4001 错误

### 5.5 SSE 事件类型（llm_utils_chat）

| 事件 | 数据 | 说明 |
|------|------|------|
| `metadata` | `{model, session_id, ...}` | 会话元数据 |
| `timing_cost` | `{preprocess_timing, ...}` | 性能指标 |
| `output` | `{response, reasoning_content, tool_calls}` | **内容块** |
| `token_usage` | `{prompt_tokens, completion_tokens, ...}` | Token 计数 |
| `extra_info` | `{model, version, content}` | 额外模型信息 |
| `progress_notice` | `"Processing_1234567890"` | 进度指示 |
| `done` | `{finish_reason}` | 流结束 |
| `error` | `{code, message}` | 错误事件 |

---

## 6. 文件清单

### 6.1 核心源文件（src/）
| 文件 | 用途 | 状态 |
|------|------|------|
| `auth.js` | 认证与 token 管理 | 可用（双版本） |
| `trae-client.js` | 核心 API 客户端，含 `llmUtilsChat` | 可用 |
| `server.js` | OpenAI 兼容 API 服务器 | 可用 |
| `openai-format.js` | 响应格式转换，含 SSE 解析器 | 可用 |
| `crypto.js` | AES-256-GCM 加解密工具 | 可用 |
| `uuid.js` | UUID 生成工具 | 可用 |

### 6.2 测试脚本（关键）
| 脚本 | 用途 | 结果 |
|------|------|------|
| `test-inline-chat.js` | 详细测试 inline_chat + solo_coder | **可用 - 完整流式** |
| `test-functions.js` | 测试所有函数类型 | **可用 - 识别可用函数** |
| `test-array-content.js` | 测试数组内容格式 | **可用 - 确认数组格式** |
| `test-api-server.js` | 端到端 API 服务器测试 | **可用 - CN 和 SG 版** |

### 6.3 文档
| 文件 | 内容 |
|------|------|
| `README.md` | 使用说明 |
| `ARCHITECTURE.md` | 架构设计文档 |
| `API.md` | API 接口文档 |
| `PROGRESS.md` | 本文档 |

### 6.4 配置文件
| 文件 | 内容 |
|------|------|
| `.env` | 环境变量（版本、API 主机、密钥、端口） |
| `package.json` | Node.js 项目配置 |

---

## 7. 已知问题与限制

### 7.1 速率限制
- 错误码 4011："requests have exceeded the rate limit"
- 对 `/api/ide/v1/chat` 的影响大于 `/api/agent/v3/llm_utils_chat`
- 已实现指数退避重试机制（最多 3 次）
- 典型冷却时间：30-60 秒

### 7.2 CN 版认证加密
- CN 版 `storage.json` 使用自定义 "tc" 前缀加密（版本 0x1005）
- 无法使用标准 AES-256-GCM 或 DPAPI 解密
- 替代方案：从 ai-agent 进程日志提取 token
- 备选方案：使用 SG 版（明文存储认证数据）

### 7.3 模型选择
- `inline_chat` 函数使用服务器默认模型
- 指定模型时自动切换到 `chat_v3` 函数，通过 `model` 字段传递模型名称
- **重要发现**：`config_name` 参数在 `llm_utils_chat` 端点中不受支持（返回 4001/4023 错误）
- 正确方式：`model: "glm-5.1"` → 自动使用 `chat_v3` + `model: "glm-5.1"`（不传 config_name）
- 部分模型可能需要付费订阅
- 已验证可用的模型选择：auto, glm-5, glm-5.1, deepseek-v3, deepseek-r1, doubao-1-6

### 7.4 FFI/IPC 方案
- `ai_agent.dll` 导出函数：`BP_Initialize`、`BP_GetInterface`、`BP_Shutdown`
- 调用 `BP_Initialize` 导致 ACCESS_VIOLATION（0xC0000005）
- 可能需要正确的初始化参数或调用约定

---

## 8. 环境信息

- **操作系统**：Windows 10 x64（Enterprise LTSC 2021）
- **Trae CN 版本**：3.3.55（stable）
- **Trae SG 版本**：3.5.51（stable）
- **Node.js**：v24.12.0
- **代理**：HTTP localhost:1085/7891，SOCKS5 localhost:1083
- **工作目录**：`d:\_program\Trae\zx-test\`
- **API 服务器**：http://localhost:9900

---

## 9. 时间线

| 日期 | 里程碑 |
|------|--------|
| 2026-05-03 | 项目启动，初始分析 |
| 2026-05-04 | SG 版认证提取，首次 API 测试 |
| 2026-05-05 | CN 版分析，加密发现 |
| 2026-05-06 | 模型配置发现，测试脚本 v2-v4 |
| 2026-05-07 | summary config 阻碍，多种测试方案 |
| 2026-05-07 | `/api/ide/v1/chat` 端点可用，`get_detail_param` 返回完整配置 |
| 2026-05-07 | **突破：`llm_utils_chat` + `inline_chat` 完美工作** |
| 2026-05-07 | **API 服务器 v2.0 完全可用，支持流式传输** |
| 2026-05-07 | **CN 和 SG 版端到端验证通过** |
| 2026-05-07 | 添加指数退避重试、模型自动选择、完善文档 |
| 2026-05-07 | 修复非流式响应（改用流式收集后一次性返回） |
| 2026-05-07 | 修复 configName 变量引用错误 |
| 2026-05-07 | 过滤 "Building prompt" 调试信息 |
| 2026-05-07 | **模型选择测试：通过 model 字段指定模型全部通过** |
| 2026-05-07 | **发现 config_name 在 llm_utils_chat 端点中不受支持** |
| 2026-05-07 | **41 项端到端测试全部通过** |

---

*最后更新：2026-05-07（会话 4 - 模型选择修复 + 完整测试通过 + 文档完善）*
