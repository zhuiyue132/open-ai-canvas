# 意绘 · AI 文档索引

参考文档入口。文档维护规则见 [AGENTS.md](../AGENTS.md) 第 9 节「文档与交付」。

**决策与设计理由不在本索引里**：它们按 `.agents/notes/{lifecycle}/{class}/yyyy-mm-dd-topic.md` 归类（约定见 `.agents/skills/write-notes-like-deepseek/SKILL.md`），检索用 `rg` 扫 `.agents/notes/`，不建集中索引。

## 部署与更新入口

用户要求部署服务器时，默认使用官方 Release 镜像、`docker-compose.deploy.yml` 和 Host Updater；本地 SQLite 构建与自定义 Compose 不属后台在线更新管理范围。方案对比见根 [README](../README.md) 的「服务器部署」段。

- [在线更新与安全回退](content/docs/backend/system-update.mdx)：受管部署条件、安装、备份、迁移和回退。
- [本地开发](content/docs/backend/local-development.mdx)：宿主机与热更新开发环境。
- [任务运行时稳定性](content/docs/backend/task-runtime-stability.mdx)：队列、重试与恢复边界。

## 接口与数据合同

- [HTTP API 合同](content/docs/backend/http-api.mdx)：响应信封、错误码、鉴权与 SSE。
- [后端数据库](content/docs/backend/backend-database.mdx)：表结构、枚举与迁移约定。
- [NewAPI 渠道（第二版）](content/docs/backend/newapi-channel-2.mdx)
- [视频 Token 计价](content/docs/backend/video-token-billing.mdx)
- [画布数据同步](content/docs/backend/canvas-operations-sync.mdx)

## 能力与模块

- [功能清单](content/docs/overview/features.mdx)
- [功能地图（Agent 侧）](../.agents/skills/feature-map/FEATURE_MAP.md)：功能 → 抵达路径 → 代码锚点 → 验收信号，与 `router.tsx` 的漂移由 `verify-feature-map` 拦住。
- [代码功能地图](content/docs/backend/code-map.mdx)
- [画布 Agent 外观与 Live2D](content/docs/backend/canvas-agent-appearance.mdx)
- [Agent 提示词策略](content/docs/backend/agent-prompt-policy.mdx)
- [技能库与策展](content/docs/backend/skill-curation.mdx)
- [自定义更新公告](content/docs/backend/update-announcements.mdx)
- [插件系统](content/docs/plugins/plugin-system.mdx) · [插件表面](content/docs/plugins/plugin-surfaces.mdx) · [支付插件运行时](content/docs/plugins/payment-plugin-runtime.mdx)
- [AI 审美批改画布插件](content/docs/plugins/ai-art-critique.mdx)

## 进度

- [待测试清单](content/docs/progress/pending-test.mdx)：已实现但未经用户确认的变化。

## 上游遗产（只读，不作为真相源）

以下目录随上游同步保留，本仓库不新增、不作为决策依据；需要其中的事实时按路径引用：

- `docs/adr/`：上游决策记录 10 篇
- `docs/design/`：上游设计沉淀 21 篇（含 `ui-review-evidence/` 截图与控制台日志）
- `docs/plans/`：上游实施计划 8 篇
- `docs/superpowers/specs/`：上游规格 2 篇

## 文档分发

`docs/` 全量随仓库分发：根 `.gitignore` 的 `docs/*` 白名单被 `docs/.gitignore` 覆盖，新增文档不需要 `git add -f`；`.env*`、`.settings-key`、日志、数据库与缓存目录仍被压住。本机私密或临时内容放 `.local/`（已被忽略）。

- [AGENT_LOCAL_DEVELOPMENT.md](AGENT_LOCAL_DEVELOPMENT.md)：二开仓库的远端结构、`main` 镜像 / `work` 主线约定、手工上游同步与冲突结算规则。

规则与取舍记录在 `.agents/notes/implemented/process/2026-10-15-docs-versioned-in-repo.md`。
