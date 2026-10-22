# Agent Note: 功能地图成为 Agent 定位功能与验收的可校验索引

Status: implemented

## Problem

复现一条用户报障的起点是「把用户的原话翻成代码位置」，而这个动作在仓库里没有落点。`web/src/router.tsx` 有 58 条路由（含 `/admin` 下 33 条子路由），`web/src/stores/use-user-store.ts` 的 `FeatureAvailability` 有 11 个开关，`web/test/` 有 378 个测试文件，`docs/content/docs/backend/code-map.mdx` 239 行按实现主题组织。四份数据各回答一部分，没有一份把「用户在哪看到这个功能、怎么点到它、怎么证明它工作」串起来。

后果是 Agent 的默认动作退化成从关键词猜文件名和 `rg` 撞运气。更贵的错误是误诊方向：`imageWorkbenchEnabled` 与 `videoWorkbenchEnabled` 默认 `false`，入口不存在时最容易被当成路由或渲染 bug 去修，实际是功能开关没开；`/wallet` 路由的 element 虽为 `null`，实际由全局 `WorkspaceWalletHost` 读取支付回跳参数、打开钱包浮层并跳回首页，不能只看路由声明就把空白页当成正常行为；`/welcome` 根本不在 `router.tsx` 里，由 `web/src/main.tsx` 分流到独立 root。这些都不是实现缺陷，但每一条都能让一次排查跑偏半小时以上。

## Decision

`.agents/skills/feature-map/` 是 Agent 侧的功能级索引，与 `docs/content/docs/backend/code-map.mdx` 分工：前者定位功能与验收，后者定位实现文件。每个功能块固定四行——抵达（路由、入口控件、前置条件）、锚点（页面、状态、API 模块、后端 handler）、验收（可直接跑的命令或可直接断言的 DOM/接口）、陷阱（踩过的误诊点）。

索引本身必须可校验，否则会和它记录的对象一起腐烂。安装 `web/` 锁定依赖后，从仓库根目录运行 `.agents/skills/feature-map/scripts/verify-feature-map.ts`，判定四件事：

1. 通过 `web/scripts/feature-map-routes.ts` 静态解析 `web/src/router.tsx` 的 TSX AST，递归拼接绝对/相对路由、无路径布局和 index，所有可抵达路由必须登记；根级 `*` 404 兜底除外。不执行应用模块，本文件 const 数组、无参同步工厂、数组展开和条件分支可解析，动态或未支持的声明直接报错。
2. 图里的路由必须存在于路由树或显式登记的非 Router 界面，改名后留下幽灵路由即失败。
3. `router.tsx` 的 `feature` 字符串名称必须在图内表格行中登记，不接受正文偶然出现同名字符串作为说明。
4. 完整仓库路径和验收命令内的每个文件参数必须存在；`test/` 相对路径按 `web/test/` 解释，裸文件名报错（同目录 `SKILL.md` 除外），文件模式展开后至少匹配一个锚点。统计只计已检查且存在的唯一路径。

只有反引号内的内容参与比对，这是「照图操作」与「机器校验」共用的写法；命令 span 进一步提取其中的路径参数。路由 token 支持参数、可选段与 splat，不把 `/api/` 接口路径、查询串深链或欢迎页正则当路由。不经 React Router 的界面（当前只有 `/welcome`）登记在脚本内的 `OUT_OF_ROUTER_SURFACES`，必须同时保留图内 token 和源码分流标记，缺少任一项即失败。

接线三处，互相补位：

- `AGENTS.md` §2 把功能地图设为报障场景的第一步；§8 加本地校验命令；§9 写明路由、入口、feature flag 变动时同步。
- `.github/workflows/verify-feature-map.yml` 在 `pull_request` 与 `work` 推送时执行同一脚本，与 `verify-notes.yml` 同构。
- `docs/index.md` 与 `docs/content/docs/backend/code-map.mdx` 各加一条指针，避免读者把两份地图当成一份。

## Alternatives considered

- **仅用正则匹配绝对路由并特判 `/admin`** — 无解析器安装成本，脚本短。否决理由：相对子路由和嵌套路由会漏检，字符串与注释中的括号也会影响手写分块。改用 Babel AST；`@babel/parser` 与 `@babel/types` 原本就在前端锁文件中，仅提升为显式 devDependency，不新增解析器版本。代价是该 CI 门也需要安装前端锁定依赖。
- **扩写 `code-map.mdx` 成一张更全的表** — 改动最小，读者只需记一个入口，且该表已有「功能 | 页面入口 | 主要协作模块」三列，接近目标形状。否决理由：两类信息的变动频率差一个量级。路由与入口随产品迭代偶尔变，实现文件随每次重构都变；混在一处后，高频的实现细节会把低频但关键的抵达路径冲散，而 `code-map.mdx` 已经在 239 行持续增长。
- **用 JSON/YAML 做单一真相源，再生成 Markdown** — 校验最严格，可以约束字段而非只约束 token。否决理由：多一步生成与产物落盘，人改文档时要先改数据再重新生成，两份内容一旦不同步就要额外解释哪份是真。Markdown 里反引号包住路径已经足够机器解析，脚本直接读原文，维护成本更低。
- **只写文档，先不接校验门** — 落地最快，也不影响任何人当前流程。否决理由：仓库里未接门的散文约定已经有腐烂先例（`docs/index.md` 曾指向已不存在的 `overview/docker.mdx`、`canvas/canvas-node-manual.mdx` 等）。这张图的价值全在「可信」，第一版就带门比事后补便宜。
- **为每个功能补真实浏览器 E2E 作为唯一验收信号** — 证据最强，能直接证明功能可用。现阶段否决：需要浏览器与后端，全量跑不起来，也超出一次改动该承担的成本。当前用「已有单测文件路径 + DOM 选择器/接口路径」当轻量信号，真实浏览器验收仍由 `web/scripts/previs-p0-chrome-e2e.mjs` 与 `pending-test.mdx` 承担。

## Consequences

- **收益**：报障定位从「猜文件名」变成「查路由再查锚点」，并且每条锚点都由脚本保证存在，读到的路径不会是历史残影。默认关闭的 feature flag、由全局宿主承接的钱包回跳、非路由界面这三类误诊点被写进固定位置，不再依赖某个人记得。
- **代价与已知上限**：
  - 新增路由、改 feature flag、挪动入口会多一步登记义务；`/admin` 子路由 33 条使这张表在后台变更时同步成本不低，这是刻意选择——后台恰恰是路由最常增删的地方。
  - 校验只保证锚点**存在**，不保证锚点**贴切**。开关名称登记不证明默认值或入口条件正确，接口路径、DOM 行为和验收测试覆盖同样需人工沿调用链核对，CI 通过不等于功能验收通过。钱包回跳以全局宿主为准，RunningHub 入口以插件运行状态为准，分享接口以 handler 注册为准，画布滚轮以忽略选择器和事件分支为准。
  - 图里的「陷阱」只覆盖已经踩过的点，未踩过的不在其中；新踩一次就该补一行，否则这张图会停在初版认知上。
  - 反引号是唯一可解析写法，写作者忘了加反引号时该路由不会参与比对（漏登记不会报错，因为它压根没被识别为路由）；这类漏检靠「既有路由必须全部出现」这一条从另一侧兜住——只要 `router.tsx` 里有，就必须被写上。

## Verification

- `bun run .agents/skills/feature-map/scripts/verify-feature-map.ts` 通过：58 条路由、1 个非路由界面、6 个路由开关；197 个实际存在的锚点包含命令中的测试文件与文件模式展开结果。
- `web/test/feature-map-verifier.test.ts` 固化 29 项回归，覆盖普通相对子路由、后台嵌套、工厂作用域、DEV 两分支、动态语法拒绝、命令内缺失测试、裸文件名、文件模式、幽灵路由、开关表行、欢迎页双向登记及 CLI 退出码。用例只写隔离临时目录，退出后清理，不临时修改真实地图。
- 该校验器与钱包入口、工作台开关、钱包布局的四文件专项共 42 项通过；测试类型检查、UI lint 和生产构建通过，冻结依赖安装无变动。构建仍提示动态/静态混合导入和大分包；未做浏览器或业务接口运行验收。
- 校验脚本自带根目录探测（向上最多 6 层找 `web/src/router.tsx`），从 `web/` 子目录执行不会因相对路径读错文件。
- CI 落点 `.github/workflows/verify-feature-map.yml`，`pull_request` 与 `work` 推送触发，先安装锁定依赖，再跑校验器回归与真实地图检查；`bun` 版本沿用仓库 `.tool-versions` 的 1.3.9。
- 写本篇前按 `功能地图`、`feature-map`、`FEATURE_MAP`、`验收信号` 检索 `.agents/notes/` 的活跃笔记，无重叠篇，无需互链或归档。
