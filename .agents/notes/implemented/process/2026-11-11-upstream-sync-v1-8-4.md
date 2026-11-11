# Agent Note: main v1.8.4.1 合入 work，按文件类别结算 51 个冲突并补齐门禁

Status: implemented

## Problem

`work` 基线为 `7d779e1b`（上次同步合入 v1.8.1），本批 `origin/main` 与 `upstream/main` 同为 `a4baa80a`（`VERSION` = `v1.8.4.1`）：96 个尚未进入 work 的上游提交，三方合并结果相对 work 基线改动 1160 个文件（+90169 / −22474）。

冲突集中在三类边界上：

1. **上游删除了 work 侧仍在改的文件**。上游移除站内剪辑模块，删除 `web/src/lib/plugins/builtin/editor/`、`web/src/lib/timeline/` 的大部分文件；work 在这些文件里只有品牌替换与类型修正。
2. **品牌与插件产物**。上游把 10 个协议插件升到新版本并重写内嵌文档与产物，作者文案仍是旧的中文品牌名；另有 2 个上游新增插件包同样带旧品牌名。
3. **测试与夹具的严格类型门禁**。上游测试不进生产 `tsc`，合并带进 121 个测试类型错误；本地 `tsconfig.test.json` 开了 `incremental`，`tsbuildinfo` 陈旧时还会误报更多。

同步前的固定检查照旧执行：`main` 仍是上游纯镜像（`merge-base --is-ancestor origin/main upstream/main`），上游 `Publish container images` 仍为 `disabled_manually`，本地 `work` 与 `origin/work` 一致。

## Decision

1. **同步只走 merge**：`work` 合并 `upstream/main`，不 rebase、不强推、不额外发 tag；冲突按 [冲突结算规范](./2026-10-28-upstream-conflict-resolution-policy.md) 的类别表结算，不逐条重新论证。
2. **上游实现 + work 策略重放**：
   - `backend/internal/app/drama_export.go` 取上游（预检清单、大小校验、下载中断），重放「影策短剧」→「意绘短剧」三处文案。
   - `web/src/lib/canvas/canvas-project-domain.ts` 取上游（模型切换适配、参考图跟随），重放 work 的 `normalizeStoryboardCharacters` 与 `StoryboardCharacterReference` 导入。
3. **接受上游删除**：`editor-shell.tsx`、`editor-subtitle-tools.tsx`、`ai-command-schema.ts`、`timeline-to-ffmpeg.ts` 及随它们删除的四个测试（`asset-ingest`、`editor-commands`、`editor-history`、`plugin-permission-check`）。核实过 work 侧在这些文件里只有品牌与类型修正，没有独立行为；全仓已无对它们的引用。
4. **工具链保留较高安全版本**：`backend/go.mod` 保留 Go 1.26 与较高的 `x/crypto v0.57.0`、`x/image v0.45.0`、`x/net v0.60.0`、`x/sync v0.23.0`、`x/sys v0.48.0`、`x/text v0.42.0`，补入上游新增的 `coreos/go-oidc/v3`、`x/oauth2`、`go-jose/v4`；`go mod tidy` 只更新锁文件，`go build ./...` 与 `go test ./...` 通过。
5. **插件包按源码重放品牌后重打包**：冲突的 10 个包加上游新增的 `muse2api-video`、`seedance-mini1` 共 12 个，取上游 `manifest.json` 与 `docs/interface.md`，把作者与正文里的旧品牌名改为「意绘」，重跑 `node plugin-packages/embed-documentation.mjs <包 ID>` 重建 `documentation` 与内嵌合同，再按目录 `zip -X` 重打包。12 个产物逐条目解压与源码目录比对一致（各 3 个条目）。
6. **README 与文档索引不退回**：上游本批对根 `README.md` 的唯一改动是贡献者卡片文案，直接取 work 侧（贡献者、赞助商、演示账号区块保持删除）。`docs/index.md` 保留 work 的参考文档索引结构，补登记上游新增页面 `content/docs/backend/channel-configuration.mdx`，把遗产目录篇数校正为 `docs/design/` 22 篇、`docs/plans/` 11 篇（原数字在合并前就已落后），并把上游「ADR-0001～0007 站内剪辑方案已退场」的说明写进遗产段，不逐篇回链。
7. **`pending-test.mdx` 两侧都保留**：唯一冲突处在文件末尾，work 的「main v1.8.1 合并复核」与上游新增的「待用户验证：参考素材发送方式」同属记录，全部保留；本轮新增章节见本文末。
8. **测试按真实合同修复，不放宽门禁**：121 个测试类型错误收敛到 0，优先集中处理而不是在上游测试里散点强转——新增 `web/test/types/happy-dom-events.d.ts` 给 `EventTarget.dispatchEvent` 补一条接受 happy-dom 事件的重载（形状约束为 `Pick<Event, "type"> & object`，数字之类的错误参数仍被拒绝）；其余按真实合同补齐 `ChannelModel` 必填价格字段、`ReferenceImage.dataUrl`、`GenerationTaskOutput.mediaType`、素材库选项的 `category`/`kindLabel`、画布节点 `title`、`CanvasNode.showImageInfo`，并给 `GenerationTask.input` 的可选性加局部断言、给价格档往返与画面颜色断言加显式类型参数。
9. **品牌扫描回到零**：上游新增的 `backend/internal/handler/auth_oidc.go` 提示语、`backend/internal/emailtpl/code.go` 注释与三个后端测试夹具里的旧品牌名改回「意绘」；`backend/builtin/小红书素人穿搭配方/SKILL.md` 的「摄影策略」是正常汉语词汇，按 [品牌改名](../feature/2026-10-28-brand-name-yihui.md) 的判定口径保留。
10. **功能地图跟随入口变化**：登记 `/admin/traffic`（访问统计）与 `/admin/email-logs`（邮件发送日志），把素材与插件中心两处指向已删除测试的锚点换成现存测试。

## Alternatives considered

- **冲突整文件取上游**：一次解决 51 个冲突。否决理由：会把贡献者与赞助商区块放回根 README，把插件作者文案退回旧品牌，也会让 `go.mod` 回到较低的安全依赖版本，这些都是 work 已定策略。
- **冲突整文件取 work**：绝不撤销二开策略。否决理由：剪映草稿的预检清单与下载大小校验、画布模型切换适配、12 个插件包的协议修复全部来自本批上游，取 work 会静默丢掉这些功能，且 diff 看起来仍是一次成功同步。
- **保留被上游删除的剪辑模块与其测试**：避免删除动作。否决理由：上游同时移除了编辑器路由、时间线入口和相关依赖（`web/src/lib/timeline/` 只剩 `srt-parser.ts`），保留下来的文件没有调用方，等于把死代码和它的测试门禁一起维护。
- **放宽 `typecheck:test` 或把这些上游测试排除出整目录门禁**：修改量最小。否决理由：门禁的价值就是用真实类型合同发现合并漂移；排除文件等于把漂移推到运行期。集中补一条 happy-dom 派发重载是唯一放宽项，且它约束的是测试运行时已知的类型缺口。
- **给每个 `new dom.Event(...)` 调用点强转**：不改动全局声明。否决理由：同类转换在 12 个文件里重复出现，正是需要集中一次的地方；散点强转还会污染上游测试，下一次同步继续冲突。

## Consequences

- 收益：v1.8.4.1 的功能进入 work（访问统计、OIDC、邮件日志、渠道配置文档、剪映草稿预检、画布模型切换适配、12 个插件协议修复），品牌、内容边界与安全依赖版本保持不变；冲突结算表以外的判断只有一条（`docs/index.md` 的遗产篇数与退场说明），其余都是按表执行。
- 代价：上游测试仍会带着测试类型错误进来，每次同步都要在合并后跑一遍整目录门禁并补合同；`.yingce-plugin` 重新打包会重写 zip 容器（条目名、顺序、压缩方式不变），不能只凭产物哈希判断协议变化。
- 上限：本地没有 PostgreSQL 与 Redis，依赖这些服务的用例按设计跳过，由 CI 兜底；没有运行真实收费模型、OIDC 提供方、真实浏览器验收或服务器升级；`docs/index.md` 的遗产篇数是合并时点的人工计数，上游下次新增篇目后需要再核对。

## Verification

- `cd web && bun run typecheck`、`bun run typecheck:test`、`bun run lint`、`bun run build` 通过；`bun test` 3438 项全部通过（494 个文件、80201 次断言）。
- `cd backend && go test ./...` 全部包通过；`go build ./...` 通过，`go mod tidy` 后 `go.sum` 与 `go.mod` 一致。
- 功能地图校验通过：263 个代码锚点全部存在，新增两条后台路由已登记；`bun test test/feature-map-verifier.test.ts` 29 项通过。
- `python3 .github/scripts/check-env-docs.py` 通过（27 个环境变量）；决策笔记三线校验通过（22 篇）。
- 12 个插件包各 3 个条目与源码目录逐条目一致；旧品牌名作为独立品牌词在插件源码与产物中命中 0。
- `bun scripts/verify-before-push.mjs`：12 项检查中 11 项通过（web:format 除外），web:e2e、web:test、后端分片与 gofmt 全绿。`web:format` 失败与本批改动无关，见下条。
- 已知上游缺陷（本次未修）：`web/src/styles/globals-5.css` 在第 91 行多一个闭合花括号（`885 {` / `886 }`），该文件在 `origin/main`、work 基线与合并结果里逐字节相同，属上游遗留。`verify-before-push.mjs` 以 `origin/main` 为基准，因此会把 work 已存在差异的所有文件都纳入格式检查并在这里失败；CI 的 `check-changed-formatting.mjs` 以推送前的基数为基准，本次推送没有改动该文件，不会纳入检查。**不要顺手修这一行**：`check-changed-formatting` 会对基线版本调用 `prettier.check`，基线文件无法解析会直接抛错，改动该文件的推送反而会红。修整时要把「清掉多余花括号」和「同时保证基线可解析」放在同一次提交里，或先把整文件按 Prettier 重排。
- 推送后 CI `Quality checks` 在 `Vulnerability and secret scan` 失败：`govulncheck` 报 `GO-2026-6859`（`net/http`，`Found in go1.26.10`、`Fixed in go1.26.11`）。该作业原先没有 `setup-go`，用的是 runner 自带的最新补丁版，标准库公告一发布就在零代码改动下变红。已按「工具链与安全依赖」类结算：`backend/go.mod` 的 `go` 指令升到 `1.26.11`、`.tool-versions` 与 `AGENTS.md` 同步，并给该作业补 `actions/setup-go@v5`（`go-version-file: backend/go.mod`），让扫描器始终跟随声明版本而不是 runner 漂移；镜像继续用浮动的 `golang:1.26-alpine`，需要时由 `GOTOOLCHAIN` 拉取补丁版。
- 升级后本地 `go run golang.org/x/vuln/cmd/govulncheck@latest ./...` 输出 `No vulnerabilities found`（0 个可达漏洞），`go build ./...`、`go test ./internal/protocol ./internal/auth ./internal/handler` 与 `gofmt -l` 通过。
- 未做：本地 PostgreSQL / Redis 依赖用例、真实浏览器验收。
