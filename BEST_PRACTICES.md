# Trae Local API 最佳实践与避坑指南

## 模型 Toolcall 兼容性避坑

### 核心原则：config_name 大小写必须与 Trae API 一致

Trae API 的 `config_name` 参数**大小写敏感**。错误的 config_name 会返回 4001 错误（"the param is invalid"），模型完全不可用。

**常见错误**：
| 错误 config_name | 正确 config_name | 说明 |
|-----------------|-----------------|------|
| `MiniMax-M2.7` | `minimax-m2.7` | 全小写 |
| `Kimi-K2.6` | `kimi-k2.6` | 全小写 |
| `Qwen3.6-Plus` | `qwen-3.6-plus` | 全小写+横杠 |
| `GLM-5V-Turbo` | `glm-5v-turbo` | 全小写 |
| `Doubao-Seed-Code` | `Doubao_1_6` | 下划线非横杠 |
| `deepseek-r1` | `custom_model_deepseek_reasoner` | 不存在，需用占位符 |
| `gpt-4o` | `custom_model_gpt-5` | 不存在，需用占位符 |

### Toolcall 兼容性测试结果（2026-06-18 实测）

测试方法：发送含 `<available_tools>` system prompt 的请求，检测模型是否生成 `<toolcall>` 标签。

#### ✅ Toolcall 兼容（12 个）

| 模型 | config_name | toolcall | 纯文本 | 备注 |
|------|------------|----------|--------|------|
| **glm-5** | `glm-5` | ✅ Read | ✅ | 快速（41s），首选替代 |
| **glm-5.1** | `glm-5.1` | ✅（历史验证） | ✅ | 排队严重（415s），但最稳定 |
| **glm-5.2** | `glm-5.2` | ✅ | ✅ | 旗舰模型，支持推理 |
| **Doubao-Seed-2.0-Code** | `Doubao-Seed-2.0-Code` | ✅ Read | ✅ | 代码专用，93s |
| **Doubao_1_6** | `Doubao_1_6` | ✅ Read | ✅ | 最快（6.5s）！ |
| **doubao_1_8** | `doubao_1_8` | ✅ Read | ✅ | 新版豆包推理模型 |
| **minimax-m2.7** | `minimax-m2.7` | ✅ Read | ✅ | |
| **minimax-m3** | `minimax-m3` | ✅ Read | ✅ | 新版 MiniMax |
| **qwen-3.6-plus** | `qwen-3.6-plus` | ✅ Read | ✅ | |
| **qwen3-coder** | `qwen3-coder` | ✅ Read | ✅ | 代码专用，无推理 |
| **glm-5v-turbo** | `glm-5v-turbo` | ✅ Read | ✅ | 多模态 |
| **DeepSeek-V4-Pro** | `DeepSeek-V4-Pro` | ✅ | ✅ | **已确认支持 tooluse**（之前测试错误） |
| **DeepSeek-V4-Flash** | `DeepSeek-V4-Flash` | ✅ | ✅ | **已确认支持 tooluse** |

#### ⚠️ 排队超时未测（1 个）

| 模型 | config_name | 备注 |
|------|------------|------|
| **kimi-k2.6** | `kimi-k2.6` | 排队超时 |

#### ❌ Trae API 不存在的 config_name（返回 4001）

以下 config_name 在 Trae 的 `chat_v3` 函数下**不存在**，使用时会返回 4001 错误：
- `gpt-4o`, `gpt-4o-mini`, `gemini-2.0-flash`, `gemini-2.5-pro`
- `deepseek-r1`, `Doubao-Seed-Code`, `doubao-1.5-pro`
- `MiniMax-M2.7`（大小写错误）, `Qwen3.6-Plus`（大小写错误）

如需使用这些模型，需通过 `custom_model_*` 占位符。

### DeepSeek-V4 最新状态（2026-06-18 更新）

**之前结论**：DeepSeek-V4-Pro 返回 0 字符，判定不支持 tooluse。

**重新测试结论**：**两个 DeepSeek 模型都支持 tooluse！**

**根因**：之前的测试脚本 SSE 解析有误——
1. 测试脚本传 `options.tools`，但 `llmUtilsChat` 不使用该参数（实际机制是 server.js 将工具描述注入 system prompt）
2. SSE 解析只认 `data: `（带空格），但 Trae 的 SSE 部分行是 `data:`（不带空格）
3. 解析逻辑找 `parsed.type === 'text'` + `parsed.content`，但 Trae 实际格式是 `event:output` + `parsed.response` + `parsed.reasoning_content`

**修复后测试结果**：
- DeepSeek-V4-Pro: 输出 `<toolcall>{"name": "Bash", "params": {"command": "ls -la"}}</toolcall>`
- DeepSeek-V4-Flash: 输出 `<toolcall>{"name": "Bash", "params": {"command": "ls -la"}}</toolcall>`

**适用场景**：DeepSeek-V4 系列现在完全支持 tooluse，可以正常用于 Claude Code 等需要工具调用的场景。

### 模型路由规则

1. **Claude Sonnet/Haiku/Opus 请求** → 映射到 `glm-5.1`（已验证 toolcall 兼容）
2. **显式指定 DeepSeek 的请求** → 保留映射，但仅用于纯文本场景
3. **降级链** → 使用已验证 toolcall 兼容的模型（Doubao-Seed-2.0-Code、qwen-3.6-plus、minimax-m2.7）

---

## Auto-Continue 避坑

### 短响应循环问题

**现象**：模型反复输出类似的短响应（"让我先了解项目结构"），auto-continue 循环 5 次。

**已修复**：增加重复短响应检测——如果连续两次短响应（< 200 字符）相似度 > 50%，立即停止续接。

### isResponseTruncated 增强检测

新增检测模式：**有推理内容但没有工具调用，且文本输出少于 200 字符**，视为截断并触发 auto-continue。

---

## body.model 字段一致性

当有 `config_name` 时，`body.model` 必须同步设为 `config_name`，而非 Claude 原始模型名。否则 Trae API 可能根据 `model` 字段路由到非预期的模型。

---

## 通用建议

1. **新模型上线前必须测试 toolcall**：使用 `scripts/test_model_toolcall.py` 脚本测试
2. **降级链不要包含未验证的模型**：避免排队时切换到不兼容模型
3. **监控日志中的短响应比例**：如果某模型短响应 > 20%，考虑切换
4. **max_tokens 转发**：确保 `options.max_tokens` 传递到 `body.max_tokens`，防止截断
5. **config_name 大小写**：必须与 Trae API 返回的 `config_info_list` 中完全一致
6. **查询可用模型**：`GET /v1/models/detail?function=chat_v3` 可获取所有支持的 config_name

---

## 测试工具

- `scripts/test_model_toolcall.py`：模型 toolcall 兼容性测试（v3，使用正确 config_name）
- `scripts/analyze_all_logs.py`：全量日志分析
- `scripts/deep_analyze_cases.py`：深度案例对比
- `scripts/list_trae_models.py`：查询 Trae 支持的模型列表
