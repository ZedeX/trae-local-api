# Trae Local API

将 Trae IDE 包装为本地 OpenAI / Anthropic 兼容 API 服务，支持 Claude Code、Cursor、Cline 等 AI Agent 工具直接调用 Trae 底层模型。

## 功能特性

- **OpenAI 兼容接口** - `/v1/chat/completions`，可直接使用 OpenAI SDK
- **Anthropic 兼容接口** - `/v1/messages`，支持 Claude Code 等工具的多轮工具调用
- **流式传输** - SSE 流式响应，实时返回模型输出
- **推理内容支持** - 支持 `reasoning_content`（思维链），兼容 DeepSeek 等推理模型
- **自动认证** - 从 Trae IDE 存储中自动提取 JWT token，支持自动刷新
- **CN 版解密** - 破解 Trae CN 自定义 "tc" 加密格式（AES-128-CBC + SHA-512）
- **多版本支持** - 同时支持 CN（国内版）和 SG（国际版）
- **模型选择** - 自动映射模型名称到 Trae 函数和配置
- **代理支持** - HTTP/SOCKS5 代理
- **文件输出** - AI 回复可直接保存到硬盘文件
- **流量日志** - 完整记录请求/响应，便于调试

## 快速开始

### 前置条件

1. 已安装并登录 [Trae IDE](https://trae.ai/)（CN 版或 SG 版）
2. Node.js >= 18

### 安装

```bash
git clone https://github.com/<your-username>/trae-local-api.git
cd trae-local-api
npm install
```

### 配置

复制 `.env.example` 为 `.env` 并按需修改：

```bash
cp .env.example .env
```

关键配置项：

```env
# Trae 版本：cn（国内版）或 sg（国际版）
TRAE_EDITION=cn

# 本地 API 密钥（客户端访问时需要）
API_KEY=trae-local-api-key

# 服务端口
PORT=19900

# 默认工作区目录
WORKSPACE_DIR=./output

# 手动 Token（自动解密失败时的备选方案）
# TRAE_MANUAL_TOKEN=eyJ...
```

### 启动

```bash
npm start
```

启动后服务运行在 `http://localhost:19900`。

### 验证

```bash
# 检查服务状态
curl http://localhost:19900/v1/status -H "Authorization: Bearer trae-local-api-key"

# 查看可用模型
curl http://localhost:19900/v1/models -H "Authorization: Bearer trae-local-api-key"
```

## 使用方法

### cURL

```bash
curl -N http://localhost:19900/v1/chat/completions \
  -H "Authorization: Bearer trae-local-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "auto",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": true
  }'
```

### Python (OpenAI SDK)

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:19900/v1",
    api_key="trae-local-api-key"
)

response = client.chat.completions.create(
    model="auto",
    messages=[{"role": "user", "content": "Hello!"}],
    stream=True
)

for chunk in response:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)
```

### 文件输出

```bash
# 专用文件生成端点（推荐）
curl -s http://localhost:19900/v1/chat/file \
  -H "Authorization: Bearer trae-local-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "auto",
    "messages": [{"role": "user", "content": "Write a Python HTTP server"}],
    "filename": "server.py",
    "overwrite": true
  }'

# 流式对话 + 保存
curl -N http://localhost:19900/v1/chat/completions \
  -H "Authorization: Bearer trae-local-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "auto",
    "messages": [{"role": "user", "content": "Write a markdown report"}],
    "stream": true,
    "save_to": "report.md"
  }'
```

## Agent 工具配置

### Claude Code

```bash
# 环境变量方式
$env:ANTHROPIC_BASE_URL = "http://localhost:19900"
$env:ANTHROPIC_API_KEY = "trae-local-api-key"
claude
```

或创建 `.claude/settings.json`：

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://localhost:19900",
    "ANTHROPIC_API_KEY": "trae-local-api-key"
  }
}
```

### Cursor

- **API Key**: `trae-local-api-key`
- **Base URL**: `http://localhost:19900/v1`
- **Model**: `auto`

### Cline (VS Code 插件)

- API Provider: "OpenAI Compatible"
- Base URL: `http://localhost:19900/v1`
- API Key: `trae-local-api-key`
- Model: `auto`

### Continue

```json
{
  "models": [{
    "title": "Trae Local API",
    "provider": "openai",
    "model": "auto",
    "apiBase": "http://localhost:19900/v1",
    "apiKey": "trae-local-api-key"
  }]
}
```

### 通用配置

| 配置项 | OpenAI 兼容 | Anthropic 兼容 |
|--------|------------|---------------|
| Base URL | `http://localhost:19900/v1` | `http://localhost:19900` |
| API Key | `trae-local-api-key` | `trae-local-api-key` |
| Model | `auto` | `auto` |

## 可用模型

| 模型名称 | 类型 | 说明 |
|---------|------|------|
| `auto` | 默认 | 服务器默认模型 |
| `glm-5` | 推理 | GLM-5 |
| `glm-5.1` | 推理 | GLM-5.1 |
| `deepseek-v3` | 对话 | DeepSeek V3 |
| `deepseek-r1` | 推理 | DeepSeek R1 |
| `doubao-1-6` | 对话 | Doubao Seed Code |
| `claude-3.5-sonnet` | 对话 | Claude 3.5 Sonnet |
| `claude-3.7-sonnet` | 对话 | Claude 3.7 Sonnet |
| `claude-sonnet-4` | 对话 | Claude Sonnet 4 |
| `gpt-4o` | 对话 | GPT-4o |
| `gemini-2.5-pro` | 对话 | Gemini 2.5 Pro |

> 部分模型可能需要 Trae 付费订阅。

## 认证说明

### 自动认证

服务器自动从 Trae IDE 存储中读取认证信息：

- **SG 版**：直接读取明文 JSON token
- **CN 版**：自动解密 "tc" 加密格式（AES-128-CBC + SHA-512）

### Token 刷新

- JWT token 有效期约 14 天，服务器自动检测和刷新
- 刷新失败时需重新打开 Trae IDE 登录

### 手动 Token（备选）

在 `.env` 中设置 `TRAE_MANUAL_TOKEN=eyJ...`，服务器在自动解密失败时回退使用。

## 项目结构

```
trae-local-api/
├── src/
│   ├── server.js           # Express 服务器
│   ├── trae-client.js      # Trae API 客户端
│   ├── auth.js             # 认证管理
│   ├── anthropic-format.js # Anthropic 格式转换（Claude Code 兼容）
│   ├── openai-format.js    # OpenAI 格式转换
│   ├── trae-decrypt.js     # CN 版加密格式解密
│   ├── traffic-logger.js   # 请求/响应日志
│   ├── crypto.js           # AES-256-GCM 加解密
│   └── uuid.js             # UUID 生成
├── .env.example            # 环境变量模板
├── package.json
├── README.md
├── ARCHITECTURE.md         # 架构设计
└── API.md                  # API 接口文档
```

## 常见问题

### Q: 启动报错 "No readable auth info found"

需先安装并登录 Trae IDE。如果两个版本都没有可用数据，设置 `TRAE_MANUAL_TOKEN` 环境变量。

### Q: 请求返回速率限制错误

服务器内置指数退避重试（最多 3 次），短时间大量请求仍可能触发限制。

### Q: Claude Code 只交互一轮就停止

确保使用最新版本的 `anthropic-format.js`，已修复 content block index 和 toolcall 标签过滤问题。

## 许可证

本项目仅供学习和研究使用。
