# Trae Local API

将 Trae IDE 包装为本地 OpenAI / Anthropic 兼容 API 服务，支持 Claude Code、Cursor、Cline 等 AI Agent 工具直接调用 Trae 底层模型（GLM-5.2、DeepSeek、Qwen 等）。

## 功能特性

- **OpenAI 兼容接口** - `/v1/chat/completions`，可直接使用 OpenAI SDK
- **Anthropic 兼容接口** - `/v1/messages`，支持 Claude Code 等工具的多轮工具调用
- **流式传输** - SSE 流式响应，实时返回模型输出
- **推理内容支持** - 支持 `reasoning_content`（思维链），兼容 DeepSeek 等推理模型
- **自动认证** - 从 Trae IDE 存储中自动提取 JWT token，支持自动刷新
- **CN 版解密** - 破解 Trae CN 自定义 "tc" 加密格式（AES-128-CBC + SHA-512）
- **多版本支持** - 同时支持 CN（国内版）和 SG（国际版）
- **5 档模型分档** - 按能力分 5 档，同档并发竞速，按档降级
- **智能降级** - 排队过长时自动切换到同档/下一档模型
- **多模态自动切换** - 检测到图片输入时自动切换到支持图片的模型
- **代理支持** - HTTP/SOCKS5 代理
- **文件输出** - AI 回复可直接保存到硬盘文件
- **流量日志** - 完整记录请求/响应，便于调试

---

## 新用户初始化指南

### 第一步：安装 Trae IDE

1. 下载并安装 [Trae IDE](https://trae.cn/)（国内用户选 CN 版）
2. 打开 Trae IDE，登录你的账号（支持微信/手机号登录）
3. 确保在 Trae IDE 中能正常使用 AI 对话功能

> **重要**：Trae IDE 必须至少登录过一次，本服务需要从 Trae 的本地存储中读取认证信息。

### 第二步：安装 Node.js

- 安装 Node.js >= 18（推荐 20+）
- 验证：`node --version`

### 第三步：克隆并安装

```bash
git clone https://github.com/<your-username>/trae-local-api.git
cd trae-local-api
npm install
```

### 第四步：配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
# Trae 版本：cn（国内版）或 sg（国际版）
TRAE_EDITION=cn

# 本地 API 密钥（客户端访问时需要，可自定义）
API_KEY=trae-local-api-key

# 服务端口
PORT=19900

# 默认工作区目录
WORKSPACE_DIR=./output
```

### 第五步：启动服务

```bash
npm start
```

启动后看到以下日志表示成功：

```
[model-config] Loaded 37 model mappings from model-config.json
[auth] Using CN edition auth data (decrypted)
[server] Trae Local API running on http://localhost:19900
```

### 第六步：验证服务

```bash
# 检查服务状态
curl http://localhost:19900/v1/status -H "Authorization: Bearer trae-local-api-key"

# 查看可用模型
curl http://localhost:19900/v1/models -H "Authorization: Bearer trae-local-api-key"

# 简单对话测试
curl -N http://localhost:19900/v1/chat/completions \
  -H "Authorization: Bearer trae-local-api-key" \
  -H "Content-Type: application/json" \
  -d '{"model":"auto","messages":[{"role":"user","content":"Hello!"}],"stream":true}'
```

### 第七步：配置 Claude Code

```bash
# PowerShell 环境变量方式
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

### 常见初始化问题

#### Q: 启动报错 "No readable auth info found"

**原因**：Trae IDE 未登录，或认证存储路径不正确。

**解决方案**：
1. 确保已安装并登录 Trae IDE（CN 版）
2. 检查 Trae IDE 的存储文件是否存在：
   - CN 版：`%APPDATA%\Trae-CN\User\globalStorage\state.vscdb`
   - SG 版：`%APPDATA%\Trae\User\globalStorage\state.vscdb`
3. 如果文件存在但仍报错，设置 `TRAE_MANUAL_TOKEN` 环境变量：
   - 打开 Trae IDE → F12 开发者工具 → Network
   - 触发一次 AI 对话，找到请求头中的 `Authorization: Cloud-IDE-JWT eyJ...`
   - 复制 `eyJ...` 部分，设置到 `.env`：`TRAE_MANUAL_TOKEN=eyJ...`

#### Q: CN 版 token 解密失败

**原因**：Trae CN 版使用自定义 "tc" 加密格式，需要正确的解密密钥。

**解决方案**：
1. 确保使用最新版本的 Trae CN IDE
2. 如果解密仍失败，使用 `TRAE_MANUAL_TOKEN` 方式

#### Q: 请求返回 401 认证错误

**原因**：Token 过期。

**解决方案**：
1. 重新打开 Trae IDE，触发一次对话以刷新 token
2. 重启 trae-local-api 服务

---

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
curl -s http://localhost:19900/v1/chat/file \
  -H "Authorization: Bearer trae-local-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "auto",
    "messages": [{"role": "user", "content": "Write a Python HTTP server"}],
    "filename": "server.py",
    "overwrite": true
  }'
```

---

## Agent 工具配置

### Claude Code

```bash
$env:ANTHROPIC_BASE_URL = "http://localhost:19900"
$env:ANTHROPIC_API_KEY = "trae-local-api-key"
claude
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

---

## 可用模型

### 模型分档（5 档）

| 档位 | 名称 | 模型 | 图片 | 推理 |
|------|------|------|------|------|
| T1 | 旗舰 | glm-5.2, Doubao-Seed-2.0-Code | ✗/✓ | ✓ |
| T2 | 强力 | glm-5.1, qwen-3.7-plus, kimi-k2.6, DeepSeek-V4-Pro | ✗/✓ | ✓ |
| T3 | 中等 | glm-5, qwen-3.6-plus, minimax-m3, Doubao_1_6, DeepSeek-V4-Flash | ✗/✓ | ✓ |
| T4 | 轻量 | glm-4.7, kimi-k2, qwen3-coder, minimax-m2.7 | ✗ | ✓ |
| T5 | 最轻 | glm-4.6, glm-5v-turbo, minimax-m2.1, minimax-m2 | ✗/✓ | ✓ |

### Claude 模型映射

| Claude 模型 | 映射到 | 档位 |
|------------|--------|------|
| claude-opus-4-7/4-6/4-5 | glm-5.2 | T1 |
| claude-sonnet-4-6/4-5/4 | glm-5.2 | T1 |
| claude-3.5/3.7-sonnet | glm-5.2 | T1 |
| claude-haiku-4-5 | glm-5.1 | T2 |

> 部分模型可能需要 Trae 付费订阅。DeepSeek-V4-Pro 不支持 tool_use，仅用于无工具对话。

---

## 智能降级（Fallback）

### 工作原理

```
用户请求 → 主模型排队 > 阈值
  ↓
同档并发竞速（raceWithinTier）
  ↓ 全部排队
下一档降级（tieredFallback）
  ↓ 全部排队
兜底模型（fallbackModel: glm-5）
  ↓ 仍然排队
继续等待原始模型
```

### 配置文件

`model-config.json` 中的 `fallback` 部分：

```json
{
  "fallback": {
    "autoFallback": true,
    "queueThreshold": 300,
    "tieredFallback": true,
    "raceWithinTier": true,
    "fallbackModel": "glm-5",
    "mappings": {
      "claude-sonnet-4-6": ["glm-5.1", "glm-5", "qwen-3.6-plus"]
    }
  }
}
```

### 参数说明

| 参数 | 说明 |
|------|------|
| `autoFallback` | 是否启用自动降级（默认 true） |
| `queueThreshold` | 排队位置阈值，超过则触发降级（默认 300） |
| `tieredFallback` | 是否启用分档降级（默认 true） |
| `raceWithinTier` | 是否在同档内并发竞速（默认 true） |
| `fallbackModel` | 所有档位都排队时的兜底模型（默认 glm-5） |
| `mappings` | 旧版降级链（向后兼容） |

### 降级流程

1. **检测排队**：Trae 返回 `request_wait_in_queue` 事件，包含排队位置
2. **同档竞速**：如果 `position > queueThreshold`，同档其他模型并发请求，先到先用
3. **下一档降级**：同档全部排队，降级到下一档的第一个模型
4. **兜底模型**：所有档位都排队，使用 `fallbackModel`
5. **继续等待**：兜底也排队，继续等待原始模型

---

## 多模态支持

当检测到消息中包含图片内容时，自动切换到同档或最近档位中支持图片的模型。

支持的图片输入模型：Doubao-Seed-2.0-Code、kimi-k2.6、qwen-3.7-plus、qwen-3.6-plus、minimax-m3、glm-5v-turbo、Doubao_1_6 等。

---

## 认证说明

### 自动认证

服务器自动从 Trae IDE 存储中读取认证信息：

- **SG 版**：直接读取明文 JSON token
- **CN 版**：自动解密 "tc" 加密格式（AES-128-CBC + SHA-512）

### Token 刷新

- JWT token 有效期约 14 天，服务器自动检测和刷新
- 刷新使用 mutex 防止并发竞态条件
- 刷新失败时需重新打开 Trae IDE 登录

### 手动 Token（备选）

在 `.env` 中设置 `TRAE_MANUAL_TOKEN=eyJ...`，服务器在自动解密失败时回退使用。

---

## 项目结构

```
trae-local-api/
├── src/
│   ├── server.js           # Express 服务器（OpenAI + Anthropic 兼容接口）
│   ├── trae-client.js      # Trae API 客户端 + 模型映射 + 分档 + Fallback
│   ├── auth.js             # 认证管理（自动检测 IDE 版本，token 刷新 mutex）
│   ├── anthropic-format.js # Anthropic 格式转换（6 种 toolcall 解析格式）
│   ├── openai-format.js    # OpenAI 格式转换
│   ├── trae-decrypt.js     # CN 版加密格式解密
│   ├── traffic-logger.js   # 请求/响应日志（含内存泄漏防护）
│   ├── crypto.js           # AES-256-GCM 加解密
│   └── uuid.js             # UUID 生成
├── model-config.json       # 模型映射 + 分档 + Fallback 配置
├── model-fallback.json     # 旧版降级链配置（向后兼容）
├── .env.example            # 环境变量模板
├── .history.md             # 项目历史记录
├── package.json
└── README.md
```

---

## 常见问题

### Q: Claude Code 只交互一轮就停止

**已修复**。原因：
1. 模型输出的 XML 格式工具调用未被解析 → 现在支持 6 种格式
2. 排队信息污染对话历史 → 现在只发 ping
3. 排队时 CC 超时 → 现在 `message_start` 提前发送

### Q: 排队信息污染对话历史

**已修复**。排队事件现在只发送 ping（CC 忽略），不再作为文本内容发送。

### Q: 如何查看请求日志

日志保存在 `logs/YYYY-MM-DD/workspace/` 目录，每个请求一个 JSON 文件。访问 Dashboard：

```
http://localhost:19900/v1/dashboard
```

### Q: 如何更新模型列表

Trae CN 更新模型后，调用 API 刷新：

```bash
curl http://localhost:19900/v1/models/detail -H "Authorization: Bearer trae-local-api-key"
```

然后手动更新 `model-config.json` 中的模型映射和分档。

---

## 许可证

本项目仅供学习和研究使用。
