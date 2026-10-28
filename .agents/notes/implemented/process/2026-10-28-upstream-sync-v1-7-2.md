# Agent Note: 上游 v1.7.2 同步，冲突按「二开策略优先、上游产品内容保留」结算

Status: implemented

## Problem

`work` 停在 `4cbb1134`（对应上游 v1.6.9 附近），上游 76 个提交（到 `d77e977a`，v1.7.2）改动 711 个文件，与 work 侧 55 个提交在 24 个文件重叠。其中 6 个冲突不是文本重叠，而是两条既有决定的正面相遇：根 README 是否承载赞助与致谢、`docs/index.md` 是否逐篇列举上游设计文档、欢迎页是否还有贡献者卡片、旧工作流视图的测试是否还有存在意义。

另外两项不是冲突却必须收尾：上游不跑 `bun run typecheck:test`，它带来的新测试与改过的类型在 work 的整目录门禁下报 14 处错误；`FEATURE_MAP.md` 记录的短剧路由已被上游换成制作台，7 条新路由未登记、13 个锚点消失。

## Decision

1. **README 取「上游产品内容 + work 内容边界」**：保留世界引擎预告、产品一览与截图，删掉 `## 赞助商`、`### 3D 预演台赞助用户`、`## 贡献者与团队` 与演示账号密码行，演示站恢复为纯链接。边界依据是 [根 README 只留开发内容](../simplification/2026-10-15-sponsors-contributors-removal.md)。
2. **`docs/index.md` 取 work 侧**：只列参考类文档，上游遗产按目录描述而不逐篇链接；上游新增的 `docs/design/ui-skin-library.mdx` 属只读遗产，不进索引，遗产篇数从 20 改为 21。
3. **`pending-test.mdx` 两侧新增章节都保留**（work 侧「功能地图与漂移校验」在前），并补回上游漏掉的空行。
4. **`welcome.css` 三个冲突取 work 侧**：贡献者样式与 `.welcome-ending h2` 的 `margin-bottom` 都不再需要——合并后的 `web/src/pages/welcome/index.tsx` 已无贡献者卡片，上游那段 CSS 是死规则。
5. **三个旧工作流测试接受上游删除**（`web/test/project-chapter-storyboard.test.ts`、`web/test/workflow-shot-generation.test.ts`、`web/test/workflow-shot-references.test.ts`）：它们 import 的 `web/src/pages/projects/detail/` 整个目录随短剧流水线重构下线，work 侧对它们的改动只是类型修复，没有需要保留的断言。
6. **测试类型门禁按漂移修复**，8 个文件 14 处，不新增 `any`、不跳过断言：`syncPending` 新字段、`ApprovalCard` 去掉不存在的 `blocked`、happy-dom 事件按既有约定 `as unknown as Event`、`modelCosts` 去掉不存在的 `channelModelId`、`AccountFileStorageUsage` 补齐 `baseBytes`/`purchasedBytes`/`overLimit`/`readOnly`、`MODEL_LOGO_FEATURED` 条目按 `ModelLogoCategory` 收窄。
7. **`FEATURE_MAP.md` 按新实现重写 §3**：登记 `/projects/new`、`/projects/:projectId`、`/projects/:projectId/e/:episodeId` 与制作台/剧本分镜锚点；补登记 `/skills/:skillId/edit`、`/referral`、`/admin/feedbacks`、`/admin/referral`；删掉 `/projects/:projectId/:view`、`/projects/:projectId/workflow/:unitId/:stage`、`/projects/:projectId/chapters/:chapterId` 与已删文件的锚点。

## Alternatives considered

- **README 直接取上游整版**：一次解决冲突，且与上游完全一致，后续同步不用重复裁剪。否决理由：会把这次刚删掉的赞助商表格、贡献者联系方式与共享演示密码重新引入，与 [根 README 只留开发内容](../simplification/2026-10-15-sponsors-contributors-removal.md) 相反；内容边界决定不该因为上游改版而失效。
- **README 直接取 work 整版**：不需要逐节裁剪，也不会夹带上游营销内容。否决理由：`assets/screenshots/` 会变成 16 个零引用文件，README 也丢掉上游对短剧流水线与世界引擎的真实描述——那部分属于「项目定位与能力概览」，是 README 允许的内容。
- **`docs/index.md` 取上游版**：索引更全，能直达 `docs/design/*` 与 ADR。否决理由：work 的索引是 [文档治理](../process/2026-10-15-documentation-governance.md) 的落地结果，上游遗产只读、不逐篇链接；重新列举等于撤销该决定。
- **保留三个旧工作流测试并改造成测制作台**：能保住原有断言（章节资产、镜头参考图解析）。否决理由：它们测的是已删除模块的行为，改成测制作台等于新写用例；制作台的行为面已由 `backend/internal/app/drama_*_test.go`、`backend/internal/production/` 与 `web/src/lib/drama/*.test.ts` 覆盖。
- **`FEATURE_MAP.md` 只删不补**：删掉失效行即可通过校验，改动面最小。否决理由：地图的用途是「从模糊报障找到入口」，短剧制作台正是最需要它的功能；只删会让新入口继续缺登记，漂移门禁下次照样报。

## Consequences

- 收益：`work` 与上游 v1.7.2 对齐，短剧流水线、推广中心、用户反馈、UI 规范与画布能力进入主线；同时保住了 README 内容边界、参考文档索引与欢迎页无贡献者卡片的取舍。
- 代价：README 的裁剪每次同步都要重做一遍（上游仍在自己 README 维护赞助商与贡献者表格）；`assets/screenshots/` 随上游进入仓库，只服务 GitHub 展示，不参与镜像构建（`Dockerfile` 已不拷贝 `assets/`）。
- 已知上限：上游 `docs/content/docs/overview/features.mdx` 的「时间线剪辑」相关实现仍指向已删除的 `web/src/pages/projects/detail/editor.tsx` 与 `web/src/pages/projects/detail/overview.tsx`（上游自身漂移）。本次不动：时间线编辑器现在只以插件外壳存在（`web/src/lib/plugins/builtin/editor/editor-shell.tsx`），是否恢复独立入口是产品决定，不是同步的附带动作。
- 门禁观察：上游不跑 `typecheck:test`，每次同步都会带进测试类型错误；本次 14 处属可机械修复的漂移，没有放宽门禁。

## Verification

- `cd web && bun run typecheck && bun run typecheck:test && bun run lint && bun run build` 通过。
- `cd web && bun test`：2868 项通过（399 个文件），含 `web/test/feature-map-verifier.test.ts` 与真实地图校验。
- `cd backend && go build ./... && go test ./...` 通过。
- `bun run .agents/skills/feature-map/scripts/verify-feature-map.ts`：62 条路由、6 个开关、205 个锚点全部通过。
- 决策笔记三线校验与 `python3 .github/scripts/check-env-docs.py` 通过。
- 未做：浏览器验收（合并面过大，按功能另开专项）、Windows 与容器构建、真实模型上游调用。
