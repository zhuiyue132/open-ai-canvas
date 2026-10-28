# Agent Note: 上游同步冲突按文件类别结算，规则固定写进运维文档

Status: implemented

## Problem

`work` 每天由 `.github/workflows/fork-sync-upstream.yml` 把 `upstream/main` 合并进来，冲突时 workflow 只做三件事：`--abort`、开 issue「上游同步冲突：work ← upstream/main」并列出冲突文件、让 job 变红。文档里只有**机制**（`docs/AGENT_LOCAL_DEVELOPMENT.md` 第 3 节：main 是纯镜像、work 只走 merge、冲突就中止），没有任何**内容规则**：哪个文件的冲突该取上游、哪个该取二开。

结果是同一条推理每次同步都要重做一遍。v1.7.2 同步（[同步笔记](./2026-10-28-upstream-sync-v1-7-2.md)）的 6 个冲突里，4 个不是文本重叠，而是两条既有决定正面相遇：README 是否承载赞助与致谢、`docs/index.md` 是否逐篇列举上游设计文档、欢迎页是否还有贡献者卡片、旧工作流视图的测试是否还有存在意义。当时的结算依据分散在四篇笔记（`sponsors-contributors-removal`、`documentation-governance`、`docs-versioned-in-repo`、`feature-map-as-verification-surface`）里，需要临时检索才能拼出结论。

风险不是抽象的：下一次同步时若「README 取上游整版」被当成省事的默认动作，刚删掉的赞助商表格、贡献者联系方式与共享演示密码会原样回来，而且 diff 看起来只是一次正常同步。

## Decision

把「上游实现、work 策略」这条分工落成按文件类别的结算表，写进运维文档并让三处指向它：

1. **`docs/AGENT_LOCAL_DEVELOPMENT.md` 第 3 节新增「冲突结算规则（work ← upstream/main）」**：9 类文件各一行（上游产品实现、根 README 展示内容、文档索引与参考文档、上游只读遗产、二开约定与工作流、版本身份、测试与夹具、上游已删除的模块、上游缺陷的二开修复），每行给出典型文件与结算方式，附判定顺序与收尾清单。第 4 节「手工同步」加一句“同样按该规则处理”，避免手工路径成为规则外的旁路。
2. **`AGENTS.md` 第 7 节加一条约束**：冲突按该表结算，不逐次重新论证；表里没有的新类别按「上游实现 + work 策略」保守处理，并在同一次同步里把规则补进表；解完冲突必须补跑 `bun run typecheck:test`、`verify-feature-map`、`check-env-docs.py`，非机械取舍写进同步笔记。`AGENTS.md` 是协作者与 AI 的入口，规则不能只活在 `docs/` 里。
3. **同步 workflow 的冲突 issue 正文引用规则**：issue 是人工介入的实际入口，正文直接给出规则位置、保守默认和推送前必跑的命令，收 issue 的人不需要先读完全部文档。

判定顺序固定为「查表 → 查既有笔记与 `AGENTS.md` → 保守默认 + 补规则」，避免每次都从「这次算不算例外」开始争论。

## Alternatives considered

- **冲突一律取上游（`git merge -X theirs`）**：同步最省事，`work` 与上游永久保持一致，二次同步不会累积冲突。否决理由：这会把二开策略全部抹掉——README 内容边界、部署身份（`scripts/fork-deploy-image.sh`）、文档真相源（`.agents/notes`）、`work` 分支保护配置都可能被上游版本覆盖，而产物看起来仍是一次成功的同步。
- **冲突一律取 work（`git merge -X ours`）**：绝不丢二开策略，diff 干净。否决理由：会静默丢掉上游功能——本次 76 个提交里的短剧流水线、推广中心、用户反馈正是这种“没冲突但被 ours 吞掉”的典型；测试与文档会与实现脱节，且没有任何报错。
- **只写进同步笔记，不改运维文档**：不增加文档表面积，笔记已经记录了本次每个冲突的取舍与理由。否决理由：笔记按日期归档、检索靠 `rg`，下一次同步的人（或 Agent）不会先读到它；规则需要一处固定位置，笔记负责解释“为什么”，不适合承担“该怎么做”。
- **写一条可在 CI 校验的硬规则（如 README 不得出现赞助商区块、`docs/index.md` 不得链接 `docs/adr`）**：可执行、能被门禁拦住。否决理由：本节多数条目是“这个区块属于策略还是产品内容”的判断，只有少数能文本化；在 `work` 上再挂一个只在同步后才有意义的检查，维护成本高于收益。重访条件：真的出现一次错误结算被推送到 `work`，再把其中可文本化的两三条做成校验脚本。
- **在 workflow 里自动按类别解决冲突（脚本 `checkout --ours/--theirs`）**：能进一步减少人工。否决理由：冲突粒度为文件，而策略粒度是文件内的区块——README 正是“上游产品内容 + work 内容边界”共存的文件，按文件取舍必然错；自动脚本还会掩盖「上游删除了 work 侧在用的模块」这类需要判断的情况。

## Consequences

- 收益：同步冲突从“每次重新判断”变成查表；二开策略被撤销需要显式改文档，而不是藏在一个看起来正常的 merge 里；收 issue 的人直接看到规则与推送前必跑的检查。
- 代价：多了一处需要随策略变化同步维护的表。新增二开策略（例如再删一类 README 内容、再加一个只读遗产目录）时要同时改 `docs/AGENT_LOCAL_DEVELOPMENT.md` 与对应笔记，否则表会落后于实际。
- 已知上限：表按文件路径分类，无法表达“同一文件内不同区块属不同策略”的全部情况——README 靠行内注明“上游产品内容保留、展示内容删除”来覆盖，其余文件遇到混合情况仍要人工判断并在同步笔记里补一行。收尾清单里的 `typecheck:test` 与功能地图校验是命令，不保证“新路由被登记得对”，只保证“没登记会被拦住”。
- 与既有决定的关系：不改变 [文档治理](../process/2026-10-15-documentation-governance.md) 与 [README 内容边界](../simplification/2026-10-15-sponsors-contributors-removal.md)，只是把它们的结论提升为同步时的默认动作。

## Verification

- `docs/AGENT_LOCAL_DEVELOPMENT.md` 第 3 节新增小节可被第 4 节、`AGENTS.md` 第 7 节与 workflow issue 正文三处引用；三处措辞指向同一张表。
- `.github/workflows/fork-sync-upstream.yml` 改动后用 `python3 -c "import yaml; yaml.safe_load(open(...))"` 解析通过，`jobs.sync.steps` 仍为 10 步、顺序未变。
- 决策笔记三线校验（`verify-agent-note-tree`、`verify-agent-note-format`、`verify-archived-agent-notes`）通过。
- 未做：让 workflow 在 Actions 上真实跑一次冲突分支（冲突路径需要上游真冲突才能触发），本次只验证 YAML 与文本路径。
