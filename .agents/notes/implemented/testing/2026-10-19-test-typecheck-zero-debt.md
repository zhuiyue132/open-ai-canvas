# Agent Note: 测试类型欠账清零，棘轮换成整目录门禁

Status: implemented

## Problem

`web/test/` 长期不进类型系统：`web/tsconfig.json` 的 include 只有 `vite.config.ts` 与 `src/**`，`bun run typecheck` 与生产构建都看不到测试文件。为了不一次性面对全部存量错误，[二开主线的质量门](../process/2026-10-15-quality-gates-on-work.md) 引入了**只拦新增文件的棘轮**（`bun run typecheck:test:new`）：新增测试文件必须类型干净，存量 172 处错误 / 58 个文件保持现状。

棘轮能止血，但留了两个持续成本：

- 存量欠账不会自己减少，只会随着测试替身与真实类型的继续漂移而增长；每次同步上游后还要按块修（见质量门笔记里的「每次同步上游都要补一轮收尾」）。
- 棘轮只能防新文件，改老文件里的类型错误依旧不会被拦。真实的驱动场景是上游同步：上游带来的测试对 `work` 全是「新增文件」，于是这些错误在被合并时以红 CI 的形式一次性出现，而不是在写代码时就拦住。

## Decision

存量清零，撤掉棘轮，CI 的 web job 直接跑整目录检查：

- web job 的 `Typecheck new test files` 步骤换成 `Typecheck test files`，命令为 `bun run typecheck:test`（`tsc -p tsconfig.test.json`），不再传 `BASE_SHA`；任何测试文件的类型错误都会拦住推送。
- 删除 `web/scripts/check-new-test-types.mjs` 与 `package.json` 的 `typecheck:test:new`，不留失效路径；`bun run typecheck:test` 本身既是本地量化命令，也是 CI 门禁。
- 172 处错误按类型分六类结算，每类一个提交、各自跑通 `tsc` + `bun run test`：

| 类别 | 内容 | 起止 |
| --- | --- | --- |
| A | 夹具字段契约（`TS2741/2739/2740/2353/2561/2345/2322`） | 172 → 93 |
| B | 重载与替身签名（`TS2769/2558`） | 93 → 69 |
| C | `as` 断言不重叠（`TS2352`） | 69 → 54 |
| D | 收窄与可能为空（`TS2339/18048/2532/18046`） | 54 → 14 |
| E | 导入/配置/隐式 any（`TS5097/1192/2307/7006`） | 14 → 2 |
| F | 旧字段名与失效断言（`TS2551`） | 2 → 0 |

- 修法边界：只动 `web/test/**` 与纯类型声明；不动 `web/src/**` 运行时代码。替身/宿主边界允许 `as unknown as`，但逐处注明理由；`@ts-expect-error` 只用于 tsc 确实无法表达的导入形态（Bun 的 text 加载器 + 保留扩展名），逐处注明。新增 `web/test/types/bun-query-imports.d.ts` 给 worker 夹具的 `?query` 导入补纯类型声明（类型指向真实模块，不产生运行时值）。
- 断言只做类型层修正：`expect` 期望值仅在「原断言验证的字段/行为已不存在」时改写，并在提交信息里写明原因。

## Findings

清零过程暴露了四处 **src 侧的类型与运行期不一致**，本次按边界只改测试侧，生产代码未动：

- `canvas-workflow-builder.ts` 通过对象展开把 `metadata.referenceNodeIds` 写进新节点，而 `CanvasNodeMetadata` 只声明 `referenceAssetNodeIds`（后者才是 `use-canvas-previs` / `use-canvas-node-operations` 读取的字段）。展开写法绕过 excess-property 检查，类型系统因此没报错。
- `canvas-project-domain.ts` 的 `storyboardRowsFromTask` 把模型返回的 `characters` 原样透传，而 `StoryboardRow.characters` 声明为 `StoryboardCharacterReference[]`（对象带 `characterName`）。
- `canvas-missing-resources` / `repairPendingCanvasMutationRequest` 的清理与修复路径会删掉返回类型里的必填字段，测试只能按线格式断言。
- `normalizeAddedSkillReference` 对旧后端/测试桩返回的最小引用直接 `as unknown as Skill` 透传。

前两条是真实缺陷候选（读的一方和写的一方用了不同字段名/形状），建议单独建 bug-fix 处理。

## Alternatives considered

- **保留棘轮，只把存量清到 0 而不改门禁** — 改动最小，也不影响上游同步。否决理由：棘轮的存在前提是「存量不可修」；清零后它只剩副作用——改老文件不会被拦，而上游同步仍在制造「新增文件」把红 CI 推到合并之后。门禁与欠账状态必须一起收敛。
- **整目录检查但排除 `test/` 中的夹具** — 可减少一批夹具引起的错误。否决理由：夹具属于测试代码，正是 `as` 不重叠、字段漂移最容易堆积的地方；排除它们等于把刚清掉的盲区原样挖回来。
- **用 `as unknown as` 批量抹平** — 一次改动就能清零，成本最低。否决理由：抹平后测试与真实类型的漂移永久隐身，等于把 172 处错误变成 0 处可见 + 未知数量的契约谎报；本次仍然在替身边界保留了少量 `as unknown as`，但每一处都能说清边界在哪。
- **改 `web/src/**` 一并修掉 Findings 里的四处不一致** — 最彻底。否决理由：四处都涉及生产行为（字段名、行数据结构、清理语义），需要单独的回归与用户验收；混进类型清零会让「只改类型」的承诺失效，也让每个分类提交无法独立验证。

## Consequences

- **收益**：测试文件与生产代码同处一个类型门禁下；新增测试、修改老测试、同步上游带来的类型错误都在推送阶段暴露，不再等到合并后或永远不暴露。`bun run typecheck:test` 从「量化欠账」变成「门禁」，本地与 CI 用同一命令。
- **代价与已知上限**：
  - 上游同步变严格：上游带来的测试文件如果类型不干净，会直接卡住 `work` 的 CI（此前只有首次引入的文件会被拦）。这是整目录门的必然代价，处理方式沿用质量门笔记里的收尾流程。
  - 92 处 `expect` 相关改动集中在类型层，但仍有几处断言被改写（`referenceNodeIds`、`storyboard characters`、`metadata.title` 的线格式断言、技能最小引用），它们现在描述的是运行期真实行为而非类型声明；Findings 里的 src 不一致修掉后，这些断言要跟着回到类型声明。
  - `web/test/types/bun-query-imports.d.ts` 与三处 `@ts-expect-error` 是 tsc 能力边界的显式标记；Bun 若支持在这些形态下保留类型，应优先删掉它们。
- **验证**：`bun run typecheck:test` 退出码 0、零诊断；`bun run test` 2546 通过 / 0 失败 / 347 文件（与清零前一致），`expect` 调用数 28275 未减少；`bun run typecheck`、`bun run build`、`bun run lint`、`bun run test:gate` 全部通过。
