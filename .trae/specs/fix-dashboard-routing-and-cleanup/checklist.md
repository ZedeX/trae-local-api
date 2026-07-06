# Checklist

## 路由功能验证
- [ ] 根路由 `/` 返回 Dashboard HTML 页面（HTTP 200, Content-Type: text/html）
- [ ] `/v1/dashboard` 兼容路由仍能访问 Dashboard 页面
- [ ] `/v1/info` 返回 JSON 接口清单（需 API Key 认证）
- [ ] `/health` 返回健康检查 JSON（无需认证，包含 status 和 uptime）
- [ ] 未认证访问 `/v1/info` 返回 401
- [ ] 未认证访问 `/health` 返回 200（不拦截）

## 版本号一致性
- [ ] `package.json` version 为 `2.1.0`
- [ ] `/v1/info` 返回的 version 字段为 `2.1.0`
- [ ] `/v1/dashboard/status` 返回的 version 字段为 `2.1.0`
- [ ] Dashboard HTML 页面显示的版本号为 `2.1.0`

## 文件清理
- [ ] 根目录无 `_ed.js`、`_gen-arch.js`、`_gen-screenshots.js`
- [ ] 根目录无 `test_ds_raw.js`、`test_parser.js`、`test_tooluse.js`
- [ ] 根目录无 `test-file-request.json`、`test-request.json`、`test-stream-save.json`、`test-sync-request.json`
- [ ] 根目录无 `_trae_models_raw.json`
- [ ] 根目录无 `__pycache__/` 目录
- [ ] 根目录无 `bun.lock`
- [ ] `scripts/archive/` 目录存在并包含归档的临时脚本
- [ ] `tests/data/` 目录存在并包含归档的测试数据
- [ ] `tests/results/` 目录存在并包含归档的测试结果
- [ ] `docs/screenshots/` 目录存在并包含教程截图

## .gitignore 规则
- [ ] 包含 `_*.js`（根目录临时脚本）
- [ ] 包含 `test-*.json`（根目录测试数据）
- [ ] 包含 `test_*.js`（根目录测试脚本）
- [ ] 包含 `__pycache__/`
- [ ] 包含 `bun.lock`
- [ ] 规则不影响 `scripts/`、`tests/` 子目录下的合法文件

## 文档同步
- [ ] README.md 中 Dashboard 地址为 `http://localhost:19900/`
- [ ] README.md 端点列表包含 `/health` 和 `/v1/info`
- [ ] PROGRESS.md 时间线包含 2026-07-06 变更记录
- [ ] CRACK_TUTORIAL.md 图片路径为 `docs/screenshots/`

## 引用完整性
- [ ] `npm test` 可正常运行（无 "module not found" 错误）
- [ ] `npm start` 服务正常启动
- [ ] 全局搜索无断裂的文件引用（被移动文件的旧路径）
- [ ] Dashboard 页面在浏览器中正常加载（图表、数据展示正常）

## Git 提交
- [ ] `git status` 显示变更符合预期
- [ ] 提交信息为 `fix: root route returns dashboard + project cleanup`
- [ ] 已推送到 `origin/main`
