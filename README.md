# Trae Local API - 本地 API 包装器

将 Trae IDE 包装为本地 OpenAI 兼容 API 服务，支持通过标准 API 调用与 Trae 底层模型交互。

## 功能特性

- **OpenAI 兼容接口** - 支持 `/v1/chat/completions` 标准端点，可直接使用 OpenAI SDK
- **流式传输** - 支持 SSE 流式响应，实时返回模型输出
- **推理内容支持** - 支持 `reasoning_content`（思维链）输出，兼容 DeepSeek 等推理模型
- **自动认证** - 从 Trae IDE 存储中自动提取 JWT token，支持自动刷新
- **多版本支持** - 同时支持 CN（国内版）和 SG（国际版）两个版本
- **模型选择** - 支持指定模型名称，自动映射到对应的 Trae 函数和配置
- **指数退避重试** - 遇到速率限制时自动重试，无需手动干预
- **代理支持** - 支持 HTTP/SOCKS5 代理，适配各种网络环境
- **加解密功能** - 内置 AES-256-GCM 加解密，保护敏感数据
- **项目目录配置** - 支持配置默认工作区目录

## 快速开始

### 前置条件

1. 已安装并登录 [Trae IDE](https://trae.ai/)（CN 版或 SG 版均可）
2. Node.js >= 18

### 安装

```bash
cd zx-test
npm install
```

### 配置

创建 `.env` 文件（或直接使用默认配置）：

```env
# Trae 版本：cn（国内版）或 sg（国际版）
TRAE_EDITION=cn

# API 主机（通常自动检测，无需手动设置）
# TRAE_API_HOST=https://trae-api-cn.mchost.guru

# 本地 API 密钥（客户端访问时需要）
API_KEY=trae-local-api-key

# 服务端口
PORT=9900

# 默认工作区目录
WORKSPACE_DIR=d:\_program\Trae

# 代理设置（可选）
# HTTP_PROXY=http://localhost:7891
# HTTPS_PROXY=http://localhost:7891
# ALL_PROXY=socks5://localhost:1083
```

### 启动

```bash
npm start
```

启动后服务运行在 `http://localhost:9900`。

### 验证

```bash
# 检查服务状态
curl http://localhost:9900/v1/status -H "Authorization: Bearer trae-local-api-key"

# 查看可用模型
curl http://localhost:9900/v1/models -H "Authorization: Bearer trae-local-api-key"
```

## 使用方法

### cURL

**流式对话**：

```bash
curl -N http://localhost:9900/v1/chat/completions \
  -H "Authorization: Bearer trae-local-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "auto",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": true
  }'
```

**指定模型**：

```bash
curl -N http://localhost:9900/v1/chat/completions \
  -H "Authorization: Bearer trae-local-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "glm-5.1",
    "messages": [{"role": "user", "content": "2+2=?"}],
    "stream": true
  }'
```

**使用推理模式（solo_coder）**：

```bash
curl -N http://localhost:9900/v1/chat/completions \
  -H "Authorization: Bearer trae-local-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "auto",
    "messages": [{"role": "user", "content": "Write a quicksort in Python"}],
    "stream": true,
    "function": "solo_coder"
  }'
```

### Python (OpenAI SDK)

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:9900/v1",
    api_key="trae-local-api-key"
)

# 流式对话
response = client.chat.completions.create(
    model="auto",
    messages=[{"role": "user", "content": "Hello!"}],
    stream=True
)

for chunk in response:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)
```

### Python (requests)

```python
import requests
import json

url = "http://localhost:9900/v1/chat/completions"
headers = {
    "Authorization": "Bearer trae-local-api-key",
    "Content-Type": "application/json"
}
data = {
    "model": "auto",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": True
}

response = requests.post(url, headers=headers, json=data, stream=True)
for line in response.iter_lines():
    if line:
        line = line.decode("utf-8")
        if line.startswith("data: ") and line != "data: [DONE]":
            chunk = json.loads(line[6:])
            content = chunk["choices"][0]["delta"].get("content", "")
            if content:
                print(content, end="", flush=True)
```

### Node.js

```javascript
const response = await fetch('http://localhost:9900/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer trae-local-api-key',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'auto',
    messages: [{ role: 'user', content: 'Hello!' }],
    stream: true
  })
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const text = decoder.decode(value);
  // 解析 SSE 数据...
}
```

## 可用模型

| 模型名称 | 类型 | 说明 |
|---------|------|------|
| `auto` | 默认 | 使用服务器默认模型（Doubao-1-6） |
| `glm-5` | 推理模型 | GLM-5 |
| `glm-5.1` | 推理模型 | GLM-5.1 |
| `deepseek-v3` | 对话模型 | DeepSeek V3 |
| `deepseek-r1` | 推理模型 | DeepSeek R1 |
| `doubao-1-6` | 对话模型 | Doubao Seed Code（默认） |
| `doubao-1.5-pro` | 对话模型 | Doubao 1.5 Pro |
| `claude-3.5-sonnet` | 对话模型 | Claude 3.5 Sonnet |
| `claude-3.7-sonnet` | 对话模型 | Claude 3.7 Sonnet |
| `claude-sonnet-4` | 对话模型 | Claude Sonnet 4 |
| `gpt-4o` | 对话模型 | GPT-4o |
| `gpt-4o-mini` | 对话模型 | GPT-4o Mini |
| `gemini-2.0-flash` | 对话模型 | Gemini 2.0 Flash |
| `gemini-2.5-pro` | 对话模型 | Gemini 2.5 Pro |

> **注意**：部分模型可能需要 Trae 付费订阅才能使用。

## 可用函数

通过 `function` 参数指定不同的交互模式：

| 函数名 | 说明 | 推荐场景 |
|--------|------|---------|
| `inline_chat` | 快速内联对话 | 简单问答、快速查询 |
| `solo_coder` | 独立编码（带推理） | 代码生成、复杂推理 |
| `chat_v3` | 标准对话 | 通用对话 |
| `builder_v3` | 构建器模式 | 项目构建（部分功能受限） |
| `system_diagnosis` | 系统诊断 | 系统分析（部分功能受限） |

## 认证说明

### 自动认证

服务器启动时会自动从 Trae IDE 的存储文件中读取认证信息：

- **SG 版**：直接读取明文 JSON 格式的 token
- **CN 版**：token 被加密存储，需要从 ai-agent 进程日志中提取

### Token 刷新

- JWT token 有效期约 14 天
- 服务器会自动检测 token 是否即将过期，并在需要时自动刷新
- 如果刷新失败，需要重新打开 Trae IDE 登录

### 手动获取 CN 版 Token

如果自动认证失败（CN 版加密存储），可以手动提取：

1. 打开 Trae IDE 并登录
2. 找到 ai-agent 进程日志（通常在 `%TEMP%` 目录下）
3. 搜索日志中的 JWT token
4. 将 token 写入 `.env` 文件

## 项目结构

```
zx-test/
├── src/
│   ├── server.js          # Express 服务器，OpenAI 兼容端点
│   ├── trae-client.js     # Trae API 客户端，核心通信逻辑
│   ├── auth.js            # 认证管理，token 提取与刷新
│   ├── openai-format.js   # 响应格式转换，SSE 解析
│   ├── crypto.js          # AES-256-GCM 加解密
│   └── uuid.js            # UUID 生成
├── test-api-server.js     # API 服务器端到端测试
├── .env                   # 环境变量配置
├── package.json           # 项目依赖
├── README.md              # 本文档
├── ARCHITECTURE.md        # 架构设计文档
├── API.md                 # API 接口文档
└── PROGRESS.md            # 项目进展文档
```

## 常见问题

### Q: 启动报错 "No readable auth info found"

**A**: 需要先安装并登录 Trae IDE。如果是 CN 版，认证数据被加密，服务器会尝试回退到 SG 版的认证数据。如果两个版本都没有可用数据，请确保至少有一个版本的 Trae IDE 已登录。

### Q: 请求返回速率限制错误

**A**: Trae 后端有速率限制。服务器已内置指数退避重试机制（最多重试 3 次），但如果短时间内发送大量请求，仍可能触发限制。建议在请求之间添加适当延迟。

### Q: 指定模型后返回错误

**A**: 指定模型时，服务器会自动通过 `model` 字段传递模型名称给 Trae 后端，使用 `chat_v3` 函数。注意：`config_name` 参数在 `llm_utils_chat` 端点中不受支持，请勿手动指定。使用 `model: "auto"` 可以使用默认的免费模型。部分模型可能需要付费订阅。

### Q: CN 版和 SG 版有什么区别？

**A**:
- **CN 版**（国内版）：API 主机为 `trae-api-cn.mchost.guru`，认证数据加密存储
- **SG 版**（国际版）：API 主机为 `coresg-normal.trae.ai`，认证数据明文存储
- 两个版本支持的模型列表可能不同
- 建议优先使用 CN 版（国内网络访问更稳定）

### Q: 推理内容（reasoning_content）如何获取？

**A**: 使用 `solo_coder` 函数时，模型会返回推理过程。在 OpenAI 兼容格式中，推理内容通过 `delta.reasoning_content` 字段返回，与 DeepSeek API 的格式一致。

## 技术细节

- **通信协议**：HTTP/SSE（Server-Sent Events）
- **认证方案**：Cloud-IDE-JWT
- **加密算法**：AES-256-GCM
- **主 API 端点**：`/api/agent/v3/llm_utils_chat`
- **回退端点**：`/api/ide/v1/chat` → `/api/agent/v3/create_agent_task`
- **消息格式**：`content` 必须为 `[{type: "text", text: "..."}]` 数组格式

## 许可证

本项目仅供学习和研究使用。
