# Tasks

## Phase 1: 路由修复（核心问题）

- [ ] Task 1: 修改根路由 `/` 返回 Dashboard HTML 页面
  - [ ] SubTask 1.1: 在 [src/server.js](file:///e:/git/_archieves/trae-local-api/src/server.js) 中将 `app.get('/')` 处理函数改为 `res.sendFile(path.join(__dirname, '..', 'web', 'dashboard.html'))`
  - [ ] SubTask 1.2: 将原 JSON 接口清单代码移动到新路由 `app.get('/v1/info', authenticate, ...)`，并加认证
  - [ ] SubTask 1.3: 修改 `/v1/dashboard` 路由，直接调用根路由处理逻辑（或重定向到 `/`）

- [ ] Task 2: 新增 `/health` 健康检查端点
  - [ ] SubTask 2.1: 在 `app.listen` 之前添加 `app.get('/health', (req, res) => res.json({status:'ok', uptime:...}))`
  - [ ] SubTask 2.2: 确保无需 `authenticate` 中间件

## Phase 2: 版本号统一

- [ ] Task 3: 统一版本号到 `2.1.0`
  - [ ] SubTask 3.1: 修改 [package.json](file:///e:/git/_archieves/trae-local-api/package.json) 的 `version` 字段为 `2.1.0`
  - [ ] SubTask 3.2: 修改 [src/server.js](file:///e:/git/_archieves/trae-local-api/src/server.js) 中 `/v1/info` 返回的 `version: '2.0.0'` 为 `2.1.0`
  - [ ] SubTask 3.3: 修改 [src/server.js](file:///e:/git/_archieves/trae-local-api/src/server.js) 中 `/v1/dashboard/status` 返回的 `version: '2.0.0'` 为 `2.1.0`
  - [ ] SubTask 3.4: 检查 [web/dashboard.html](file:///e:/git/_archieves/trae-local-api/web/dashboard.html) 中的版本号硬编码，更新为 `2.1.0`

## Phase 3: 文件清理与归档

- [ ] Task 4: 创建归档目录结构
  - [ ] SubTask 4.1: 创建 `scripts/archive/` 目录
  - [ ] SubTask 4.2: 创建 `tests/data/` 目录
  - [ ] SubTask 4.3: 创建 `tests/results/` 目录（如不存在）

- [ ] Task 5: 移动临时脚本到 `scripts/archive/`
  - [ ] SubTask 5.1: 移动 `_ed.js` → `scripts/archive/_ed.js`
  - [ ] SubTask 5.2: 移动 `_gen-arch.js` → `scripts/archive/_gen-arch.js`
  - [ ] SubTask 5.3: 移动 `_gen-screenshots.js` → `scripts/archive/_gen-screenshots.js`
  - [ ] SubTask 5.4: 移动 `test_ds_raw.js` → `scripts/archive/test_ds_raw.js`
  - [ ] SubTask 5.5: 移动 `test_parser.js` → `scripts/archive/test_parser.js`
  - [ ] SubTask 5.6: 移动 `test_tooluse.js` → `scripts/archive/test_tooluse.js`
  - [ ] SubTask 5.7: 移动 `_trae_models_raw.json` → `scripts/archive/_trae_models_raw.json`

- [ ] Task 6: 移动测试数据到 `tests/data/`
  - [ ] SubTask 6.1: 移动 `test-file-request.json` → `tests/data/test-file-request.json`
  - [ ] SubTask 6.2: 移动 `test-request.json` → `tests/data/test-request.json`
  - [ ] SubTask 6.3: 移动 `test-stream-save.json` → `tests/data/test-stream-save.json`
  - [ ] SubTask 6.4: 移动 `test-sync-request.json` → `tests/data/test-sync-request.json`

- [ ] Task 7: 移动测试结果到 `tests/results/`
  - [ ] SubTask 7.1: 移动 `test_results/` 下所有文件 → `tests/results/`
  - [ ] SubTask 7.2: 删除空的 `test_results/` 目录

- [ ] Task 8: 清理无关文件
  - [ ] SubTask 8.1: 删除 `__pycache__/` 目录（Python 缓存，与 Node 项目无关）
  - [ ] SubTask 8.2: 删除 `bun.lock`（项目使用 npm，已有 `package-lock.json`）

- [ ] Task 9: 处理 `screenshots/` 目录
  - [ ] SubTask 9.1: 将 `screenshots/` 移动到 `docs/screenshots/`（教程资源归档到文档目录）
  - [ ] SubTask 9.2: 更新 [CRACK_TUTORIAL.md](file:///e:/git/_archieves/trae-local-api/CRACK_TUTORIAL.md) 中的图片引用路径（从 `screenshots/` 改为 `docs/screenshots/`）

## Phase 4: .gitignore 更新

- [ ] Task 10: 扩展 [.gitignore](file:///e:/git/_archieves/trae-local-api/.gitignore) 规则
  - [ ] SubTask 10.1: 在 "# Output & temp" 区块后添加根目录临时文件忽略规则：`_*.js`、`test-*.json`、`test_*.js`
  - [ ] SubTask 10.2: 添加 Python 忽略规则：`__pycache__/`、`*.pyc`（如未有）
  - [ ] SubTask 10.3: 添加 `bun.lock` 忽略规则
  - [ ] SubTask 10.4: 验证规则不会影响 `scripts/` 和 `tests/` 子目录下的合法文件（使用 `/` 前缀限定根目录）

## Phase 5: 文档同步

- [ ] Task 11: 更新 [README.md](file:///e:/git/_archieves/trae-local-api/README.md)
  - [ ] SubTask 11.1: 将 Dashboard 访问地址从 `http://localhost:19900/v1/dashboard` 更新为 `http://localhost:19900/`
  - [ ] SubTask 11.2: 在 API 端点列表中新增 `/health` 和 `/v1/info` 说明
  - [ ] SubTask 11.3: 检查 README 中其他位置的 dashboard 引用，统一更新

- [ ] Task 12: 更新 [PROGRESS.md](file:///e:/git/_archieves/trae-local-api/PROGRESS.md)
  - [ ] SubTask 12.1: 在时间线末尾追加本次变更记录（2026-07-06 - Dashboard 路由修复 + 项目整洁化）
  - [ ] SubTask 12.2: 更新 "已知问题" 章节，移除已解决的项目

## Phase 6: 验证测试

- [ ] Task 13: 路由功能验证
  - [ ] SubTask 13.1: 启动服务 `npm start`
  - [ ] SubTask 13.2: 浏览器访问 `http://localhost:19900/`，确认显示 Dashboard 页面（非 JSON）
  - [ ] SubTask 13.3: `curl http://localhost:19900/v1/info -H "Authorization: Bearer trae-local-api-key"`，确认返回 JSON 接口清单
  - [ ] SubTask 13.4: `curl http://localhost:19900/health`，确认返回 `{"status":"ok",...}`
  - [ ] SubTask 13.5: 浏览器访问 `http://localhost:19900/v1/dashboard`，确认仍能显示 Dashboard 页面

- [ ] Task 14: 文件移动后引用检查
  - [ ] SubTask 14.1: 全局搜索被移动文件的引用（`grep -r "_ed.js\|_gen-arch\|test_ds_raw\|test_parser\|test_tooluse"`），确认无断裂
  - [ ] SubTask 14.2: 验证 `npm test` 仍可运行（如 test-all.js 引用了被移动的文件，需修复路径）

- [ ] Task 15: 截图教程验证
  - [ ] SubTask 15.1: 确认 [CRACK_TUTORIAL.md](file:///e:/git/_archieves/trae-local-api/CRACK_TUTORIAL.md) 中的图片路径已更新为 `docs/screenshots/`
  - [ ] SubTask 15.2: 在 Markdown 预览中确认图片能正常显示

## Phase 7: 提交

- [ ] Task 16: Git 提交
  - [ ] SubTask 16.1: `git add -A` 暂存所有变更
  - [ ] SubTask 16.2: `git status` 确认暂存内容符合预期（无意外文件）
  - [ ] SubTask 16.3: `git commit -m "fix: root route returns dashboard + project cleanup"`
  - [ ] SubTask 16.4: `git push origin main`

# Task Dependencies

- Task 2 (新增 `/health`) 无依赖，可与 Task 1 并行
- Task 3 (版本号) 依赖 Task 1（修改 server.js 后再改版本号）
- Task 4-9 (文件清理) 无依赖，可并行执行
- Task 10 (.gitignore) 应在 Task 4-9 之后执行（避免规则影响文件移动）
- Task 11-12 (文档) 依赖 Task 1-3 完成（确认最终路由和版本号）
- Task 13-15 (验证) 依赖所有前置任务完成
- Task 16 (提交) 依赖所有验证通过
