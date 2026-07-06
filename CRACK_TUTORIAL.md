# 破解 Trae CN 国内版加密协议 —— 将 Trae IDE 变成本地 AI API 服务

> 本文仅用于技术研究和学习交流，请勿用于商业用途或违反相关服务条款。

## 一、前言

[Trae IDE](https://trae.cn/) 是字节跳动推出的 AI 编程 IDE，国内版（CN）内置了 GLM-5.2、DeepSeek-V4、Qwen 等国产大模型，免费用户即可使用。但 Trae 的模型只能在 IDE 内使用，无法被 Claude Code、Cursor、Cline 等第三方 Agent 工具调用。

Trae CN 版为了防止 token 被提取，对本地存储的认证数据使用了自定义的 `"tc"` 加密格式。本文将详细分析该加密协议的完整破解过程，并基于此构建一个本地 OpenAI/Anthropic 兼容 API 服务，让任何支持 OpenAI 协议的工具都能直接调用 Trae 底层模型。

**效果预览：**

<!-- 截图1：服务启动成功 -->

![服务启动成功](docs/screenshots/01-server-start.png)
*图1：trae-local-api 服务启动成功，自动解密 CN 版认证数据*

<!-- 截图2：Claude Code 通过本地 API 使用 Trae 模型 -->

![Claude Code 调用](docs/screenshots/02-claude-code.png)
*图2：Claude Code 通过本地 API 调用 Trae 的 GLM-5.2 模型*

***

## 二、目标分析

### 2.1 Trae 的认证数据存储位置

Trae IDE 基于 VS Code 架构，认证信息存储在 `globalStorage/state.vscdb`（SQLite）或 `globalStorage/storage.json` 中。

```
CN 版路径：%APPDATA%\Trae CN\User\globalStorage\storage.json
SG 版路径：%APPDATA%\Trae\User\globalStorage\storage.json
```

<!-- 截图3：storage.json 文件位置 -->

![storage.json 位置](docs/screenshots/03-storage-location.png)
*图3：storage.json 文件所在目录*

### 2.2 认证数据的 Key

在 `storage.json` 中，认证信息存储在 key `iCubeAuthInfo://icube.cloudide` 下。

**SG 版（国际版）**：该 key 的值是明文 JSON，可以直接读取：

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "expiredAt": "2026-07-01T00:00:00.000Z",
  "userId": "1234567890",
  ...
}
```

**CN 版（国内版）**：该 key 的值是一段 Base64 编码的加密数据，无法直接读取：

```
dGMFAQAAAC...（很长的 Base64 字符串）
```

<!-- 截图4：CN 版 storage.json 中加密的认证数据 -->

![加密数据](docs/screenshots/04-encrypted-data.png)
*图4：CN 版 storage.json 中的加密认证数据（以 Base64 形式存储）*

### 2.3 为什么需要破解

如果不破解 CN 版的加密，就只能通过以下方式获取 token：

1. 打开 Trae IDE → F12 开发者工具 → Network 面板
2. 触发一次 AI 对话
3. 在请求头中找到 `Authorization: Cloud-IDE-JWT eyJ...`
4. 手动复制 token

这种方式非常不便，token 约 14 天过期后需要重复操作。破解加密后可以实现**全自动认证**，服务启动时自动读取并解密，token 过期时自动刷新。

***

## 三、加密协议逆向分析

### 3.1 第一步：Base64 解码

首先将 `storage.json` 中 `iCubeAuthInfo://icube.cloudide` 的值进行 Base64 解码：

```javascript
const buffer = Buffer.from(base64Value, 'base64');
```

解码后得到一段二进制数据，查看前几个字节：

```
74 63 05 10 00 00 ...
```

<!-- 截图5：Base64 解码后的二进制头部 -->

![二进制头部](docs/screenshots/05-binary-header.png)
*图5：Base64 解码后的二进制数据，前两个字节为 0x74 0x63（即 "tc"）*

### 3.2 第二步：识别加密类型

前 6 字节是加密类型的 Header：

| Header 字节           | 加密类型          | 说明            |
| ------------------- | ------------- | ------------- |
| `74 63 05 10 00 00` | `AES`         | 标准加密（"tc" 前缀） |
| `12 39 20 20 02 03` | `AES_PRIVATE` | 私有加密          |

```javascript
function detectEncType(header) {
  if (header[0] === 0x74 && header[1] === 0x63 &&
      header[2] === 0x05 && header[3] === 0x10 &&
      header[4] === 0x00 && header[5] === 0x00) {
    return 'AES';
  }
  if (header[0] === 18 && header[1] === 57 &&
      header[2] === 32 && header[3] === 32 &&
      header[4] === 2 && header[5] === 3) {
    return 'AES_PRIVATE';
  }
  return 'UNKNOWN';
}
```

> **关键发现**：`0x74 0x63` 正好是 ASCII 字符 `"tc"`，这就是 Trae CN 加密格式被称为 "tc" 格式的原因。

### 3.3 第三步：解析数据结构

6 字节 Header 之后，数据结构如下：

```
[6 bytes Header][32 bytes RandomBytes][N bytes EncryptedData]
```

| 偏移量 | 长度 | 说明               |
| --- | -- | ---------------- |
| 0   | 6  | 加密类型 Header      |
| 6   | 32 | 随机数（RandomBytes） |
| 38  | 剩余 | AES 加密后的数据       |

```javascript
const header = buffer.slice(0, 6);           // 加密类型
const randomBytes = buffer.slice(6, 38);      // 32 字节随机数
const encryptedData = buffer.slice(38);        // 加密数据
```

<!-- 截图6：数据结构解析示意图 -->

![数据结构](docs/screenshots/06-data-structure.png)
*图6：tc 加密格式的数据结构：Header + RandomBytes + EncryptedData*

### 3.4 第四步：密钥派生（核心破解）

这是破解的关键步骤。Trae CN 使用了 **SHA-512 + XOR 盐值** 的方式从随机数派生 AES 密钥和 IV。

#### 3.4.1 硬编码盐值

在 Trae CN 的前端 JS 中，找到了 4 组硬编码的盐值（每组 64 字节）：

```javascript
const SALT_A = Uint8Array.from([82,9,106,213,48,54,165,56,191,64,163,158,129,243,215,251,124,227,57,130,155,47,255,135,52,142,67,68,196,222,233,203,84,123,148,50,166,194,35,61,238,76,149,11,66,250,195,78,8,46,161,102,40,217,36,178,118,91,162,73,109,139,209,37]);
const SALT_B = Uint8Array.from([31,221,168,51,136,7,199,49,177,18,16,89,39,128,236,95,96,81,127,169,25,181,74,13,45,229,122,159,147,201,156,239,160,224,59,77,174,42,245,176,200,235,187,60,131,83,153,97,23,43,4,126,186,119,214,38,225,105,20,99,85,33,12,125]);
const SALT_C = Uint8Array.from([191,192,216,250,122,246,220,97,31,254,98,27,8,72,71,176,135,99,96,18,127,101,203,104,211,102,191,125,37,72,150,156,51,229,121,35,17,153,141,177,110,131,150,128,172,255,254,6,18,140,55,62,236,249,135,64,135,12,117,4,89,149,168,209]);
const SALT_D = Uint8Array.from([246,204,26,232,232,70,129,109,223,146,169,242,23,241,105,145,50,196,165,42,254,120,3,54,244,207,209,85,53,6,138,106,175,148,31,204,186,186,165,182,87,142,49,10,39,110,26,154,86,56,173,125,18,64,198,225,99,99,83,82,191,134,76,170]);
```

> **如何找到盐值**：在 Trae CN 安装目录下搜索 JS 文件，定位到加密相关代码。盐值以 `Uint8Array.from([...])` 的形式硬编码在代码中。

<!-- 截图7：在 Trae CN 的 JS 代码中找到盐值 -->

![盐值代码](docs/screenshots/07-salt-values.png)
*图7：在 Trae CN 的前端 JS 代码中找到硬编码的盐值*

#### 3.4.2 盐值选择规则

根据加密类型选择不同的盐值组合：

- `AES` 类型：使用 `SALT_A XOR SALT_B`
- `AES_PRIVATE` 类型：使用 `SALT_C XOR SALT_D`

```javascript
function xorSalts(a, b, len) {
  const result = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    result[i] = a[i] ^ b[i];
  }
  return result;
}

// AES 类型
const salt = xorSalts(SALT_A, SALT_B, 64);
// AES_PRIVATE 类型
// const salt = xorSalts(SALT_C, SALT_D, 64);
```

#### 3.4.3 密钥派生流程

```
RandomBytes (32 bytes)
    ↓
SHA-512(RandomBytes) → hashOfRandom (64 bytes)
    ↓
hashOfRandom + salt → combined
    ↓
SHA-512(combined) → finalHash (64 bytes)
    ↓
finalHash[0:16]  → AES Key (16 bytes, AES-128)
finalHash[16:32] → IV (16 bytes)
```

代码实现：

```javascript
function deriveKeyAndIV(randomBytes, encType) {
  // 1. 选择盐值
  let salt;
  if (encType === 'AES_PRIVATE') {
    salt = xorSalts(SALT_C, SALT_D, 64);
  } else {
    salt = xorSalts(SALT_A, SALT_B, 64);
  }

  // 2. SHA-512(RandomBytes)
  const hashOfRandom = crypto.createHash('sha512')
    .update(Buffer.from(randomBytes)).digest();

  // 3. SHA-512(hashOfRandom + salt)
  const combined = Buffer.concat([hashOfRandom, Buffer.from(salt)]);
  const finalHash = crypto.createHash('sha512')
    .update(combined).digest();

  // 4. 拆分 Key 和 IV
  const aesKey = finalHash.slice(0, 16);   // AES-128 密钥
  const iv = finalHash.slice(16, 32);      // CBC 模式 IV

  return { aesKey, iv };
}
```

<!-- 截图8：密钥派生流程图 -->

![密钥派生](docs/screenshots/08-key-derivation.png)
*图8：密钥派生流程：RandomBytes → SHA-512 → +Salt → SHA-512 → 拆分 Key/IV*

### 3.5 第五步：AES-128-CBC 解密

使用派生出的 Key 和 IV 进行 AES-128-CBC 解密：

```javascript
function aesCbcDecrypt(key, iv, data) {
  const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
  let decrypted = decipher.update(data);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted;
}
```

### 3.6 第六步：哈希验证

解密后的数据结构：

```
[64 bytes SHA-512 Hash][N bytes Plaintext JSON]
```

前 64 字节是明文的 SHA-512 哈希值，用于验证解密是否正确：

```javascript
const storedHash = decrypted.slice(0, 64);    // 存储的哈希
const plaintext = decrypted.slice(64);          // 明文 JSON
const computedHash = sha512(plaintext);         // 计算的哈希

// 比较哈希
if (!hashEquals(storedHash, computedHash)) {
  throw new Error('Hash verification failed');
}

const result = plaintext.toString('utf8');  // 得到明文 JSON 字符串
```

<!-- 截图9：解密成功，得到明文 JSON -->

![解密成功](docs/screenshots/09-decrypt-success.png)
*图9：解密成功！得到包含 token、refreshToken 等字段的明文 JSON*

### 3.7 完整解密流程图

```
storage.json 中 iCubeAuthInfo://icube.cloudide 的值
    ↓ Base64 解码
二进制 Buffer
    ↓ 检测 Header (0x74 0x63 → AES 类型)
提取 RandomBytes (32 bytes) + EncryptedData
    ↓ 选择盐值 (SALT_A XOR SALT_B)
SHA-512(RandomBytes) → hashOfRandom
    ↓
SHA-512(hashOfRandom + salt) → finalHash
    ↓ 拆分
AES Key (16B) + IV (16B)
    ↓ AES-128-CBC 解密
[SHA-512 Hash][Plaintext JSON]
    ↓ 验证哈希
明文 JSON → { token, refreshToken, userId, ... }
```

***

## 四、构建本地 API 服务

### 4.1 项目架构

基于破解的解密算法，构建一个 Express 服务器，提供 OpenAI 和 Anthropic 兼容接口：

```
┌─────────────────────────────────────────────┐
│           客户端 (Claude Code / Cursor /     │
│           Cline / Python / curl)             │
└──────────────────┬──────────────────────────┘
                   │ HTTP/SSE (OpenAI/Anthropic)
                   ▼
┌─────────────────────────────────────────────┐
│         Trae Local API Server               │
│         (Express, localhost:19900)           │
│                                             │
│  ┌────────────┐  ┌────────────┐            │
│  │  auth.js   │  │trae-decrypt│            │
│  │ 自动认证    │  │ CN tc 解密  │            │
│  └─────┬──────┘  └─────┬──────┘            │
│        │               │                    │
│  ┌─────┴──────┐  ┌─────┴──────┐            │
│  │trae-client │  │openai-format│            │
│  │ API 客户端  │  │ 格式转换     │            │
│  └────────────┘  └────────────┘            │
└──────────────────┬──────────────────────────┘
                   │ HTTPS/SSE
                   ▼
┌─────────────────────────────────────────────┐
│         Trae 后端 API                        │
│  CN: https://trae-api-cn.mchost.guru        │
│  /api/agent/v3/llm_utils_chat               │
│  /api/ide/v1/chat                           │
│  /cloudide/api/v3/trae/oauth/ExchangeToken  │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│  模型提供商: GLM / DeepSeek / Qwen / ...    │
└─────────────────────────────────────────────┘
```

### 4.2 核心模块说明

#### 4.2.1 trae-decrypt.js —— CN 版解密模块

完整实现上述破解算法，提供两个核心函数：

```javascript
// 解密认证数据
function decryptAuthData(dataDir) {
  const storage = JSON.parse(fs.readFileSync(storagePath, 'utf8'));
  const encryptedAuth = storage['iCubeAuthInfo://icube.cloudide'];

  // 如果是明文，直接返回
  if (encryptedAuth.trim().startsWith('{')) {
    return JSON.parse(encryptedAuth);
  }

  // 否则走 tc 解密流程
  const decrypted = decryptStorageValue(encryptedAuth);
  return JSON.parse(decrypted);
}

// 解密 storage.json 中所有加密值
function decryptAllEncryptedValues(dataDir) { ... }
```

#### 4.2.2 auth.js —— 自动认证模块

- 自动检测 CN/SG 版本
- CN 版：调用 `trae-decrypt.js` 解密
- SG 版：直接读取明文 JSON
- Token 过期前 30 分钟自动刷新（通过 `ExchangeToken` API）
- 刷新使用 Mutex 防止并发竞态

#### 4.2.3 trae-client.js —— API 客户端

与 Trae 后端通信，支持三个端点的三级回退：

1. `/api/agent/v3/llm_utils_chat` —— 主端点（轻量对话）
2. `/api/ide/v1/chat` —— 回退端点 1（标准对话）
3. `/api/agent/v3/create_agent_task` —— 回退端点 2（完整代理）

#### 4.2.4 openai-format.js / anthropic-format.js —— 格式转换

将 Trae 的 SSE 事件流转换为 OpenAI/Anthropic 兼容格式。

### 4.3 HTTP 请求头构造

与 Trae 后端通信需要构造特定的请求头：

```javascript
{
  'Authorization': `Cloud-IDE-JWT ${token}`,
  'X-Cloudide-Token': token,
  'x-uid': userId,
  'x-app-id': '6eefa01c-1036-4c7e-9ca5-d891f63bfcd8',
  'x-device-id': hashDeviceId(machineId),
  'x-machine-id': machineId,
  'x-ide-version': '3.3.67',        // CN 版
  'x-ide-version-code': '20260401',
  'x-device-type': 'windows',
  'x-os-version': 'Windows 10',
  'Accept': 'text/event-stream'
}
```

> `x-app-id` 是 Trae IDE 的固定应用 ID，`x-ide-version` 需要与当前安装的 Trae CN 版本匹配。

### 4.4 Token 自动刷新

Token 有效期约 14 天，过期前自动调用刷新接口：

```
POST https://trae-api-cn.mchost.guru/cloudide/api/v3/trae/oauth/ExchangeToken
Body: {
  "ClientID": "ono9krqynydwx5",
  "RefreshToken": "<refreshToken>",
  "ClientSecret": "-",
  "UserID": ""
}
```

刷新成功后，如果原始存储是明文（SG 版），则回写 `storage.json`；如果是加密存储（CN 版），则仅内存更新，不回写文件。

***

## 五、部署与使用

### 5.1 环境准备

1. **安装 Trae IDE CN 版**：从 [trae.cn](https://trae.cn/) 下载安装，登录账号
2. **安装 Node.js**：>= 18，推荐 20+
3. **克隆项目**：

```bash
git clone https://github.com/<your-username>/trae-local-api.git
cd trae-local-api
npm install
```

### 5.2 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`：

```env
TRAE_EDITION=cn
API_KEY=your-custom-api-key
PORT=19900
WORKSPACE_DIR=./output
```

### 5.3 启动服务

```bash
npm start
```

<!-- 截图10：npm start 启动服务 -->

![启动服务](docs/screenshots/10-npm-start.png)
*图10：npm start 启动 trae-local-api 服务*

启动成功后看到：

```
[model-config] Loaded 37 model mappings from model-config.json
[auth] Using CN edition auth data (decrypted)
[Trae Local API] Server running on http://localhost:19900
```

> 注意 `[auth] Using CN edition auth data (decrypted)` 这行日志，表示 CN 版加密数据已成功解密。

### 5.4 验证服务

```bash
# 检查状态
curl http://localhost:19900/v1/status -H "Authorization: Bearer your-custom-api-key"

# 查看可用模型
curl http://localhost:19900/v1/models -H "Authorization: Bearer your-custom-api-key"

# 流式对话测试
curl -N http://localhost:19900/v1/chat/completions \
  -H "Authorization: Bearer your-custom-api-key" \
  -H "Content-Type: application/json" \
  -d '{"model":"auto","messages":[{"role":"user","content":"Hello!"}],"stream":true}'
```

<!-- 截图11：curl 测试成功 -->

![curl 测试](docs/screenshots/11-curl-test.png)
*图11：使用 curl 测试 API，成功返回流式响应*

### 5.5 配置 Claude Code

```powershell
$env:ANTHROPIC_BASE_URL = "http://localhost:19900"
$env:ANTHROPIC_API_KEY = "your-custom-api-key"
claude
```

<!-- 截图12：Claude Code 成功连接 -->

![Claude Code](docs/screenshots/12-claude-code-connected.png)
*图12：Claude Code 通过本地 API 成功调用 Trae 模型*

### 5.6 配置 Cursor

- **API Key**: `your-custom-api-key`
- **Base URL**: `http://localhost:19900/v1`
- **Model**: `auto` 或具体模型名如 `glm-5.2`

<!-- 截图13：Cursor 配置 -->

![Cursor 配置](docs/screenshots/13-cursor-config.png)
*图13：在 Cursor 中配置本地 API*

### 5.7 Python 调用

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:19900/v1",
    api_key="your-custom-api-key"
)

response = client.chat.completions.create(
    model="auto",
    messages=[{"role": "user", "content": "用 Python 写一个 HTTP 服务器"}],
    stream=True
)

for chunk in response:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)
```

<!-- 截图14：Python 调用成功 -->

![Python 调用](docs/screenshots/14-python-test.png)
*图14：使用 Python OpenAI SDK 调用本地 API*

***

## 六、可用模型与智能降级

### 6.1 模型分档

| 档位 | 名称 | 模型                                                  | 图片 | 推理  |
| -- | -- | --------------------------------------------------- | -- | --- |
| T1 | 旗舰 | glm-5.2                                             | -  | Yes |
| T2 | 强力 | glm-5.1, qwen-3.7-plus, kimi-k2.6, DeepSeek-V4-Pro  | 部分 | Yes |
| T3 | 中等 | glm-5, qwen-3.6-plus, minimax-m3, DeepSeek-V4-Flash | 部分 | Yes |
| T4 | 轻量 | glm-4.7, kimi-k2, qwen3-coder, minimax-m2.7         | 部分 | Yes |
| T5 | 最轻 | glm-4.6, minimax-m2.1                               | 部分 | Yes |

### 6.2 Claude 模型映射

当 Claude Code 请求 `claude-sonnet-4-6` 时，自动映射到 `glm-5.2`：

| Claude 模型               | 映射到     | 档位 |
| ----------------------- | ------- | -- |
| claude-opus-4-7/4-6/4-5 | glm-5.2 | T1 |
| claude-sonnet-4-6/4-5/4 | glm-5.2 | T1 |
| claude-3.5/3.7-sonnet   | glm-5.2 | T1 |
| claude-haiku-4-5        | glm-5.1 | T2 |

### 6.3 智能降级策略

```
用户请求 → 主模型排队 > 阈值(300)
  ↓
同档并发竞速（raceWithinTier）
  ↓ 全部排队
下一档降级（tieredFallback）
  ↓ 全部排队
兜底模型（fallbackModel: glm-5）
  ↓ 仍然排队
继续等待原始模型
```

<!-- 截图15：降级日志 -->

![降级日志](docs/screenshots/15-fallback-log.png)
*图15：热门模型排队时自动降级到同档/下一档模型*

***

## 七、Trae SSE 协议分析

### 7.1 请求格式

```json
POST /api/agent/v3/llm_utils_chat
{
  "messages": [
    { "role": "user", "content": [{ "type": "text", "text": "Hello" }] }
  ],
  "function": "inline_chat",
  "stream": true
}
```

### 7.2 响应 SSE 事件

```
event:metadata
data:{...}

event:output
data:{"response":"Hello","reasoning_content":null}

event:output
data:{"response":"","reasoning_content":"Let me think..."}

event:token_usage
data:{"prompt_tokens":35,"completion_tokens":4,"total_tokens":39}

event:done
data:{"finish_reason":"stop"}
```

### 7.3 排队事件

当模型繁忙时，会收到排队事件：

```
event:request_wait_in_queue
data:{"position":42}
```

本项目将排队信息转换为 ping 事件（Claude Code 会忽略），避免污染对话历史。

***

## 八、安全与注意事项

### 8.1 Token 安全

- Token 等敏感信息不在日志中完整输出
- CN 版刷新 token 后仅内存更新，不回写加密存储
- 本地 API 通过自定义 API Key 保护，防止未授权访问

### 8.2 使用限制

- 部分模型需要 Trae 付费订阅
- 热门模型可能排队，建议开启智能降级
- Token 约 14 天过期，服务会自动刷新，但刷新失败需重新登录 Trae IDE

### 8.3 常见问题

**Q: 启动报错 "No readable auth info found"**

确保已安装并登录 Trae IDE CN 版。检查文件是否存在：

```
%APPDATA%\Trae CN\User\globalStorage\storage.json
```

**Q: CN 版 token 解密失败**

使用手动 token 方式：打开 Trae IDE → F12 → Network → 触发对话 → 复制 `Authorization` 头中的 JWT，设置到 `.env`：

```
TRAE_MANUAL_TOKEN=eyJ...
```

**Q: Claude Code 只交互一轮就停止**

已修复。原因是模型输出的 XML 格式工具调用未被解析，现已支持 6 种 toolcall 解析格式。

***

## 九、技术总结

### 9.1 Trae CN 加密协议总结

| 项目        | 值                       |
| --------- | ----------------------- |
| 加密格式名称    | "tc" 格式                 |
| 加密算法      | AES-128-CBC             |
| 密钥长度      | 128 bit (16 bytes)      |
| IV 长度     | 128 bit (16 bytes)      |
| 密钥派生      | SHA-512 + XOR 盐值        |
| 盐值来源      | 4 组硬编码盐值（SALT\_A/B/C/D） |
| 完整性校验     | SHA-512 哈希（64 bytes）    |
| 随机数长度     | 32 bytes                |
| Header 长度 | 6 bytes                 |

### 9.2 破解难点

1. **盐值定位**：需要在 Trae CN 的打包 JS 中找到 4 组硬编码盐值
2. **密钥派生**：两轮 SHA-512 + XOR 盐值的派生方式比较特殊
3. **数据结构**：Header + RandomBytes + EncryptedData + Hash 的嵌套结构需要逐层解析
4. **多加密类型**：需要区分 AES 和 AES\_PRIVATE 两种类型，使用不同的盐值组合

### 9.3 防御建议

1. 盐值不应硬编码在客户端 JS 中，应通过安全通道下发
2. AES-128-CBC 强度不足，建议升级到 AES-256-GCM
3. 密钥派生应使用标准 KDF（如 PBKDF2、Argon2），而非自定义的 SHA-512 + XOR
4. 客户端加密本身无法防止逆向，核心防护应在服务端

***

## 十、项目文件结构

```
trae-local-api/
├── src/
│   ├── server.js           # Express 服务器
│   ├── trae-client.js      # Trae API 客户端 + 模型映射 + 分档 + Fallback
│   ├── auth.js             # 认证管理（自动检测版本，token 刷新）
│   ├── anthropic-format.js # Anthropic 格式转换（6 种 toolcall 解析）
│   ├── openai-format.js    # OpenAI 格式转换
│   ├── trae-decrypt.js     # CN 版 tc 加密格式解密（核心破解代码）
│   ├── traffic-logger.js   # 请求/响应日志
│   ├── crypto.js           # AES-256-GCM 加解密
│   └── uuid.js             # UUID 生成
├── web/
│   ├── dashboard.html      # 监控面板
│   └── index.html          # 首页
├── model-config.json       # 模型映射 + 分档 + Fallback 配置
├── .env.example            # 环境变量模板
└── package.json
```

***

## 附录：手动提取 Token 的替代方案

如果不想使用自动解密，可以通过以下方式手动提取 token：

### 方法一：F12 开发者工具

1. 打开 Trae IDE
2. 按 `Ctrl+Shift+I` 打开开发者工具
3. 切换到 Network 面板
4. 触发一次 AI 对话
5. 找到请求 `llm_utils_chat` 或 `chat`
6. 在请求头中找到 `Authorization: Cloud-IDE-JWT eyJ...`
7. 复制 `eyJ...` 部分

<!-- 截图16：F12 提取 token -->

![F12 提取](docs/screenshots/16-f12-token.png)
*图16：通过 F12 开发者工具提取 JWT token*

### 方法二：使用 extract-token.bat

项目自带了 token 提取脚本：

```bash
extract-token.bat
```

脚本会自动从 Trae 日志中提取 JWT token 并保存到 `.env` 文件。

***

> **声明**：本文仅供技术研究和学习交流，请遵守相关服务条款。使用本项目产生的任何问题，由使用者自行承担。

