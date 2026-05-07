# Trae Local API - 文件清单

本文档记录了项目中所有文件的作用和分类，方便后续理解和维护。

## 目录结构总览

```
zx-test/
├── src/                    # 核心源代码（API 服务器）
├── scripts/                # 各种脚本（按功能分类）
│   ├── capture/            # 网络抓包脚本
│   ├── chat-test/          # 对话功能测试脚本
│   ├── cn-api-test/        # CN 版 API 测试脚本
│   ├── decrypt/            # 加解密分析脚本
│   ├── dll-analysis/       # DLL 逆向分析脚本
│   ├── endpoint-test/      # API 端点测试脚本
│   ├── ffi-test/           # FFI/IPC 测试脚本
│   ├── format-test/        # 消息格式测试脚本
│   ├── log-analysis/       # 日志分析脚本
│   ├── misc-test/          # 其他测试脚本
│   └── model-test/         # 模型选择测试脚本
├── data/                   # 数据文件（JSON 配置等）
├── docs/                   # 文档
├── api-test.bat            # 简单版 API 测试工具
├── api-test-advanced.bat   # 高级版 API 测试工具
├── package.json            # Node.js 项目配置
└── .env.example            # 环境变量示例
```

---

## 核心源代码 (src/)

| 文件 | 作用 |
|------|------|
| `server.js` | Express 服务器主入口，实现 OpenAI 兼容的 `/v1/chat/completions` 端点，支持流式/非流式响应、模型选择、加解密等 |
| `trae-client.js` | Trae API 客户端，核心通信逻辑。包含 `llmUtilsChat`、`chatCompletion`、`createAgentTask` 三个端点的调用，以及指数退避重试、模型自动映射等 |
| `auth.js` | 认证管理模块，从 Trae IDE 存储中提取 JWT token，支持 CN/SG 双版本，自动检测 token 过期并刷新 |
| `openai-format.js` | 响应格式转换模块，将 Trae 后端的 SSE 事件流解析并转换为 OpenAI 兼容格式，包含调试信息过滤 |
| `crypto.js` | AES-256-GCM 加解密工具，提供 `/v1/encrypt` 和 `/v1/decrypt` 端点的底层实现 |
| `uuid.js` | UUID v4 生成工具 |

---

## 网络抓包脚本 (scripts/capture/)

用于捕获 Trae IDE 与后端之间的网络通信，分析请求格式和参数。

| 文件 | 作用 |
|------|------|
| `mitm-capture.py` | mitmproxy 抓包脚本 v1，基础版 |
| `mitm-capture-v2.py` | mitmproxy 抓包脚本 v2，增加请求头过滤 |
| `mitm-capture-v3.py` | mitmproxy 抓包脚本 v3，增加响应体保存 |
| `capture-proxy.js` | Node.js 代理服务器，转发并记录请求 |
| `capture-trae.py` | 专门针对 Trae 的抓包脚本 |
| `inspect_db.py` | 检查 Trae 本地数据库内容 |
| `inspect_db2.py` | 检查 Trae 本地数据库内容 v2 |

---

## 对话功能测试脚本 (scripts/chat-test/)

测试各种对话端点和交互模式。

| 文件 | 作用 |
|------|------|
| `test-chat-v1.js` ~ `v8.js` | 逐步迭代测试对话 API 的不同版本，从最初的 `/api/ide/v1/chat` 到最终的 `llm_utils_chat` |
| `test-chat-completion.js` | 测试 `/api/ide/v1/chat` 端点的 chatCompletion 调用 |
| `test-inline-chat.js` | 测试 `inline_chat` 函数 |
| `test-quick.js` / `test-quick-v2.js` | 快速测试脚本，验证基本连通性 |
| `test-raw.js` | 原始请求测试，查看未处理的响应 |
| `test-raw-chat.js` | 测试 `/api/ide/v1/llm_raw_chat` 端点 |
| `test-raw-sse.js` | 测试 SSE 流式输出的原始数据 |
| `test-stream.js` | 测试流式传输功能 |
| `test-local.js` | 测试本地 API 服务器 |
| `test-debug-output.js` | 调试输出测试 |
| `test-debug-parse.js` | SSE 解析调试脚本，分析事件类型和内容 |
| `test-cue-agent.js` / `test-cue-v2.js` | 测试 agent 任务触发 |

---

## CN 版 API 测试脚本 (scripts/cn-api-test/)

专门针对 CN（国内版）Trae 的 API 测试。

| 文件 | 作用 |
|------|------|
| `test-cn-api.js` | CN 版 API 基础测试 |
| `test-cn-direct.js` | CN 版直接 API 调用测试 |
| `test-cn-models.js` / `test-cn-models2.js` | CN 版模型列表测试 |
| `test-cn-v2.js` ~ `v12.js` | CN 版 API 逐步迭代测试，尝试不同的请求格式和参数组合 |

---

## 加解密分析脚本 (scripts/decrypt/)

分析 Trae IDE 的认证数据加密机制，尝试解密 CN 版的加密存储。

| 文件 | 作用 |
|------|------|
| `decrypt-auth.js` | 解密认证数据 v1 |
| `decrypt-v2.js` | 解密认证数据 v2 |
| `decrypt-full.js` | 完整解密尝试 |
| `decrypt-bruteforce.js` | 暴力破解加密密钥 |
| `decrypt-dpapi.js` | 使用 Windows DPAPI 解密 |
| `decrypt-dpapi.ps1` | PowerShell 版 DPAPI 解密 |
| `decrypt-key.ps1` | PowerShell 版密钥提取 |
| `decrypt-v2.ps1` | PowerShell 版解密 v2 |
| `decrypt-node.js` | Node.js 版解密尝试 |
| `decrypt-safestorage.js` | Electron safeStorage 解密 |
| `analyze-encrypt.js` | 分析加密格式和算法 |
| `check-cn-auth.js` | 检查 CN 版认证数据格式 |
| `check-cn-storage.js` | 检查 CN 版存储文件结构 |

---

## DLL 逆向分析脚本 (scripts/dll-analysis/)

分析 Trae 的 ai_agent.dll，提取 API 端点、函数签名和请求格式。

| 文件 | 作用 |
|------|------|
| `search-dll-exports.js` / `search-dll-exports2.js` | 搜索 DLL 导出函数 |
| `search-dll-strings.js` | 搜索 DLL 中的字符串常量 |
| `search-dll-endpoints.js` | 搜索 DLL 中的 API 端点路径 |
| `search-dll-all-endpoints.js` | 搜索所有端点（全面版） |
| `search-dll-chat.js` / `search-dll-chat2.js` | 搜索对话相关函数 |
| `search-dll-chat-format.js` | 搜索对话请求格式 |
| `search-dll-rawchat.js` / `v2` / `v3` | 搜索 llm_raw_chat 端点 |
| `search-dll-utils-chat.js` | 搜索 llm_utils_chat 端点 |
| `search-dll-ffi.js` / `v2` / `v3` | 搜索 FFI 接口定义 |
| `search-dll-request.js` / `v2` | 搜索请求构造逻辑 |
| `search-dll-signatures.js` | 搜索函数签名 |
| `search-dll-summary.js` | 搜索 summary 相关函数 |
| `search-dll-v2.js` ~ `v5.js` | 通用 DLL 搜索迭代版本 |
| `search-frontend-chat.js` | 搜索前端对话逻辑 |
| `analyze-server-js.js` | 分析服务器端 JavaScript 代码 |

---

## API 端点测试脚本 (scripts/endpoint-test/)

测试不同的 API 端点路径和参数。

| 文件 | 作用 |
|------|------|
| `test-endpoints.js` | 基础端点测试 |
| `test-endpoint-v2.js` | 端点测试 v2 |
| `test-endpoints-v3.js` | 端点测试 v3 |
| `test-new-endpoints.js` | 新发现端点测试 |

---

## FFI/IPC 测试脚本 (scripts/ffi-test/)

测试通过 FFI 调用 ai_agent.dll 的 IPC 通信。

| 文件 | 作用 |
|------|------|
| `test-ffi.js` | FFI 基础测试，尝试调用 DLL 函数 |
| `test-ffi-v2.js` | FFI 测试 v2，尝试不同参数 |
| `test-ffi-v3.js` | FFI 测试 v3，尝试不同调用约定 |

---

## 消息格式测试脚本 (scripts/format-test/)

测试不同的消息格式和请求参数组合。

| 文件 | 作用 |
|------|------|
| `test-format-v3.js` ~ `v10.js` | 逐步迭代测试消息格式，从字符串到数组格式 |
| `test-array-content.js` | 测试 content 数组格式 |
| `test-headers.js` | 测试不同的 HTTP 请求头 |
| `test-hosts.js` | 测试不同的 API 主机地址 |
| `test-functions.js` | 测试不同的 function 参数值 |
| `test-configs.js` | 测试不同的配置参数组合 |

---

## 日志分析脚本 (scripts/log-analysis/)

分析 Trae ai-agent 进程的日志文件，提取认证信息和请求格式。

| 文件 | 作用 |
|------|------|
| `read-agent-log.js` ~ `v14.js` | 逐步迭代读取和分析 ai-agent 日志 |
| `analyze-latest-log.js` / `v2` | 分析最新的日志文件 |
| `extract-token.js` / `extract-latest-token.js` | 从日志中提取 JWT token |
| `get-latest-token.js` / `v2` | 获取最新有效的 token |
| `check-ipc-mechanism.js` | 检查 IPC 通信机制 |

---

## 模型选择测试脚本 (scripts/model-test/)

测试模型选择、配置和认证功能。

| 文件 | 作用 |
|------|------|
| `test-model-selection.js` | 模型选择功能测试，验证不同 model 参数 |
| `test-model-debug.js` | 模型调试测试 |
| `test-model-list.js` | 模型列表测试 |
| `test-model-search.js` | 模型搜索测试 |
| `test-models.js` | 通用模型测试 |
| `test-detail-param.js` / `v2` | 测试 `get_detail_param` 端点 |
| `test-token.js` | Token 有效性测试 |
| `test-auth-v2.js` | 认证功能测试 |

---

## 其他测试脚本 (scripts/misc-test/)

| 文件 | 作用 |
|------|------|
| `test-api-server.js` | 端到端 API 服务器测试（41 项测试，当前使用的主测试脚本） |
| `test-api-full.js` | 完整 API 测试 |
| `test-api.js` | 基础 API 测试 |
| `test-api-old.js` | 旧版 API 测试 |

---

## 数据文件 (data/)

| 文件 | 作用 |
|------|------|
| `cn-models-detail.json` | CN 版模型详细配置（从 `get_detail_param` 获取） |
| `detail-param-builder_v3.json` | builder_v3 函数的详细参数配置 |
| `detail-param-chat_v3.json` | chat_v3 函数的详细参数配置 |

---

## 工具脚本

| 文件 | 作用 |
|------|------|
| `api-test.bat` | 简单版 API 测试工具，支持状态检查、模型列表、对话、加解密等 |
| `api-test-advanced.bat` | 高级版 API 测试工具，支持多轮对话、模型选择、函数选择等 |

---

## 配置文件

| 文件 | 作用 |
|------|------|
| `package.json` | Node.js 项目配置，定义依赖和脚本命令 |
| `package-lock.json` | 依赖锁定文件 |
| `.env.example` | 环境变量示例文件 |
| `.env` | 实际环境变量配置（不纳入版本控制） |
| `.gitignore` | Git 忽略规则 |

---

## 文档

| 文件 | 作用 |
|------|------|
| `README.md` | 项目主文档，包含功能介绍、快速开始、使用方法、FAQ |
| `API.md` | API 接口文档，详细描述所有端点的请求和响应格式 |
| `ARCHITECTURE.md` | 架构设计文档，描述系统架构和数据流 |
| `PROGRESS.md` | 项目进展文档，记录关键发现和里程碑 |
| `FILE_LIST.md` | 本文档，文件清单 |

---

## 版本迭代说明

项目中的脚本文件名包含版本号（如 `v2`、`v3` 等），表示迭代过程：

- **v1**：初始尝试，通常是最基础的版本
- **v2~v5**：逐步改进，修复问题或添加功能
- **v6~v10**：较大改动，可能涉及端点切换或格式变更
- **v11~v14**：最终版本，接近当前使用的方案

这些中间版本保留了项目探索过程中的所有尝试，有助于理解问题解决的思路和路径。
