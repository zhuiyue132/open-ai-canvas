# Agent Note: 决策记录由 .agents/notes 承载，docs 的决策与设计路径冻结为上游遗产

Status: implemented

## Problem

决策与设计理由分散在 `docs/adr/`、`docs/design/`、`docs/plans/`、`docs/superpowers/specs/`（共 40 篇 Markdown）里，与实际代码的对应关系靠人工维持，引用已经开始腐烂：`README.md` 与 `docs/index.md` 指向的 `docs/content/docs/overview/docker.mdx`、`overview/quick-start.mdx`、`canvas/canvas-node-manual.mdx`、`progress/todo.mdx` 都不存在，`docs/content/docs/backend/meta.json` 还列着未建立的 `protocol-plugins`、`canvas-data-structure`。这批文档同时缺三样东西：被否决方案的最强论据、决定失效时的重访条件、以及任何机械校验——`.github/workflows/quality.yml` 完全不检查 `docs/`，写作纪律只存在于散文约定里。

上游对同一批路径的写入频率决定了"本地删改"不可行：近 30 天 `docs/content/docs/` 有 172 次提交（全仓 531 次），`docs/design/` 14 次，`docs/adr/` 2 次。

## Decision

`.agents/notes/` 是决策记录的唯一真相源，路径即身份：`{lifecycle}/{class}/yyyy-mm-dd-topic.md`，`lifecycle` 取 `proposed`、`implemented`、`rejected`、`archived`，`class` 取 `feature`、`bug-fix`、`simplification`、`architecture`、`process`、`testing`。写入门槛、目录扫描、相对链接、头块与必备节由 `.agents/skills/write-notes-like-deepseek/` 定义，该 skill 随仓库分发（项目级安装）。

`docs/adr/`、`docs/design/`、`docs/plans/`、`docs/superpowers/specs/` 是上游遗产：只读，新决策不写入，也不作为真相源；文件保留在树中，改动只来自上游合并。需要引用其中的事实时按路径引用，不复制正文。

参考类文档继续按原约定维护，它们不属于决策笔记：`docs/content/docs/overview/features.mdx`、`docs/content/docs/backend/code-map.mdx`、`docs/content/docs/progress/pending-test.mdx`、`docs/content/docs/backend/http-api.mdx`、`docs/content/docs/backend/backend-database.mdx`，以及协议文档 `backend/internal/protocol/docs/*.md`、插件接口文档 `plugin-packages/*/docs/interface.md`、技能库 `backend/builtin/*/SKILL.md`。

集中索引的边界：`.agents/notes/` 下不建 `INDEX.md`（校验脚本直接报错），检索靠分类树与 `rg`；`docs/index.md` 与 `README.md` 的导航只指向参考类文档。

校验门的入口是三个脚本，从仓库根目录执行：

```bash
bun run .agents/skills/write-notes-like-deepseek/scripts/verify-agent-note-tree.ts
bun run .agents/skills/write-notes-like-deepseek/scripts/verify-agent-note-format.ts
bun run .agents/skills/write-notes-like-deepseek/scripts/verify-archived-agent-notes.ts
```

## Alternatives considered

- **物理删除 40 篇遗产文档** — 树最干净，检索不再撞到旧体系，`docs/` 的失效链接可以一次性清零。否决理由：上游近 30 天对 `docs/content/docs/` 有 172 次提交、`docs/design/` 有 14 次，删除后每轮同步都会在 modify/delete 上冲突（自定义 merge driver 对 modify/delete 不生效），只能维护"废弃路径清单"并在每次合并后重复删除，把每日自动同步变成持续人工介入。
- **沿用 `docs/adr/` 并只补脚本门与链接检查** — 改动最小，能立刻消除失效引用与格式漂移，且 ADR 已有的「状态／决定／考虑过的方案」骨架接近目标结构。否决理由：该目录只有"已接受"一种状态（现存 10 篇全部如此），被否方案压缩在正文里，没有 proposed/rejected 生命周期；同时上游会继续向这些路径新增条目，真相源会在两套体系间来回漂移。
- **把 40 篇按笔记模板重写进 `.agents/notes/`** — 单一体系最彻底，检索一致性最好。暂不做：逐篇重读历史动机、路径与验证细节的工程量集中在一次性迁移上，期间两套并存，改写还引入事实失真风险；若之后要收敛，作为独立决策处理。

## Consequences

- **收益**：非平凡改动的"为什么、放弃了什么、怎么证明"有固定路径与结构，且机械可校验——目录层级、class 名、文件名日期、头块、必备节、备选节、归档封印都由脚本判定，不依赖自觉。
- **代价与已知上限**：
  - 历史决策仍留在上游遗产路径，检索需要同时查 `.agents/notes/` 与 `docs/adr|design|plans`；重访信号是 `.agents/notes/implemented/` 覆盖主要模块后，遗产篇数不再影响检索结果。
  - `.agents/notes/` 的校验在 CI 与本地 pre-commit 钩子中执行；直接推到 `work` 的提交绕过 PR 门，属于已知盲区。
  - 上游给 `docs/adr/` 新增条目会照常合入并留在树中，处于只读遗产范围，不参与本仓库的决策检索。

## Verification

- 三线校验从仓库根目录执行通过：`verify-agent-note-tree.ts` 输出 `ok: 1 note(s) tree and relative links verified`，`verify-agent-note-format.ts` 输出 `ok: 1 note(s) verified`，`verify-archived-agent-notes.ts` 在无归档封印时输出 `ok: 0 archived note(s) verified`。
- 门确实会拒绝：把笔记放进未列入封闭集的 class 目录时，树校验与格式校验同时以 `unknown class folder` 退出码 1。
- CI 落点为 `.github/workflows/verify-notes.yml`，在 `pull_request` 与 `work` 分支推送时执行上述三线。
- 冻结范围可核对：`git ls-files -- 'docs/adr/**' 'docs/design/**' 'docs/plans/**' 'docs/superpowers/**' | grep -cE '\.mdx?$'` 输出 `40`。
- 写本篇前检索 `.agents/notes/` 的 proposed、implemented、rejected：仓库内只有本篇，无需要合并、互链或归档的既有笔记。
