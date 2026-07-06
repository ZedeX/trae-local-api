# Dashboard 路由修复 + 项目整洁化 Spec

## Why

用户访问 `http://localhost:19900/` 期望看到 Dashboard 监控面板，但当前根路由返回的是 JSON 接口清单（[server.js:835-858](file:///e:/git/_archieves/trae-local-api/src/server.js#L835-L858)）。Dashboard 实际位于 `/v1/dashboard`（[server.js:1097-1104](file:///e:/git/_archieves/trae-local-api/src/server.js#L1097-L1104)），与用户预期不符。同时整体排查发现项目根目录堆积大量临时脚本和测试数据文件，影响仓库整洁度。

## What Changes

### 路由调整

* **根路由** **`/`** **改为返回 Dashboard HTML 页面**（直接 serve `web/dashboard.html`）

* 原 `/` 的 JSON 接口清单移动到 `/v1/info` 或 `/api/info`（保留可访问性）

* `/v1/dashboard` 路由保留作为兼容入口（重定向到 `/` 或直接 serve 同一页面）

* 新增 `/health` 端点（无需认证，返回 `{status:"ok"}`，便于 uptime 监控）

### 静态资源服务

* 新增 `/static/*` 路由用于服务 dashboard 所需的静态资源（如未来需要分离 CSS/JS）

* 当前 dashboard.html 是单文件，暂时不需要拆分，但路由预留

### 项目整洁化

* **根目录临时脚本清理**：`_ed.js`、`_gen-arch.js`、`_gen-screenshots.js`、`test_ds_raw.js`、`test_parser.js`、`test_tooluse.js` 移动到 `scripts/archive/` 或删除

* **测试数据文件清理**：`test-file-request.json`、`test-request.json`、`test-stream-save.json`、`test-sync-request.json`、`_trae_models_raw.json` 移动到 `tests/data/` 或删除

* **`__pycache__/`** **目录删除**：Python 缓存，与 Node 项目无关

* **`test_results/`** **目录清理**：旧测试结果，移动到 `tests/results/` 或删除

* **`bun.lock`** **删除**：项目使用 npm（有 `package-lock.json`），不需要 bun.lock

* **`screenshots/`** **目录处理**：这是 52pojie 教程的截图，不属于 API 服务，移到独立位置或加入 `.gitignore`

### .gitignore 更新

* 新增忽略规则：`_*.js`、`test-*.json`、`test_*.js`、`__pycache__/`、`*.pyc`、`bun.lock`、`screenshots/`（如保留则不忽略）

### 版本号统一

* `package.json` version 从 `1.0.0` 更新到 `2.1.0`（与 server.js 和 dashboard 中的 `2.0.0` 对齐，本次为 minor 升级）

### 文档同步

* `README.md` 中 Dashboard 访问地址从 `http://localhost:19900/v1/dashboard` 更新为 `http://localhost:19900/`

* `PROGRESS.md` 追加本次变更记录

## Impact

* **Affected specs**: 无（首次创建 spec）

* **Affected code**:

  * [src/server.js](file:///e:/git/_archieves/trae-local-api/src/server.js) - 路由调整（根路由、`/v1/dashboard`、新增 `/health` 和 `/v1/info`）

  * [package.json](file:///e:/git/_archieves/trae-local-api/package.json) - version 更新

  * [.gitignore](file:///e:/git/_archieves/trae-local-api/.gitignore) - 新增忽略规则

  * [README.md](file:///e:/git/_archieves/trae-local-api/README.md) - 文档同步

  * [PROGRESS.md](file:///e:/git/_archieves/trae-local-api/PROGRESS.md) - 追加变更记录

  * 根目录临时文件 - 移动或删除

## ADDED Requirements

### Requirement: 根路由返回 Dashboard 页面

系统 SHALL 在 `GET /` 请求时返回 Dashboard HTML 页面（`web/dashboard.html`），无需 API Key 认证。

#### Scenario: 用户访问根路由

* **WHEN** 用户通过浏览器访问 `http://localhost:19900/`

* **THEN** 返回 Dashboard HTML 页面（HTTP 200，Content-Type: text/html）

#### Scenario: Dashboard 页面加载资源

* **WHEN** Dashboard HTML 页面引用外部资源（如 Chart.js CDN）

* **THEN** 页面正常加载，所有图表和数据显示正常

### Requirement: API 接口清单端点

系统 SHALL 保留原根路由的 JSON 接口清单功能，移动到 `/v1/info` 端点。

#### Scenario: 查询 API 接口清单

* **WHEN** 客户端发送 `GET /v1/info` 请求（带 API Key）

* **THEN** 返回 JSON 格式的 API 接口清单，包含所有可用端点说明

### Requirement: 健康检查端点

系统 SHALL 提供 `/health` 端点用于健康检查，无需认证。

#### Scenario: 健康检查

* **WHEN** 监控系统发送 `GET /health` 请求

* **THEN** 返回 `{"status":"ok","uptime":"<运行时间>"}`（HTTP 200）

### Requirement: Dashboard 兼容路由

系统 SHALL 保留 `/v1/dashboard` 路由作为兼容入口，返回与 `/` 相同的 HTML 页面。

#### Scenario: 通过旧地址访问 Dashboard

* **WHEN** 用户访问 `http://localhost:19900/v1/dashboard`

* **THEN** 返回与 `/` 相同的 Dashboard HTML 页面

### Requirement: 项目根目录整洁

系统 SHALL 保持根目录只包含项目运行必需文件，临时脚本和测试数据归档到子目录。

#### Scenario: 检查根目录

* **WHEN** 执行 `ls` 列出项目根目录

* **THEN** 只看到 `src/`、`web/`、`tests/`、`scripts/`、`logs/`、`docs/`（如有）、`node_modules/`、配置文件（`package.json`、`.env.example`、`.gitignore`、`model-config.json`、`model-fallback.json`）和文档（`README.md`、`PROGRESS.md`、`ARCHITECTURE.md`、`API.md`、`CRACK_TUTORIAL.md`）

## MODIFIED Requirements

### Requirement: 路由结构

原根路由 `/` 返回 JSON 接口清单，修改为返回 Dashboard HTML 页面。JSON 接口清单移动到 `/v1/info`。

**变更前**：

* `GET /` → JSON 接口清单（无需认证）

* `GET /v1/dashboard` → Dashboard HTML 页面（无需认证）

**变更后**：

* `GET /` → Dashboard HTML 页面（无需认证）

* `GET /v1/dashboard` → Dashboard HTML 页面（无需认证，兼容保留）

* `GET /v1/info` → JSON 接口清单（需认证）

* `GET /health` → 健康检查 JSON（无需认证）

### Requirement: .gitignore 规则

扩展 `.gitignore` 规则，忽略根目录的临时脚本和测试数据文件。

**新增规则**：

```
# Temporary scripts and test data in root
_*.js
test-*.json
test_*.js
__pycache__/
*.pyc
bun.lock
```

### Requirement: 版本号

统一项目版本号到 `2.1.0`。

* `package.json`: `1.0.0` → `2.1.0`

* `server.js` 中 `/v1/info` 返回的 version: `2.0.0` → `2.1.0`

* `dashboard.html` 中显示的 version: `2.0.0` → `2.1.0`

* `/v1/dashboard/status` 返回的 version: `2.0.0` → `2.1.0`

## REMOVED Requirements

### Requirement: 根目录临时文件

**Reason**: 项目整洁化，临时脚本和测试数据不应堆积在根目录
**Migration**:

* `_ed.js`、`_gen-arch.js`、`_gen-screenshots.js` → 移动到 `scripts/archive/`

* `test_ds_raw.js`、`test_parser.js`、`test_tooluse.js` → 移动到 `scripts/archive/`

* `test-file-request.json`、`test-request.json`、`test-stream-save.json`、`test-sync-request.json` → 移动到 `tests/data/`

* `_trae_models_raw.json` → 移动到 `scripts/archive/`（259KB 原始模型数据）

* `__pycache__/` → 删除（Python 缓存，与 Node 项目无关）

* `test_results/` → 移动到 `tests/results/`

* `bun.lock` → 删除（项目使用 npm）

* `screenshots/` → 保留（教程资源），但加入 `.gitignore` 或移到 `docs/screenshots/`

## 非目标（Non-Goals）

* **不重构核心 API 逻辑**：本次只调整路由和清理文件，不修改 `trae-client.js`、`auth.js` 等核心逻辑

* **不分离 dashboard 前端**：dashboard.html 保持单文件，不拆分为 React/Vue 项目

* **不添加新功能**：不增加新的 API 端点（除 `/health` 和 `/v1/info` 外）

* **不修改认证逻辑**：`authenticate` 中间件保持不变

* **不优化性能**：本次不涉及性能优化

## 风险评估

| 风险                | 影响 | 缓解措施                       |
| ----------------- | -- | -------------------------- |
| `/` 路由变更破坏现有脚本    | 低  | 保留 `/v1/info` 提供原 JSON 功能  |
| 文件移动导致路径引用断裂      | 中  | 全局搜索引用，逐一修复                |
| `.gitignore` 规则过宽 | 低  | 规则限定在根目录，不影响子目录            |
| Dashboard 页面加载失败  | 低  | 测试覆盖，保留 `/v1/dashboard` 兼容 |

