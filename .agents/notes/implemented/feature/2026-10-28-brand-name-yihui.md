# Agent Note: 品牌名统一为「意绘」/ EASYDRAW，标识符层保留 yingce 不动

Status: implemented

## Problem

产品品牌名要从旧的两字名换成「意绘」，英文名定为 `EASYDRAW`。品牌名在仓库里同时扮演三种角色，混在一起使人无法判断改到哪里算完：

1. **运行时默认值**：`auth.DefaultBrandName`、`app.defaultAppearanceBrandName`、外观 store 的 `brandName`／`seoTitle`／`seoDescription`／`footerCopyright`、画布助手 `agentName`、内置技能 author 兜底。这些是「品牌名」本身。
2. **内容资产**：95 个插件包的 `manifest.json` 内嵌 `documentation` 与 `docs/interface.md` 契约块、116 个内置技能包的正文与 `author`、参考文档、根 README/CHANGELOG。这些是默认值的**文本副本**。
3. **同源英文标识符**：Go module 路径 `yingce/backend`、协议 `yingce.plugin/v2`、`yingce.payment/v1`、分发包扩展名 `.yingce-plugin`、`YINGCE_AGENT_*` 环境变量、容器与镜像名、技能 owner、localStorage 键、对外域名。

用户要求「全量替换中文品牌名」，同时明确破例允许改动 `docs/adr`、`docs/design`、`docs/plans` 这三处上游只读遗产。第 3 类不在本次要求内，但必须留下书面边界，否则「品牌已改完」会被误读成「标识符也改过了」。

旧两字名在新提交里不再出现，需要时从本提交之前的 git 历史检索；本笔记刻意不重复写出该字符串。

## Decision

中文品牌名「意绘」是全仓库唯一取值，595 处旧字面量全部替换，覆盖 391 个文本文件与 96 个已提交的插件产物。

**默认值（唯一真相源，改这里即改全局表现）**

- 后端：`backend/internal/auth/host.go` `DefaultBrandName`、`backend/internal/app/appearance.go` `defaultAppearanceBrandName` 与「恢复默认品牌标识」审计文案、`backend/internal/app/appearance_canvas.go` 画布助手 `AgentName`、`backend/internal/skills/skills_builtin.go` 内置技能 `Author` 兜底。
- 前端：`web/src/stores/use-appearance-store.ts`（`brandName`／`seoTitle`／`seoDescription`／`footerCopyright`）、`web/src/lib/canvas/agent-appearance.ts`、`web/src/lib/sidebar-checkin.ts` 兜底。
- 其余前端出现点都是文案常量（预演台窗口标题与台面 logo、欢迎页 story、内置编辑器插件 author、创作 Agent 与时间线 AI 提示词、音频设置示例、静态页 `web/public/welcome/credits.html`），随字面量一起改。

**内容资产按定向替换处理，不重跑生成器。** `plugin-packages/generate-catalog.mjs` 与 `plugin-packages/embed-documentation.mjs` 的输出与仓库现存文件不幂等：实测在当前源码上重跑会产生 147 个文件差异，包括把 `agnes-image` 的版本从 2.1.0 退回 2.0.0、抹掉手工补的 `imageParameters` 块。重跑生成器会把无关漂移混进品牌改动，因此只做字符串替换。

**已提交的插件产物在 zip 内部原位重写。** 107 个 `.yingce-plugin` 中 96 个含旧品牌名（共 295 处，位于 `manifest.json` 的 `documentation` 与 `docs/interface.md` 契约块）。产物与源码目录有历史漂移：102 个一致、4 个不一致（`dashscope-wan3-video`、`newapi-video-generations-v1`、`official-payment-xunhupay`、`wavespeed-image-edit`）、1 个无源码（`autodl-comfyui`）。从源码重建会把漂移一并折叠进来，所以逐包解压、只替换含旧品牌名的 UTF-8 条目、按原条目名、条目顺序与压缩方式重新打包。中文字面量等长替换，因此条目长度不变；zip 容器会被重新 deflate，外层文件字节数与压缩前后尺寸会变（例如 `agnes-image` 10865 → 10665 字节），这是容器层的压缩差异，不是内容差异。

**内置技能目录同步改名。** `backend/builtin/` 下以旧中文品牌名命名的内置技能目录改为 `意绘短剧制作工作流`。目录名只是可读 slug，稳定身份是 `SKILL.md` 的 `skillId: yingce-short-drama-workflow`（见 `backend/internal/skills/skills_builtin.go` 的目录名与 `skillId` 分流），代码、测试与 `web/src/services/skill-defaults.ts` 都不引用该路径，改名不影响已安装技能的数据库归属。

**内容资产做人工复核，不止机械替换。** 无限定子串替换会撞进复合词：旧品牌名恰好是「摄Ｘ策略」的子串（`HEAD` 中唯一的非品牌出现就是这个正常的摄影类词汇），替换后变成「摄意绘略」，已回写成「摄影策略」。同批复核了「摄／电／阴／投／剪／缩／画／幻」+ 品牌名与品牌名 +「略／划／视／棚／院／片」的组合，全仓库只此一处。该词回写后，`影策` 仍会作为它的子串出现，这是正常汉语词汇而非旧品牌名，残留检查因此按“旧品牌名作为独立词”为口径。

**生成器模板同步。** `plugin-packages/generate-catalog.mjs` 的 `author` 与运行时合同模板已一并更新，即使日后修好生成器漂移再重跑，也不会回退成旧品牌名。

**文档破例。** `docs/adr`、`docs/design`、`docs/plans` 共 49 处随其他参考文档一起改，不再按只读遗产处理；本次属于用户明确授权的单次破例，不是常态约定变更。

## 未随之改动的标识符层

以下保留 `yingce`，与中文品牌名解耦。任何一项单独改动都会造成部署或协议断裂，需要独立立项：

- Go module 路径 `yingce/backend`（1314 行 import）。
- 线协议 `yingce.plugin/v2`、`yingce.payment/v1`：后端明确拒绝旧版本 `apiVersion`，改名会让已安装的 95 个插件包全部失配，必须重发包。
- 分发包扩展名 `.yingce-plugin`：硬编码在 `backend/internal/generation/registry.go` 的后缀判断里，且 107 个产物共 86MB，改名等于重建全部二进制并让旧包失效。
- `YINGCE_AGENT_*` 环境变量 388 处：牵动 `.env.example`、`docker-compose*.yml`、CI、`check-env-docs.py` 门禁与已部署实例配置。
- `yingce-agent` 目录/服务/镜像名、技能 owner `yingce-system`、`web/package.json` 的 `name`、localStorage 键 `yingce:theme_store`（改名丢用户本地偏好）、域名 `yingce.tv`／`canvas.yingce.cc.cd`／`ai.yingce.tv`。
- **英文品牌层**：登录页首屏标识 `brandStudioLabel` 在内置品牌 ＋ 内置 slug 时硬编码返回，自定义品牌时由 `brandSlug` 大写派生；出站默认 User-Agent 在 `web/src/components/channel-headers-editor.tsx`。内置分支已改为 `EASYDRAW STUDIO`（保留原有 STUDIO 后缀与字重节奏），User-Agent 改为 `EasyDraw/1.0`，保留仓库 URL。
- **官方插件包写英文作者名的三个包**：`antigravity-proxy`、`src-antigravity-proxy` 与 `lxmone-video-suite` 的 `author` 原是 `Yingce`（与其余 95 包的「厂商 / 意绘」不同形），已统一为中文品牌「意绘」/「意绘 / 万有引力」，对应 2 个产物同步重写。按用户指示，第三方厂商自己的品牌（如「沧元算力 / 影绘」）不改。
- **第三方品牌 `影绘`**：`plugin-packages/cangyuan-midjourney` 的 `author` 是「沧元算力 / 影绘」，属厂商自己的产品名，与新品牌只差一个字；按用户指示不改，避免改坏第三方归属。
- **`brandSlug` 仍为 `open-ai-canvas`**：它与 `web/src/lib/oss-settings.ts` 的 `DEFAULT_OSS_PATH_PREFIX`、`backend/internal/storage/settings.go` 与 `app/settings.go` 的 `defaultOSSPathPrefix`、Host Updater 的上游仓库名同源，是存储与分发的基础设施命名空间，不是对外品牌。改它会把新部署的对象存储路径前缀换到 `easydraw/`，而仓库名与镜像仓库仍叫 open-ai-canvas，两处因此分开。

## 存量数据缺口

品牌默认值同时被当作「继承默认」的哨兵使用：`backend/internal/auth/email.go` 用 `value.FromName == DefaultBrandName` 判断发件人是否跟随品牌，`appearance` 设置读取时用空值回退到 `defaultAppearanceBrandName`。默认值改动后：

- 从未保存过外观设置的实例（`appearance` 设置为空）自动显示「意绘」。
- 管理员曾显式保存过外观设置、或邮件发件人存了旧品牌名的实例，仍会保留旧名，需要管理员在外观设置里点一次「恢复默认品牌标识」或手工改发件人。

按 AGENTS.md「不为旧数据增加兼容层」不写自动迁移，改为在 `docs/content/docs/progress/pending-test.mdx` 记录需要人工确认的实例。

## Alternatives considered

- **只改运行时默认值，不动内容资产** — 改动量最小（约 25 个文件），用户可见处立刻生效，插件与技能包的作者署名、静态欢迎页遗留旧名可接受。否决理由：用户明确要求全量替换，插件中心展示的 `author` 与内置技能说明会长期露出旧品牌名，形成两套品牌叙述。
- **复用 `generate-catalog.mjs` + `embed-documentation.mjs` 重跑生成器，让模板成为唯一来源** — 长期看最干净，一处模板改完 190 个文件。否决理由是可证伪的：实测重跑产生 147 个文件差异，会退回插件版本号并抹掉手工维护的 `imageParameters`，等于把两处无关修复塞进品牌提交；应先做「生成器与现存文件对齐」的独立改动。
- **从源码目录重建全部 `.yingce-plugin` 产物** — 产物与源码天然一致，比原位改 zip 更符合构建直觉。否决理由：4 个包已存在源码与产物漂移、1 个包无源码，重建会把漂移折叠进品牌提交，且无法处理无源码包。
- **同步重命名 `yingce` 标识符层** — 品牌一致性最彻底，避免拼音与中文名长期错位。否决理由是断裂面：协议 `apiVersion` 拒绝旧版本会让已装插件全部失效，环境变量改名会让现有部署启动失败，扩展名改名要重建 86MB 产物。这类改动需要独立迁移窗口与插件重发计划，不能与文案替换同批。
- **在笔记与文档里保留旧品牌名以便检索** — 决策记录可读性更好。否决理由与用户「全量替换」要求冲突；改为用「旧两字名」指代，实际字符串保留在 git 历史。
- **英文名沿用拼音或由 slug 派生，不引入 `EASYDRAW`** — 改动为零，`brandStudioLabel` 保持原分支即可。否决理由：用户明确指定英文品牌名为 `EASYDRAW`；继续用拼音会让中文名与英文名对不上，而派生默认 slug 会得到「OPEN AI CANVAS」，比原名更不像品牌。
- **`brandSlug` 一并改为 `easydraw` 与 OSS 路径前缀默认值同步** — 品牌命名空间全部对齐，管理后台不再出现两个英文标识。否决理由是影响面不对等：OSS 前缀默认值在前后端各有一处常量、与 Host Updater 使用的上游仓库名同属发布链路，改它等于给新部署换存储路径前缀，超出“改品牌”的范围；两处保留 `open-ai-canvas` 并在文档里声明分工。
- **把官方插件包里 `author: Yingce` 也改成 `EASYDRAW`** — 与英文品牌一致。否决理由：其余 95 个包的作者字段已经是「厂商 / 意绘」的中文形态，改成英文会变成 95 个中文＋3 个英文的混合；统一为中文形态更一致。

## Consequences

- **收益**：默认值集中在 8 处，其余全部是文本副本，未来再换名只需改这 8 处加上定向替换；插件与技能包署名、参考文档、上游遗产文档与运行时表现一致，不再有两套品牌叙述。
- **代价与已知上限**：旧品牌名作为独立品牌词已不存在，但仍会作为「摄影策略」这类正常汉语词汇的子串出现，因此“全文搜索为零”不是可保持的目标，验收口径只能是“作为品牌名出现为零”；路径是独立维度（`git grep` 只搜内容），首次落地时漏了内置技能目录名，靠评审才补齐，说明“零残留”必须同时扫内容和路径。`yingce` 系列标识符仍是拼音品牌名（Go module、协议版本、环境变量、扩展名、镜像名），与中文名、英文名三者长期并存，`brandSlug` 也仍是 `open-ai-canvas`，因为它们分别是协议标识与存储命名空间。已发布的 `CHANGELOG.md` 历史条目与 `pending-test.mdx` 的历史确认记录随全量替换一并改写，与旧 tag 不再逐字对应。已部署实例若保存过外观设置或发件人不会自动跟随，需管理员手工重置；本次没有自动化迁移与浏览器验收。
- **重访信号**：需要把插件协议版本、环境变量、镜像名或 OSS 前缀与品牌对齐时，按上面「未随之改动的标识符层」清单立项，先做协议兼容期再改名。

## Verification

- 残留扫描（内容 ＋ 路径双口径）：旧品牌名作为独立词命中 0；`git -c core.quotePath=false ls-files | rg '<旧两字名>'` 与 `find -name '*<旧两字名>*'` 均为 0（首次落地时内置技能目录名漏改，评审发现后已 `git mv`）；对 107 个 `.yingce-plugin` 逐条目解压扫描，命中 0。字面搜索仍会命中「摄影策略」这类正常词，它是被恢复的内容，不是漏改（整个 `HEAD` 中非品牌的字面出现仅此 1 处）。
- 产物内容完整性（以 `HEAD` 版本为基准逐条目比对）：107 个产物条目名与顺序未变，压缩方式未变；164 个条目字节完全相同，195 个条目仅品牌文案变化且长度不变；无需重建包。抽查 `kling-video`、`agnes-image`、`openai-chat-completions` 解压后与源码目录 `diff -rq` 无差异。zip 容器因重新 deflate 导致外层尺寸变化（如 `agnes-image` 10865 → 10665 字节），属容器层压缩差异。
- 复合词误替换：全仓库核「摄／电／画／幻／投／剪／缩」+ 品牌名与品牌名 +「略／划／视」的组合，命中 1 处（`小红书素人穿搭配方` 的“摄影策略”）并已纠正。
- 后端：`cd backend && go test ./...` 通过；改过 `.yingce-plugin` 后必用 `go test -count=1 ./internal/protocol` 重跑，因为 Go 测试缓存不感知运行时读取的外部产物字节（本轮就靠 `-count=1` 才真正验到新作者字段与契约块）。覆盖了 `appearance_test.go`、`appearance_live2d_test.go`、`password_reset_test.go`（默认品牌继承链路）、`auth_registration_test.go`（服务协议文案）、`protocol_runtime_test.go`（插件 `documentation` 合同）、`official_catalog_test.go`（读取已提交产物校验 manifest 与契约块逐字段一致）；内置技能目录改名后重跑 `go test ./internal/skills ./internal/app` 通过。
- 前端：`bun run typecheck`、`bun run typecheck:test`、`bun run test:gate` 通过；`bun test` 全量 2868 pass / 0 fail（含 `test/appearance-bootstrap.test.ts` 的「初始 HTML 不含内置品牌名」与「恢复默认品牌标识」断言、`test/workspace-route-loading.test.ts` 的启动层不得包含品牌字串、`test/oss-settings.test.ts` 的路径前缀默认值）；`bun run build` 通过。
- 未做浏览器验收：登录页、顶栏、欢迎页、预演台、管理后台外观设置的实际渲染，以及存量实例重置后的品牌回退行为，记录在 `docs/content/docs/progress/pending-test.mdx`。

相关决策见[品牌首页走独立公开入口](./2026-10-15-welcome-brand-homepage.md)，那篇讲的公开首页与外观体系结构未变。
