# Agent Note: 根 README 只留开发内容，下线赞助商与贡献者展示及其数据源

Status: implemented

## Problem

根 README 同时承担了产品文档与品牌致谢两种职能：赞助商表格（9 家商业/团队/企业，含 LOGO 与推广文案）、3D 预演台赞助用户联系表（5 个头像链接 + 9 行联系方式）、以及 28 位贡献者的头像/邮箱/微信/签名表格，还包含公网演示站点的共享账号。这些内容与开发和运维无关，却让根 README 成为必须逐字维护的展示页。

更实际的耦合在构建侧：`web/src/pages/welcome/contributors.ts` 以 `import readmeMarkdown from "../../../../README.md?raw"` 加 `import.meta.glob("../../../../assets/user-*")` 在欢迎页渲染同一张贡献者表，于是 README 的排版与头像文件成了产品页面的运行时数据——任何一次 README 调整都可能改变页面，`Dockerfile` 的 web-build 阶段必须把 `README.md` 与整个 `assets/` 一起拷进镜像上下文。仓库根 `assets/` 里另有 10 张图片（界面截图、二维码、tldraw 许可设置图）在本次改动前就已无任何引用。

`AGENTS.md` 已约定根 README 只保留项目定位、能力概览、快速开始、架构概览、部署、安全、参考文档入口和许可证；`[文档治理](../process/2026-10-15-documentation-governance.md)` 也把 README 定位为参考类文档入口。赞助与致谢内容让 README 超出了这条边界。

## Decision

根 README（193 行）删除 `## 赞助商`、`### 3D 预演台赞助用户`、`## 贡献者与团队` 三节与演示账号行，只保留一行演示站链接，其余章节不变。

欢迎页不再有贡献者展示：`web/src/pages/welcome/contributors-card.tsx`、`contributors.ts`、`contributors-parse.ts` 与 `web/test/welcome-contributors.test.ts` 删除；`index.tsx` 去掉 `WelcomeContributorsCard` 引入、`贡献者` 导航项与卡片挂载；`welcome.css` 删除 `.welcome-contributors*`、`.welcome-contributor-*` 全部规则（含媒体查询内 202 行）。`.welcome-ending` 现在只剩标题，其 `h2` 的 `margin-bottom: 42px`（移动端 `30px`）随之删除，避免页尾出现双份空白。欢迎页其余叙事结构见 `[品牌首页笔记](../feature/2026-10-15-welcome-brand-homepage.md)`。

仓库根 `assets/` 只保留设计源文件 `prototypes/*.drawio`；47 张图片全部删除——28 张贡献者头像、9 张赞助商 LOGO、10 张改动前即无引用的界面/二维码截图，目录体积从 5.3M 降到 80K。

`web/` 不再 import 仓库根的任何文件，`Dockerfile` web-build 阶段因此移除 `COPY README.md /app/README.md` 与 `COPY assets /app/assets`；`COPY CHANGELOG.md` 保留，`web/vite.config.ts` 仍读取它注入 `__APP_CHANGELOG__`。运行镜像只拷贝 `/app/web/dist`，`docker/canvas-web-entrypoint.sh` 里的 `assets` 指 dist 产物目录，与仓库根 `assets/` 无关。

`CHANGELOG.md` 中指向已删内容的四条记录（3D 预演台致谢、赞助商分类、贡献者名单、README 演示账号说明）同步删除，`## v1.0.7` 段因删空只剩标题。

## 内容边界

根 README 不承载营销、赞助与致谢内容，这部分不再在仓库内维护；`assets/` 只存设计源文件（`prototypes/*.drawio`），不再存展示图片。任何新页面要走"README 即数据源"的模式前，先确认该数据是否需要随产品构建发布——本次删除的正是这条契约：文档改动不应改变产品页面。

## Alternatives considered

- **保留贡献者表格，只把数据源从 README 搬到 `web/src` 常量或 JSON** — 最强论据是保留公开致谢位且让欢迎页不再受 README 排版影响，头像可继续随构建发布。否决理由是问题不在存储位置而在展示本身：搬进 `web/src` 仍是第二份需要维护的人员名单，28 张头像继续进构建产物，README 与产品页的耦合只是换了个方向。
- **先只删赞助商与演示账号，保留贡献者表格** — 最强论据是贡献者表当时是唯一被产品消费的 README 内容，动它要同时删除组件、解析器与测试，风险明显高于删纯文案。这条路先被执行过一版，随后被推翻：赞助与致谢都不属于 README 边界，只删一半会把"改 README 会改产品页"的契约留下。
- **保留改动前就无引用的 10 张图片** — 最强论据是它们不是本次删除造成的死文件，清理它们扩大了改动面，下游 fork 或旧文档可能仍在引用。否决理由是它们在全仓库（含 `docs/`、`CHANGELOG.md`）零引用，且与 `assets/` 的保留原则冲突：既然只剩设计源文件，界面截图与二维码没有留存理由。
- **保留 `CHANGELOG.md` 中的四条历史记录，只删正文内容** — 最强论据是 CHANGELOG 记录已发布版本的事实，删条目等于改写发布史，`## v1.0.7` 还会变成空段。否决理由是它们全部是"详见 README"式的指向已删内容的引用，留下会让下一位读者顺着找不存在的东西；原始文字仍可在 git 历史中取回。

## Consequences

- **收益**：README 与 `AGENTS.md` 约定的边界一致，只留开发相关内容；`web/` 构建不再依赖仓库根的 `README.md` 与 `assets/`，Docker 构建上下文不再拷贝品牌素材，`assets/` 从 5.3M 降到 80K；欢迎页不再有"README 排版错误导致页面异常"的失败面，`welcome-contributors` 解析器与其测试一并消失。
- **代价与已知上限**：仓库内不再有赞助商与贡献者的公开致谢位，欢迎页少了一段社会证明；`assets/prototypes/*.drawio` 仍是零引用文件，留着只是因为删除会牵连 `assets/` 目录本身与 `Dockerfile` 的目录级假设。重访条件：若产品恢复贡献者/赞助展示，需要同时补回数据源（README 解析或 `web` 侧常量）与头像入构建；若文档站或 README 重新引用 `assets/` 图片，需要恢复 `Dockerfile` 的 `COPY assets`。删除动作为破坏性：下游副本若仍引用 `assets/user-*.jpg`、`assets/artdance.png` 等路径会 404，取回需从 git 历史恢复。CHANGELOG 的改动属不可逆删改（`v1.0.7` 现只有标题），仅在无人依赖这些条目时可接受。

## Verification

- `cd web && bun run typecheck` 与 `cd web && bun run build` 通过（tsc --noEmit + vite build）。
- 构建依赖的正向验证：把 `README.md` 与 `assets/` 临时移出仓库根后重跑 `bun run build`，退出码 0，随后原样还原——证明 web 构建确实不再读取这两个路径，`Dockerfile` 两行 COPY 的删除安全。
- 引用扫描：47 个被删文件名、`contributors` / `assets/user-` 在 `web/src`、`web/test`、`docs/`、`CHANGELOG.md` 中零命中；`README.md#` 形式的锚点引用仅剩 `#贡献者与团队` 一处，已随本节删除。
- 删除前记录的基线：贡献者解析测试 `cd web && bun test test/welcome-contributors.test.ts` 为 2 passed，该测试随功能一同删除，不再作为回归面。
