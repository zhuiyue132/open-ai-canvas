# Agent Note: 上游 v1.7.3.3 同步，冲突按文件类别结算并把插件产物改为重新打包

Status: implemented

## Problem

`work` 停在 `e45a62d4`（对应上游 v1.7.3），远端 `origin/main` 与 `upstream/main` 同为 `82fc5c03`，中间 37 个提交、267 个文件，包含电商出品页改版、短剧步骤模型与表演运镜、短剧计费、素材包导入导出、媒体探测与尺寸修复、时间线导出、管理后台分组侧栏与调积分、以及新的推送前验证脚本。`work` 侧 63 个提交同期改到 25 个相同文件。

三方合并有 12 个冲突文件，分属四类决定正面相遇：根 README 是否重载赞助商与贡献者、插件包品牌与上游协议修复、管理后台侧栏规范的两级分组描述、`pending-test` 两侧新增章节。合并后的门禁另暴露 1 处测试类型漂移（上游新增用例），以及 `scripts/verify-before-push.mjs` 要求把 rebase 写进纪律——与 `work` 只允许快进推送的 ruleset 直接冲突。

## Decision

1. **本地 main 只快进，work 只 merge**：`main` 快进到 `82fc5c03` 并推送镜像；`work` 以 `e45a62d4` 为父提交完成合并，不 rebase、不改写历史。同步前确认 `Publish container images` 仍为 `disabled_manually`；合并与门禁通过后快进推送 `work`，并补齐上游 `v1.7.3*` tag（fork 发布流水线只认日期 tag，不会被上游 tag 触发），不新建二开 tag。
2. **README 取「上游产品内容 + work 内容边界与部署段」**：删除上游重新加入的 `## 赞助商`、`## 贡献者与团队`、`## 3D 预演台赞助用户`与演示账号密码，保留 `## 服务器部署`；上游在 README 重构里删掉的两句部署指针（「部署服务器并使用后台在线更新，请使用下文的官方 Release 镜像部署」「不安装 Host Updater」）按 `work` 部署段策略补回。依据仍是 [根 README 只留开发内容](../simplification/2026-10-15-sponsors-contributors-removal.md)。
3. **插件包从「原位改字节」改为「源码重放 + 重新打包」**：上游 v1.7.3.3 用 `plugin-packages/package-directories.mjs` 统一了发行来源，内嵌器与打包脚本改为按包 ID 工作并已幂等。因此三个冲突包（`dashscope-wan3-video`、`minimax-hailuo-video-v2`、`newapi-video-generations-v1`）不再对已提交 `.yingce-plugin` 做等长字节替换，而是：源码取上游 → `影策` 重放为 `意绘` → `node plugin-packages/embed-documentation.mjs <包 ID>` 重建 `documentation` 与内嵌合同 → 按目录 `zip -X` 重新打包 → 逐条目与源码比对。协议修复（Wan 3.0 `$upper` 分辨率、MiniMax 首尾帧混用参考图按请求比例、NewAPI `response.data[]` 视频映射）全部保留，产物作者文案与其余 95 个包一致。规则表同步更新，见 `docs/AGENT_LOCAL_DEVELOPMENT.md` 第 3 节。
4. **管理后台设计规范取上游、品牌取 work**：`docs/design/admin-ui-design-standard.md` 采用上游的两级可折叠分组侧栏、页面空闲预取与「独立入口不合并页签」描述（实现对上游 `admin-shell.tsx` 一致），只把品牌名与品牌信息块文案保留为「意绘」。
5. **CI 取 work 策略、吸收上游分片**：`.github/workflows/quality.yml` 保留 `work` 推送触发、并发分组、`golangci-lint v2.15.0`（v2.5.0 遇 Go 1.26 包会 panic）、环境变量文档检查与依赖用例检查；吸收上游的 `internal/app` 四片 + `rest` 五片并行与 `Backend checks` 汇总作业，并把环境变量检查限定在 `rest` 分片，避免在 5 个 Runner 上重复执行。
6. **AGENTS.md 取 work 侧并重写上游新增纪律**：`## 8. 验证纪律` 保留 work 的 CI 口径说明，吸收上游「推送前验证（必须）」小节，但把「rebase 到最新远端」改成 `git merge origin/work`（`work` 受 ruleset 保护，rebase 会被拒绝），并注明 `bun scripts/verify-before-push.mjs` 不覆盖 `typecheck:test`、决策笔记三线校验与 `verify-feature-map`。
7. **`pending-test.mdx` 两侧都保留**：work 的「功能地图与漂移校验」在前，上游新增的「生成结果持久化」「画布同步幂等收敛」等章节照原文保留，末尾另加本次同步的复核清单。
8. **品牌重放覆盖上游新字符串**：时间线导出的 MP4 元数据 `comment` 是上游本批新增的用户可见文案（`影策时间线合成`），按品牌策略改为「意绘时间线合成」；`yingce` 标识符层与第三方厂商自己的品牌名（如「沧元算力 / 影绘」）不动。
9. **测试类型只补真实合同**：上游新增的 `web/test/canvas-reference-image-size.test.ts` 用 `expect(values).toContain(selection?.size)` 把 `string | undefined` 传进 `toContain`。补 `expect(selection?.size).toBeDefined()` 后取 `selection!.size`，不新增 `any`、不删断言、不放宽整目录门禁。

### 既有笔记审计

[冲突结算规范](./2026-10-28-upstream-conflict-resolution-policy.md) 仍是规则真相源，本次只更新插件产物一类的做法并互链，不翻转结论。[品牌改名](../feature/2026-10-28-brand-name-yihui.md) 的品牌边界不变，只补充上游新字符串的覆盖。[v1.7.2](./2026-10-28-upstream-sync-v1-7-2.md)、[v1.7.3](./2026-10-29-upstream-sync-v1-7-3.md) 是不同批次证据，保留。检索范围没有待处理的 proposed / rejected 提案。

## Alternatives considered

- **插件包整包取上游（含 `影策` 作者）**：最少工作量，产物与上游字节一致。否决理由：会回退既有品牌决定，插件中心会同时出现两种作者文案，品牌策略在同步里被悄悄撤销。
- **继续对已提交 `.yingce-plugin` 做等长字节替换**：保持产物字节稳定，与上次同步一致。否决理由：本批协议修复改了 `response.videos` 映射与 `ratio` 条件表达式，替换后包内文档与源码容易分裂；上游已把打包来源统一且内嵌器幂等，重新打包比在原包里做字节手术更可核对，代价只是产物二进制重写。
- **`quality.yml` 整份取上游**：最省事，跟随上游并行化。否决理由：会同时丢掉 `work` 的推送触发、lint 版本与依赖用例检查——等于把二开 CI 门槛降级。
- **AGENTS.md 整份取上游**：能直接吸收「推送前验证」。否决理由：上游把「rebase 到最新远端」写成必须步骤，照抄会让 `work` 第一次推送就撞 ruleset；二开约定必须保留自己的分支模型。
- **`docs/design/admin-ui-design-standard.md` 取 work 整行**：品牌最稳。否决理由：上游这一行同时是后台侧栏改版的规范（两级分组、预取、独立入口），取 work 旧行会让规范与合并后的 `admin-shell.tsx` 相反。

## Consequences

- 收益：电商出品页、短剧步骤模型与计费、素材包导入导出、媒体尺寸修复、时间线导出、后台分组侧栏与调积分进入 `work`；品牌、README 内容边界、部署身份与 CI 门槛全部保留；插件产物的生成方式与上游统一，后续同步只需重跑内嵌器与打包脚本。
- 代价：插件产物二进制每次同步都会重写（zip 记录 mtime），无法再用「字节不变」判断产物是否被误改，只能靠逐条目比对与 `internal/protocol` 的包内一致性用例；README 的赞助与贡献者裁剪、CI 分片里的环境变量检查位置仍需每次同步手工确认；`bun scripts/verify-before-push.mjs` 在 `work` 上必须带 `--base origin/work`，否则基准是 `origin/main`，会把只差品牌文案的旧文件（如 `web/src/styles/globals-5.css`，上游自带的未格式化 legacy CSS）当成改动。
- 已知上限：`bun scripts/verify-before-push.mjs` 本次没有实跑（用逐项门禁替代），首次推送 `work` 前要补跑并核对 CI；真实模型出片、收费上游调用、插件安装升级与服务器部署均未验证。

## Verification

- `cd web && bun run typecheck && bun run typecheck:test && bun run lint && bun run build` 通过。
- `cd web && bun test`：2934 项通过、0 失败，407 个文件。
- `cd backend && go test ./...` 全部包通过（`internal/app` 约 197 秒）；临时 PostgreSQL 容器（`127.0.0.1:55432`）与本地 `redis-server` 下，`.github/scripts/check-dependency-tests.py` 确认 5 项依赖用例全部执行并通过。
- 三个改动的 `.yingce-plugin` 用 Python 逐条目与源码目录比对一致（各 3 个条目），`manifest.documentation` 与 `README.md + docs/interface.md` 拼接结果相等，`internal/protocol` 包用例解析通过。
- `gofmt -l backend` 无输出；`python3 .github/scripts/check-env-docs.py` 通过（22 个 `CANVAS_*`）；`verify-feature-map.ts` 通过（63 条路由、5 个开关、218 个锚点）；决策笔记三线校验通过。
- `bun scripts/verify-before-push.mjs --base origin/work`：12 项检查全部通过（含预演台 Chrome E2E），用时约 124 秒；脚本不覆盖的支付插件双架构与 `golangci-lint` 留给 CI，依赖 PostgreSQL/Redis 的 5 项已用 `check-dependency-tests.py` 单独确认执行并通过。
- 顺带修复上游遗留的测试超时：`web/test/cloud-agent-panel-sync.test.ts` 用 `Bun.spawnSync` 拉起 30 秒预算的子进程，但用例本身用 Bun 默认 5 秒超时，脚本并行跑时实测 4.6–5.0 秒、会随机失败；补 `60000` 毫秒用例超时，不断言内容不变。
- 未做：浏览器验收、真实模型与收费上游调用、镜像构建、服务器部署。未启用 dev server。
