# 功能地图

功能 ↔ 抵达路径 ↔ 代码锚点 ↔ 验收信号。用法与维护规则见同目录 `SKILL.md`。

机器校验：先在 `web/` 安装锁定依赖（`bun install --frozen-lockfile`），再从仓库根目录运行 `bun run .agents/skills/feature-map/scripts/verify-feature-map.ts`。完整锚点、命令中的测试路径和文件模式都检查存在性；路由与 `web/src/router.tsx` 双向比对（`/welcome` 单独检查登记和分流标记）。默认值、入口行为与测试覆盖是否贴切仍需人工核对。下列命令均从仓库根目录执行。

## 1. 全局入口与前置条件

### 侧栏（登录后）

`web/src/components/layout/workspace-sidebar-nav.tsx` 是唯一入口表，分三组：

| 组 | 条目 |
| --- | --- |
| 无标题 | 创作 `/` · 短剧制作 `/projects` · 自由画布 `/canvas` |
| 资源与工具 | 图片生成 `/toolbox/image` · 视频生成 `/toolbox/video` · 技能 `/skills` · 插件 `/plugins` |
| 资产与历史 | 资产 `/assets` · 创作历史 `/tasks` |

侧栏没有「设置」和「管理后台」；两者只在用户卡片菜单里。

### ⌘K 命令面板

`web/src/components/layout/app-top-nav.tsx` 监听 `⌘K` / `Ctrl+K`，渲染 `web/src/components/layout/workspace-command-palette.tsx`。条目按 feature flag 过滤，只含首页、短剧、画布、任务、资产、技能、钱包、设置——**不含工作台和插件**，所以「⌘K 里搜不到图片生成」不是 bug。

顶栏 chrome 在 `/admin` 与 `/canvas/:id` 下整块隐藏（`web/src/components/layout/app-top-nav.tsx` 的 `hideChrome`），这些页面自有顶栏。

### 用户卡片菜单

`web/src/components/layout/workspace-account-card.tsx`：「账户与设置」→ `/settings?section=profile`；「管理员后台」→ `/admin`，仅 `user.role === "admin"` 时渲染；「退出登录」。

### feature flag 现状

定义在 `web/src/stores/use-user-store.ts` 的 `FeatureAvailability`，管理员在 `/admin/settings/features` 修改。关闭时 `web/src/components/auth/require-feature.tsx` 渲染「XX暂未开放」空态页——**不 404、不跳转**，看到这句话先查开关，不要当路由问题修。

| flag | 默认 | 关闭时表现 | 影响入口 |
| --- | --- | --- | --- |
| `imageWorkbenchEnabled` | **false** | `/toolbox/image` 显示「生图暂未开放」 | 侧栏图片生成 |
| `videoWorkbenchEnabled` | **false** | `/toolbox/video` 显示「视频暂未开放」 | 侧栏视频生成 |
| `frontendModelsEnabled` | **false** | `/admin/models` 显示「前台模型暂未开放」，按钮回管理后台首页 | 后台模型页 |
| `shortDramaEnabled` | true | `/projects` 及全部子路由显示「短剧创作暂未开放」 | 侧栏短剧制作、⌘K |
| `taskCenterEnabled` | true | `/tasks` 显示「任务中心暂未开放」 | 侧栏创作历史、⌘K |
| `pluginCenterEnabled` | true | `/plugins`、`/plugins/eagle` 显示「插件中心暂未开放」 | 侧栏插件 |
| `creditsEnabled` | true | 隐藏钱包浮层、余额胶囊与 ⌘K 钱包项 | 无独立路由 |
| `customChannelsEnabled` | true | `/settings` 仅隐藏「个人渠道」；对应深链回落到 `models` | 设置内；RunningHub 另由插件运行状态控制 |
| `systemPluginsVisibleToUsers` | true | 用户端插件列表过滤系统插件 | `/plugins` |
| `inspirationSourcesVisible` | true | 创作页隐藏灵感来源入口 | `/` |
| `welcomeEnabled` | true | `/welcome` 直接 `location.replace("/")` | `/welcome` |

## 2. 创作与画布

### 创作工作台

- **抵达**：`/` 或 `/create`；游客可直达（`web/src/lib/guest-workspace.ts` 白名单）。侧栏「创作」、⌘K「首页」。
- **锚点**：`web/src/pages/create/index.tsx` → `web/src/pages/create/creation-workspace.tsx`；提交门 `web/src/pages/create/creation-submit-gate.ts`；云端 Agent 入口 `web/src/pages/create/creation-agent-entry.tsx`；API `web/src/services/api/creation-runs.ts`；后端 `backend/internal/handler/creation.go`。
- **验收**：`cd web && bun test test/creation-submit-gate.test.ts test/creation-references.test.ts test/creation-inspirations.test.ts`。
- **陷阱**：纵深灵感画廊的封面有就绪门控（`web/src/pages/create/creation-inspiration-tunnel.tsx`），页面刚挂载就截图会拿到空位；灵感来源受 `inspirationSourcesVisible` 控制。

### 自由画布列表

- **抵达**：`/canvas`，页头「我的画布」；顶部可按「全部画布 / 自由画布 / 项目画布」过滤。
- **锚点**：`web/src/pages/canvas/index.tsx`；本地状态 `web/src/stores/canvas/use-canvas-store.ts`；同步 `web/src/services/user-data-sync.ts`。
- **验收**：`cd web && bun test test/canvas-document.test.ts`；列表面板来自分页摘要，不是 `GET /api/user-data/snapshot`。
- **陷阱**：列表只加载摘要，打开/导出/重命名时才按 ID 读完整画布（后端 `backend/internal/canvas/user_data_page.go`）。用 snapshot 判空会得到假空态。

### 自由画布编辑器

- **抵达**：`/canvas/:id`；画布列表卡片、短剧「新建项目画布」都落到这里。⌘K 只到列表，不到具体画布。
- **锚点**：`web/src/pages/canvas/project.tsx`（页面装配）、`web/src/pages/canvas/use-canvas-project-lifecycle.ts`（恢复与持久化）、`web/src/components/canvas/canvas-viewport.tsx`（拖拽缩放）、`web/src/lib/canvas/canvas-project-domain.ts`（领域规则）、`web/src/services/api/user-data.ts`（operations 同步）；后端 `backend/internal/handler/user_data.go`、`backend/internal/canvas/`。
- **验收**：`cd web && bun test test/canvas-editor-consistency.test.ts test/canvas-collaboration-layer.test.ts`；视图存在 `[data-canvas-viewport]`；滚轮边界用 `[data-canvas-no-zoom]` / `[data-canvas-wheel-scroll]` 判断；同步状态面板 `web/src/pages/canvas/canvas-sync-status.tsx`。快捷键枚举在 `web/src/lib/canvas/canvas-shortcuts.ts`，`?` 弹窗是 `web/src/pages/canvas/canvas-shortcuts-modal.tsx`，不要在两处分别维护快捷键说明。
- **陷阱**：用 `page.mouse.wheel` 测画布缩放或平移前，先移到 `[data-canvas-viewport]` 内不匹配忽略选择器的空白区域；测面板内部滚动才移到 `[data-canvas-no-zoom]` / `[data-canvas-wheel-scroll]` 区域。普通滚轮在这些忽略区域不会驱动画布；Ctrl/Meta + 滚轮仍由画布接管。多窗口协作需要第二个浏览器上下文，单标签页测不出 presence 与远端光标。

### 画布内云端 Agent

- **抵达**：画布编辑器内助手面板，无独立路由；支持浮窗与右侧停靠，布局入口在面板菜单；外观与开关在 `/admin/settings/appearance`。
- **锚点**：`web/src/components/canvas/canvas-cloud-agent-panel.tsx`（对话、技能、审批）、`web/src/services/api/agent.ts`（运行与 SSE）、`web/src/lib/canvas/canvas-operation-contract.ts`（画布操作契约）；后端 `backend/internal/app/cloud_agent.go`、`backend/internal/agent/tool/policy.go`（工具分类与可见性单一来源）、`backend/internal/prompts/agent-system-policy.md`（行为策略）；运行时 `backend/agent-runtime/pi/agent-runtime.mjs`。
- **验收**：`cd web && bun test test/canvas-agent-focus.test.ts test/agent-canvas-sync.test.ts test/agent-approval-presentation.test.ts`。
- **陷阱**：设置 `YINGCE_AGENT_URL` 后只调 `yingce-agent` 容器，不设置才在进程内起 Node。远程失败不会回退到内嵌进程——排查时先确认走的是哪条路，别在同一步上怀疑 Agent 执行两遍。

## 3. 短剧制作

### 项目列表

- **抵达**：`/projects`；侧栏「短剧制作」；受 `shortDramaEnabled` 控制。新建项目走 `/projects/new`。
- **锚点**：`web/src/pages/projects/index.tsx`、新建页 `web/src/pages/projects/create.tsx`；API `web/src/services/api/projects.ts`；后端 `backend/internal/handler/project.go`（`RegisterProjectRoutes`）。
- **验收**：`cd web && bun test test/project-name-conflict.test.ts`。
- **陷阱**：新建同名项目走冲突提示而不是自动改名，断言文案时不要写死序号。

### 制作台

- **抵达**：`/projects/:projectId`、`/projects/:projectId/e/:episodeId`（指定集）；从项目列表点进。同页由查询参数切视图：`?tab=board|script|final`、`?view=production|cast|inbox|settings`、`?shot=<镜头 ID>`、`?cast=<角色 ID>`，非法值分别回落到 `board` 与 `production`。
- **锚点**：`web/src/pages/projects/detail.tsx`（`DramaStudioPage`）、`web/src/pages/projects/studio/`（集轨道、集原文导入、创建流程、队列条、角色与设置面板、任务详情、studio 数据 hook）、`web/src/pages/projects/drama-shared.tsx`、`web/src/pages/projects/drama-model-picker.tsx`；API `web/src/services/api/drama.ts`；后端 `backend/internal/handler/drama_routes.go`、`backend/internal/app/drama_orchestrator.go`、`backend/internal/app/drama_segment_video.go`、`backend/internal/production/`。
- **验收**：`cd backend && go test ./internal/app -run Drama`、`cd backend && go test ./internal/production`；`cd web && bun test src/lib/drama/novel-parse.test.ts src/lib/drama/drama-styles.test.ts`。
- **陷阱**：`/projects/:projectId/*` 是兜底重定向回上一级，旧深链 /projects/:id/workflow/:unitId/:stage 与 /projects/:id/chapters/:chapterId 已随工作流视图下线，被重定向不是页面故障。路由里的集 ID 不属于当前项目时页面回落到默认集（优先等待审阅、其次未完成），深链断言前先确认集列表。

### 剧本、分镜与成片

- **抵达**：制作台内 `?tab=script`（剧本）、`?tab=board`（分镜）、`?tab=final`（成片）；镜头编辑带 `?shot=<镜头 ID>`，剧情段弹窗由 studio 的剧情段弹窗组件打开。
- **锚点**：`web/src/pages/projects/studio/script-view.tsx`、`web/src/pages/projects/studio/storyboard.tsx`、`web/src/pages/projects/studio/segment-dialog.tsx`、`web/src/pages/projects/studio/segment-parts.tsx`、`web/src/pages/projects/studio/final-view.tsx`；后端 `backend/internal/app/drama_service.go`、`backend/internal/app/drama_storyboard_test.go`、`backend/internal/production/storyboard.go`、`backend/internal/production/segment_prompt.go`。
- **验收**：`cd backend && go test ./internal/app -run 'Drama|Storyboard'`；`cd web && bun test src/lib/drama/storyboard.test.ts src/lib/drama/asset-prompt.test.ts`。
- **陷阱**：参考图与段提示词是版本耦合的——改设定文字或镜头会让已写好的提示词与段视频标记过期，只重做参考图则提示词保持有效。断言「提示词过期」前先确认改的是镜头还是仅换参考图。

### 短剧精修画布

- **抵达**：制作台剧情段弹窗「在画布中精修」进入 `/canvas/:id`，查询参数 `drama` 指定作品，`dramaFocus` 指定投送或定位对象；关联短剧的画布左侧显示短剧侧栏。
- **锚点**：`web/src/services/drama-canvas.ts`（画布解析与跳转）、`web/src/lib/canvas/drama-canvas-projection.ts`（投送节点）、`web/src/components/canvas/canvas-drama-sidebar.tsx`、`web/src/components/canvas/canvas-drama-adopt-modal.tsx`；后端 `backend/internal/app/drama_canvas.go`。
- **验收**：`cd backend && go test ./internal/app -run Drama`；投送后在画布节点上「采用到短剧」，成功后制作台显示新的参考图或剧情段视频版本。
- **陷阱**：投送到画布不等于采用；采用只接受服务端资源，正在生成或仅有外部链接的节点不能采用。

## 4. 资源与工具

### 生图工作台

- **抵达**：`/toolbox/image`；侧栏「图片生成」；`imageWorkbenchEnabled` 默认关闭。
- **锚点**：`web/src/pages/workbench/image-workbench-page.tsx`、`web/src/pages/workbench/workbench-catalog.ts`（分类与预设）；API `web/src/services/api/workbench.ts`；后端 `backend/internal/handler/workbench.go`（`RegisterWorkbenchRoutes`）。
- **验收**：`cd web && bun test test/workbench-features.test.ts test/workbench-tools.test.ts`。
- **陷阱**：分类、预设、示例素材由管理员在 `/admin/workbench-tools` 维护。开关开着但后台没配工具时，页面只有骨架，不是渲染失败。

### 视频工作台

- **抵达**：`/toolbox/video`；`videoWorkbenchEnabled` 默认关闭。
- **锚点**：`web/src/pages/workbench/video-workbench-page.tsx`、`video-workbench-page` 同目录的 `web/src/pages/workbench/workbench-input.ts`；后端同上。
- **验收**：`cd web && bun test test/workbench-video-operation.test.ts test/workbench-features.test.ts`。
- **陷阱**：同生图工作台；视频参数能力由所选模型渠道决定，前端只是不做越界提交。

### 创作历史（任务中心）

- **抵达**：`/tasks`，页头「创作历史」；侧栏「创作历史」；`taskCenterEnabled` 控制。
- **锚点**：`web/src/pages/tasks/index.tsx`；API `web/src/services/api/task-center.ts`、`web/src/services/api/task-text-stream.ts`；后端 `backend/internal/handler/routes.go`（`RegisterTaskRoutes`）。
- **验收**：`cd web && bun test test/task-text-stream.test.ts test/task-media-fallback.test.ts`；文本任务 SSE 是 `GET /api/tasks/:id/text-events`。
- **陷阱**：断线续传游标是递增的事件 `id`（`?after=<id>` 或 `Last-Event-ID`），**不是任务 ID**。把任务 ID 当游标会重放全量事件。

### 素材

- **抵达**：`/assets`，页头「素材库」，右上可切「回收站」；侧栏「资产」。
- **锚点**：`web/src/pages/assets/index.tsx`；状态 `web/src/stores/use-asset-store.ts`；API `web/src/services/api/resources.ts`；后端 `backend/internal/handler/resource_delivery.go`、`backend/internal/handler/resource_upload_session.go`、`backend/internal/handler/project_asset_routes.go`、`backend/internal/canvas/user_asset_document.go`（SPA 合同校验）。
- **验收**：`cd web && bun test test/asset-ingest.test.ts test/asset-batch-delete.test.ts test/assets-collection-layout.test.ts`。
- **陷阱**：删除先查项目、画布、任务引用；有引用会保留并返回来源，物理删除失败不得删记录。断言「删掉了」之前先确认没有引用。

### 技能库

- **抵达**：`/skills`，页头「技能库」；侧栏「技能」。单个技能的包编辑器与文件树走 `/skills/:skillId/edit`；工具栏「按行业推荐」打开推荐安装弹窗。
- **锚点**：`web/src/pages/skills/index.tsx`、技能工作台 `web/src/pages/skills/workbench`、`web/src/components/skills/skill-recommendations-modal.tsx`；API `web/src/services/api/skills.ts`、`web/src/services/skill-runtime.ts`；后端 `backend/internal/handler/skills.go`（`RegisterSkillRoutes`）、`backend/internal/skills/`。
- **验收**：`cd web && bun test test/skills-api.test.ts test/skill-runtime.test.ts test/skill-defaults.test.ts`；平台分类策展在 `/admin/skill-curation`。
- **陷阱**：技能分「已安装」和「可安装」，运行时要先选 runtime（`web/src/components/skills/skill-runtime-picker.tsx`）。

### 插件中心

- **抵达**：`/plugins`，页头「插件中心」；侧栏「插件」；`pluginCenterEnabled` 控制。
- **锚点**：`web/src/pages/plugins/index.tsx`；API `web/src/services/api/plugins.ts`、`web/src/services/api/plugin-catalog.ts`；后端 `backend/internal/handler/plugin.go`（`RegisterPluginRoutes`）；插件包在 `plugin-packages/`。
- **验收**：`cd web && bun test test/plugin-upload-merge.test.ts test/plugin-state-switch.test.ts test/plugin-permission-check.test.ts`。
- **陷阱**：`systemPluginsVisibleToUsers` 只控制用户端可见性，系统插件仍在运行；用户端列表为空不等于插件没装。

### Eagle 素材库

- **抵达**：`/plugins/eagle`；从插件中心进入；`pluginCenterEnabled` 控制。
- **锚点**：`web/src/pages/plugins/eagle.tsx`；`web/src/lib/plugins/builtin/eagle.ts`（内置插件定义与默认 Base URL）；API `web/src/services/api/eagle.ts`。
- **验收**：`cd web && bun test test/plugin-state-switch.test.ts`；本机需先起 Eagle 才能读到真实素材。
- **陷阱**：依赖本机 Eagle 服务，未启动时看到的是连接失败态而不是空库。

## 5. 账号与设置

### 设置

- **抵达**：`/settings`；用户卡片「账户与设置」或 ⌘K「设置」。支持 `?section=` 深链（`web/src/pages/settings/index.tsx` 的 `configSections`），取值 `profile`、`channels`、`runninghub`、`models`、`preferences`、`prompts`、`agent-memory`、`storage`、`diagnostics`；非法值回落到 `profile`。
- **锚点**：`web/src/pages/settings/index.tsx` 分发分区；`web/src/pages/settings/profile-pane.tsx` + `web/src/pages/settings/profile-validation.ts`（头像、密码、邮箱）；`web/src/pages/settings/agent-memory-pane.tsx` + `web/src/services/api/agent-memory.ts`（记忆文件、修改历史与撤销）；`web/src/services/api/profile.ts`；后端 `backend/internal/handler/auth_profile.go`、`backend/internal/handler/custom_proxy.go`（自定义渠道中转）、`backend/internal/handler/agent_memory_document.go`。
- **验收**：`cd web && bun test test/password-reset.test.ts`、`cd backend && go test ./internal/app -run Memory`；改密码和换邮箱成功后退出所有会话；`?section=agent-memory` 显示长期记忆文件与历史，Agent 修改可按记录模式审核或撤销。
- **陷阱**：侧栏没有设置入口。`customChannelsEnabled` 关闭只隐藏「个人渠道」，`?section=channels` 回落到 `models`；RunningHub 入口要求 `runtimeStatuses[RUNNINGHUB_PLUGIN_ID] === "enabled"`，与个人渠道开关独立，插件未启用时 `?section=runninghub` 回落到 `profile`。

### 钱包（全局浮层，不是页面）

- **抵达**：⌘K「钱包」、用户卡片余额按钮、顶栏积分胶囊，都调 `web/src/lib/workspace-wallet.ts` 的 `openWorkspaceWallet()`；`creditsEnabled` 控制。
- **锚点**：`web/src/components/layout/workspace-wallet-modal.tsx`、`web/src/components/layout/workspace-account-card.tsx`、`web/src/components/layout/workspace-top-bar.tsx`；API `web/src/services/api/wallet.ts`。
- **验收**：`cd web && bun test test/workspace-route-loading.test.ts test/assets-collection-layout.test.ts` 覆盖钱包入口接线与历史分页布局；真实页面还需检查打开浮层及支付回跳。
- **陷阱**：`/wallet` 的路由 element 虽为 `null`，但全局 `WorkspaceWalletHost` 会读取支付回跳参数、触发钱包浮层并重定向到 `/`。登录且 `creditsEnabled` 开启时应看到首页上的钱包浮层；关闭时仍重定向，但不打开浮层。空白页不是正常验收结果。

### 推广中心

- **抵达**：`/referral`；用户卡片菜单「推广中心」，仅 `referralAvailable` 为真时渲染。邀请码入口是 `/register?ref=<code>`。
- **锚点**：`web/src/pages/referral/index.tsx`、`web/src/pages/referral/referral-page.css`、`web/src/components/layout/workspace-account-card.tsx`；API `web/src/services/api/referral.ts`；后端 `backend/internal/handler/referral.go`（`RegisterReferralRoutes`）、`backend/internal/app/referral.go`。
- **验收**：`cd backend && go test ./internal/app -run Referral`。
- **陷阱**：入口和页面都由 /auth/session 的 `referralAvailable` 决定——关闭推广或非推广人直达 `/referral` 会被带回首页，接口同样返回 403。看不到菜单时先查系统设置 `referral` 与 `users.is_promoter`，不是路由缺失。

## 6. 后台管理

### 入口与权限

- **抵达**：`/admin`；用户卡片「管理员后台」，仅 `user.role === "admin"` 渲染该链接。
- **锚点**：`web/src/pages/admin/index.tsx`（非 admin 渲染 `[data-admin-root]` 未授权卡片）、`web/src/pages/admin/admin-context.tsx`、`web/src/pages/admin/components/admin-shell.tsx`；后端路由注册在 `backend/internal/handler/auth.go` 的 `RegisterAdminRoutes`，域实现在 `backend/internal/app/admin_*.go`。
- **验收**：`cd web && bun test test/admin-ui-regressions.test.ts`。
- **陷阱**：非管理员直达 `/admin` 是 HTTP 200 + 前端未授权卡片，权限判定在用户投影里。用「页面能打开」证明有权限是错的，要看接口是否 403。

### 子页面

| 功能 | 路由 | 页面锚点 |
| --- | --- | --- |
| 数据看板 | `/admin` | `web/src/pages/admin/admin-route-pages.tsx`（`AnalyticsPage`） |
| 用户 | `/admin/users` | `web/src/pages/admin/users/users-page.tsx` |
| 用户分组 | `/admin/user-groups` | `web/src/pages/admin/user-groups/user-groups-page.tsx`；API `web/src/services/api/user-groups.ts`；后端 `backend/internal/app/user_groups.go`；验收 `cd backend && go test ./internal/app -run UserGroup` |
| 用户登录日志 | `/admin/login-logs` | `web/src/pages/admin/login-logs/login-logs-page.tsx` |
| 用户反馈 | `/admin/feedbacks` | `web/src/pages/admin/feedbacks/feedbacks-page.tsx` |
| 推广管理 | `/admin/referral` | `web/src/pages/admin/referral/referral-admin-page.tsx` |
| 渠道 | `/admin/channels` | `web/src/pages/admin/channels/channels-page.tsx` |
| 前台模型 | `/admin/models` | `web/src/pages/admin/logical-models/logical-models-page.tsx`（`frontendModelsEnabled`） |
| 插件 | `/admin/plugins` | `web/src/pages/admin/plugins/plugins-page.tsx` |
| 工作台工具 | `/admin/workbench-tools` | `web/src/pages/admin/workbench-tools/workbench-tools-page.tsx` |
| 技能策展 | `/admin/skill-curation` | `web/src/pages/admin/skill-curation-page.tsx` |
| 支付 | `/admin/payments` | `web/src/pages/admin/payments/payments-page.tsx` |
| 提示词模板 | `/admin/prompt-templates` | `web/src/pages/admin/storyboard-prompts/storyboard-prompts-page.tsx` |
| 公告 | `/admin/announcements` | `web/src/pages/admin/admin-route-pages.tsx`（`AnnouncementsPage`） |
| 横幅公告 | `/admin/banner-announcements` | `web/src/pages/admin/admin-route-pages.tsx`（`BannerAnnouncementsPage`） |
| Agent 记忆 | `/admin/agent-lessons` | `web/src/pages/admin/admin-route-pages.tsx`（`AgentLessonsPage`）→ `web/src/pages/admin/components/agent-memory-documents-panel.tsx`（默认只读记忆文件）、`web/src/pages/admin/components/agent-lessons-panel.tsx`（旧版经验） |
| 存储资源 | `/admin/resources` | `web/src/pages/admin/admin-route-pages.tsx`（`StorageResourcesPage`） |
| 积分运营 | `/admin/credit-operations` | `web/src/pages/admin/admin-route-pages.tsx`（`CreditOperationsPage`） |
| 兑换码 | `/admin/redemption-codes` | `web/src/pages/admin/redemption-codes/redemption-codes-page.tsx` |
| 请求日志 | `/admin/logs` | `web/src/pages/admin/logs/logs-page.tsx` |
| 外观 | `/admin/settings/appearance` | `web/src/pages/admin/settings/appearance-settings-page.tsx` |
| 绘图引擎 | `/admin/settings/drawing-engine` | `web/src/pages/admin/settings/drawing-engine-settings-page.tsx` |
| 运行时策略 | `/admin/settings/runtime-policy` | `web/src/pages/admin/settings/runtime-policy-settings-page.tsx` |
| 功能开放 | `/admin/settings/features` | `web/src/pages/admin/admin-route-pages.tsx`（`FeatureAvailabilityPage`）→ `web/src/pages/admin/components/feature-availability-panel.tsx` |
| 访问控制 | `/admin/settings/access` | `web/src/pages/admin/admin-route-pages.tsx`（`AccessSettingsPage`） |
| 邮件 | `/admin/settings/email` | `web/src/pages/admin/admin-route-pages.tsx`（`EmailSettingsPage`） |
| 存储设置 | `/admin/settings/storage` | `web/src/pages/admin/settings/storage-settings-page.tsx` |
| Ark 私有素材 | `/admin/settings/ark-private-assets` | `web/src/pages/admin/settings/ark-private-assets-settings-page.tsx` |
| 响应拦截 | `/admin/settings/response-interception` | `web/src/pages/admin/settings/response-interception-settings-page.tsx` |
| 第三方 | `/admin/settings/third-party` | `web/src/pages/admin/settings/libtv-settings-page.tsx` |
| 系统更新 | `/admin/settings/system-update` | `web/src/pages/admin/settings/system-update-page.tsx` |
| 系统性能 | `/admin/settings/system-performance` | `web/src/pages/admin/settings/system-performance-page.tsx` |

跳转别名（改动菜单时容易误判为缺页）：`/admin/settings` → `runtime-policy`、`/admin/settings/concurrency` → `runtime-policy`、`/admin/settings/libtv` → `third-party`、`/admin/storyboard-prompts` → `prompt-templates`。

## 7. 公开面（未登录可达）

### 登录、注册、找回密码

- **抵达**：`/login`、`/register`、`/forgot-password`，共用 `web/src/pages/auth/auth-scene.tsx` 外壳。
- **锚点**：`web/src/pages/auth/login.tsx`、`web/src/pages/auth/register.tsx`、`web/src/pages/auth/forgot-password.tsx`；API `web/src/services/api/auth.ts`；后端 `backend/internal/auth/`。
- **验收**：`cd web && bun test test/auth-registration-agreement.test.ts test/password-reset.test.ts test/login-log-device.test.ts`。
- **陷阱**：公开注册默认关闭，注册页会给出提示而不是报错；断言「能注册」前先看后端配置。

### 画布分享

- **抵达**：`/share/canvas/:token`，公开可访问，不走登录壳。
- **锚点**：`web/src/pages/canvas/shared.tsx`；API `web/src/services/api/canvas-share.ts`；后端 `backend/internal/handler/canvas_share.go`。
- **验收**：`cd web && bun test test/canvas-document.test.ts`；公开读取接口是 `/api/public/canvas-shares/:token`，无效或失效分享返回 404；资源读取同样受分享范围约束。
- **陷阱**：分享页只读，不要用编辑器选择器（`[data-canvas-editor]`）判断它是否正常。

### 欢迎页

- **抵达**：`/welcome`。**不在 `web/src/router.tsx` 里**：`web/src/main.tsx` 用 `/^\/welcome\/?$/` 把请求分流到独立 root，`web/src/welcome-application.tsx` 自己取 flag 后渲染。
- **锚点**：`web/src/pages/welcome/index.tsx`、`web/src/welcome-application.tsx`、`web/src/services/api/welcome.ts`；后端接口 `GET /api/public/welcome` 在 `backend/internal/handler/feature_availability.go`。
- **验收**：`backend/internal/handler/welcome_routes_test.go` 覆盖开关投影；改页面本身只走真实浏览器访问 `/welcome`，没有前端单测。
- **陷阱**：改路由配置不会影响欢迎页；`welcomeEnabled` 为 false 时它 `location.replace("/")`，看到跳到首页是设计行为。

## 8. DEV 专用与测试页

| 路由 | 用途 | 锚点 | 陷阱 |
| --- | --- | --- | --- |
| `/dev/folders` | 文件夹交互实验室 | `web/src/router.tsx` 的 `devRoutes()`、`web/src/pages/dev/folder-preview-lab.tsx` | 只在 `import.meta.env.DEV` 下注册，生产构建不存在 |
| `/dev/previs-repro` | 分镜复现台，E2E 驱动对象 | `web/src/pages/dev/previs-repro-lab.tsx`、`web/scripts/previs-p0-chrome-e2e.mjs` | 生产构建会被摇树删掉，靠 lazy import 写在函数体内 |
| `/test-voice-recording` | 语音录制与 STT 转写测试页 | `web/src/pages/test-voice-recording.tsx`、`web/src/components/conversation/voice-recording-button.tsx` | 需要麦克风权限，无权限时按钮静默不可用 |

E2E 命令：`cd web && bun run test:previs:e2e`（脚本自起 Vite 与 headless Chrome，走 CDP，无新增依赖）。

## 9. 无路由界面

这些能力没有独立页面，别去 `web/src/router.tsx` 里找：

- 钱包浮层 —— 见 §5。
- 画布内云端 Agent、导演台、批量表、AI 拆图 —— 见 §2「自由画布编辑器」。
- 全局更换头像弹窗、更新公告弹窗、模型选择器 —— 分别在 `web/src/components/image-crop-dialog.tsx`、`web/src/components/layout/app-changelog-modal.tsx`、`web/src/components/model-picker.tsx`。
- 灵感库编辑与详情 —— `web/src/pages/inspirations/`，从创作页隧道与设置进入。
