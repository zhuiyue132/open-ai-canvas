# Agent Note: work 主线保护：ruleset 禁止强推，同步模式收敛为 merge

Status: implemented

## Problem

二开主线的保护此前只存在于文档里：`docs/AGENT_LOCAL_DEVELOPMENT.md` 写着"不要在 `work` 上强推"，但仓库没有任何机械约束，`work` 也没有分支保护（`gh api .../branches/work/protection` 返回 404，rulesets 为空）。一次误敲的 `git push --force` 就能把主线改写到本地状态，冲掉别人（或另一个 Agent）已推送的提交；而每日上游同步默认就是"合并后推 `work`"，被强推冲掉的那批提交不会自动回来。

同一个问题在同步工作流里有第二种形态：`fork-sync-upstream.yml` 提供 `work_mode=rebase` 选项，它用 `git rebase` + `git push --force-with-lease` 把上游提交排到前面。这条路径要求改写远端历史，与"主线只能快进"的期望直接矛盾。

还发现"保护看起来生效"的最常见误判：`git push --dry-run --force` **不会**校验 ruleset（本地就短路成"Everything up-to-date"或"forced update"），拿它当验证手段会得出错误结论。

## Decision

`work` 上挂一个仓库级 ruleset：

- 名称「work 主线保护」，`target: branch`，`enforcement: active`，条件 `refs/heads/work`，唯一规则 `non_fast_forward`（禁止非快进推送）。`bypass_actors` 为空：仓库管理员也必须遵守。
- 不加"禁止删除"：`work` 是仓库默认分支，GitHub 本身不允许删除默认分支，这条规则是装饰。
- 不加"要求 PR"或"要求状态检查"：本仓库的日常提交直推 `work`，同步工作流也用同一个 PAT 推；要求 PR 会同时打断这两种路径，而"要求状态检查"对直推无效（检查在推送之后才跑）。质量门改由 `quality.yml` 的 push 触发承担，见 [二开主线的质量门](2026-10-15-quality-gates-on-work.md)。

同步工作流相应收敛为只用 merge：

- `work_mode` 的选项由 `merge | rebase | none` 变为 `merge | none`，删除 `git rebase` 分支与 `--force-with-lease` 推送。用 `git rebase` 产生的本地分歧因此不再可能被推上去，冲突仍然走"中止合并 + 开 issue"的既有路径。
- 文档补上应急出口：确实需要重写历史时，先 `gh api -X PUT .../rulesets/<id> -f enforcement=disabled` 停用规则，做完再改回 `active`；并写明 `--dry-run` 不能用来验证规则。

## Alternatives considered

- **只加"要求 PR + 状态检查"的经典分支保护** — 这是最标准的做法，能把质量门和评审一起强制执行。否决理由：本仓库单人二开、日常直推 `work`，`fork-sync-upstream.yml` 也用 PAT 直推；要求 PR 会在同步与日常提交两条路径上同时制造失败，而 ruleset 的"要求状态检查"对直推不生效（检查在推送后执行），等于既打断工作流又拿不到保护。
- **保留 `rebase` 同步模式，给它配置 bypass** — 既保住历史线性化的能力，又不影响日常推送。否决理由：ruleset 的 bypass 只能按角色/用户/App 配置，而同步用的是仓库管理员的 PAT，给管理员开 bypass 等于规则对唯一的使用者失效；真正需要线性历史时，临时停用规则是更诚实的做法，也留下审计痕迹。
- **不改同步工作流，等 `rebase` 真的失败再处理** — 改动最小。否决理由：留着一个必然失败的选项，失败信息会误导（看起来像权限或网络问题），而排查成本落在未来的自己身上。
- **用本地 pre-commit 钩子代替服务端规则** — 零服务端配置，能挡住本机的误操作。否决理由：钩子不随仓库分发（`.git/hooks` 不进版本控制），换机器就失效，也拦不住另一个 Agent 或脚本发出的推送。
- **把保护做成"禁止删除 + 禁止强推"两条** — 更完整。否决理由：`work` 是默认分支，GitHub 已经不允许删除它，多加一条只会让人误以为存在本不存在的风险。

## Consequences

- **收益**：主线改写从"靠自觉"变成服务端拒绝，任何 Agent 或脚本的误操作都拦得住；同步工作流只剩一条必然可用的路径（merge），失败信息不再有歧义；文档里"不要在 work 上强推"这条约定第一次有了机械兜底。
- **代价与已知上限**：
  - 需要重写 `work` 历史时必须先停用规则（多一步人工操作），这是有意的摩擦。
  - `work_mode=rebase` 的能力消失，上游提交不再能排到本地提交之前；需要线性历史时只能临时停用规则后手工 rebase。
  - 规则不覆盖 `main`（它是上游纯镜像，同步工作流用不带 `--force` 的推送，污染时报错停摆）。
  - 未加"要求 PR/状态检查"：质量门与主线保护是两套机制，提交仍然可以先落地、再由 CI 报错——CI 失败不会阻止推送。
- 重访信号：若将来出现第二位协作者或需要保护 `main`，再评估"要求 PR + 必需状态检查"的组合。

## Verification

- 规则存在：`gh api repos/zhuiyue132/open-ai-canvas/rules/branches/work` 返回 `non_fast_forward | ruleset: Repository/25163371`。
- 规则真的拦得住：在本地与远端 SHA 相同的状态下执行真实的非快进推送 `git push --force origin HEAD~1:refs/heads/work`，被服务端拒绝并返回 `! [remote rejected] ... (push declined due to repository rule violations)`，随后 `git ls-remote origin refs/heads/work` 仍为原 SHA。
- 反例已确认：同一条命令加 `--dry-run` 时 git 不向服务端提交更新，输出 `forced update` 且退出码为 0——因此验证必须用真实推送（用 `HEAD~1` 造成真实非快进，且失败时不改变远端）。
- 同步工作流：`bash -n` 通过，`grep` 确认除说明性注释外不再有 `rebase` / `force-with-lease` 代码路径，YAML 可解析。
