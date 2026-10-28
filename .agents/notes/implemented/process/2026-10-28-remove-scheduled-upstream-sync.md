# Agent Note: 移除定时上游同步 workflow，上游同步回到手工步骤

Status: implemented

## Problem

`.github/workflows/fork-sync-upstream.yml` 的设计是：每天 02:00（北京时间）把 `upstream/main` 合并进 `work`，同时镜像 `main` 与上游 tag；遇到冲突就 `--abort`、开 issue、让 job 变红。设计本身没问题，但在这台 fork 上它从来没有真正完成过一次同步：

- **每晚都在同一步失败**：`gh run list --workflow fork-sync-upstream.yml` 最近 6 次定时运行（2026-10-22 至 2026-10-27）全部 `failure`，每次 19~26 秒。失败步骤固定在 `Report conflict`，前置的 `Sync work` 已经因为冲突中止——也就是说 `work` 早已偏离上游几十个提交，自动合并每天都撞同一批冲突。
- **冲突报告链路是断的**：`Report conflict` 用 `gh issue create/comment` 上报，但 fork 关闭了 Issues（`gh issue list` 直接返回 `has disabled issues`），所以那一步必然失败，冲突文件清单也没有真的送到人眼前。
- **推送会被拒**：那次运行的注释写的是「未配置 SYNC_TOKEN，本次同步只要包含 .github/workflows 改动就会被 GitHub 拒绝」。上游经常改 `.github/workflows/*`，没有 PAT 时连无冲突的同步也推不上去。
- **安全阀失效**：workflow 的 preflight 负责把上游 `publish-images.yml` 强制保持 `disabled_manually`，但那一步只在本 workflow 运行时执行；它常年失败在同步步骤，这项保护也就只剩「上次成功时留下的状态」。

结果是一个每天都在消耗 Actions 额度、制造红色告警，却不产生任何同步结果的自动化。同一时间，v1.7.2 的同步是手工做的（[同步笔记](./2026-10-28-upstream-sync-v1-7-2.md)），冲突按照刚写下的 [冲突结算规范](./2026-10-28-upstream-conflict-resolution-policy.md) 结算。

## Decision

删除 `.github/workflows/fork-sync-upstream.yml`，上游同步固定为手工步骤，写进 `docs/AGENT_LOCAL_DEVELOPMENT.md` 第 3 节：

- 一次同步 = `git fetch upstream --prune --tags --force` → `main` 只走 `merge --ff-only` 并对齐镜像 → `work` 只走 `merge`（解冲突后 `git push origin work`）→ 按需 `git push origin --tags`。
- 原 workflow 的两项职责改成手工检查：同步前 `gh workflow list --repo zhuiyue132/open-ai-canvas --all` 确认 `Publish container images` 仍是 `disabled_manually`；同步后跑第 3 节收尾清单（`typecheck:test` 修到 0、`verify-feature-map`、`check-env-docs.py`、笔记三线、`go test` + `bun run build`/`bun test`）。
- 冲突结算规则原样保留在第 3 节，仍是同步时的唯一依据；`AGENTS.md` 第 7 节把「手工同步 + 同步前复查发布流水线 + 同步后收尾」写成约束。
- 文档里其余指向该 workflow 的表述就地更新：`docs/index.md` 的入口描述、`work-branch-protection`（曾经的 rebase 选项）、`fork-release-identity`（preflight 与 `publish-images.yml` 的禁用关系）、`documentation-governance`（「每日自动同步」这一前提）、冲突结算规范（issue 报告链路已不存在）。

## Alternatives considered

- **修好它（配置 `SYNC_TOKEN`、打开 Issues、让 preflight 容错）**：能恢复自动同步，夜间无人值守地跟上上游，也保住了 preflight 对 `publish-images.yml` 的守护。否决理由：它撞的是内容冲突而不是配置问题——`work` 与上游持续在 README、`docs/index.md`、欢迎页与功能地图上分叉，这些必须在合并时逐块做策略判断，自动化只能中止；只要 fork 仍有自己的内容边界，这个 workflow 就注定每天中止一次，配置只是把「报告失败」变成「成功报告失败」。
- **保留 workflow 但去掉定时，只留 `workflow_dispatch`**：仍然可以一键同步，人工触发时撞冲突也能看到冲突清单。否决理由：它依赖的 `SYNC_TOKEN`、Issues、preflight 三项都是这台 fork 上的失效假设（Issues 关闭、无 PAT），每次手动触发都会失败在报告步骤；保留下一个跑不通的入口只会让人以为「还有自动化可用」。
- **改成「只在无冲突时合并、有冲突静默退出」**：不产生红色告警，降低噪音。否决理由：静默退出会让「上游已更新但 `work` 没跟上」变成看不见的状态；显式的红色失败至少每天提醒一次。真正的修法是让同步有人负责地完成，而不是让它安静地不做。
- **把 preflight 挪到一个独立的小 workflow 里保留守护**：`publish-images.yml` 的禁用状态可以继续被自动复查。否决理由：那一步只是 `gh workflow list` 的一次比对，同步前手工跑一条命令即可；为它单开一个 workflow 会增加 Actions 表面积与 token 依赖，收益不足。
- **彻底不管 `publish-images.yml` 的禁用状态**：少一条检查。否决理由：上游那份流水线按 `push: main` 与 `tags: v*` 触发，一旦被启用，下次手工同步把 `main`/tag 推上去时就会往 `ghcr.io/zhuiyue132/*` 重跑几十次镜像构建，代价远高于一次 `gh workflow list`。

## Consequences

- 收益：不再有每天一次的红色告警与 Actions 额度消耗；「上游同步怎么做」只剩一个入口（第 3 节），不会再出现「自动化在跑但等于没跑」的错觉；同步时对 `work` 的偏离必须由人按结算表处理，二开策略不会在夜里被自动改写。
- 代价：上游跟进变成人工动作，没有定时提醒。上游发版后若长时间不同步，`work` 会累积更大的合并面（本次 76 个提交即是一例）。重访条件：若哪天需要无人值守同步，正确做法是「自动合并 + 冲突即中止并通知到一个可用渠道」，而不是恢复一个报告链路已断的 workflow。
- 代价：`publish-images.yml` 的守护从自动变成人工检查，漏看一次就可能在下次同步触发上游镜像构建。
- 已知上限：`main` 镜像与 tag 同步也一并改为手工，本地忘记跑就不会更新镜像分支；`docs/AGENT_LOCAL_DEVELOPMENT.md` 第 3 节把这三条命令写成固定顺序，但不提供任何脚本封装——真的需要时再加，避免又出现「一条命令里藏着三项判断」。
- 恢复方式：git 历史里保留了该 workflow（本次提交的父提交）；要恢复就把它取回并按当时的失败原因补 `SYNC_TOKEN`、打开 Issues、让 preflight 在冲突时也能执行。

## Verification

- `git rm .github/workflows/fork-sync-upstream.yml` 后 `.github/workflows/` 只剩 `publish-images.yml`、`publish-fork-images.yml`、`quality.yml`、`verify-feature-map.yml`、`verify-notes.yml`，五个文件均用 `python3 -c "import yaml; yaml.safe_load(open(...))"` 解析通过。
- 删除前的事实依据：`gh run list --repo zhuiyue132/open-ai-canvas --workflow fork-sync-upstream.yml --limit 6` 六次 `failure`；`gh run view 40590919469` 的步骤列表显示 `Sync work` 通过（内部已 `--abort`）、`Report conflict` 失败，注释为「未配置 SYNC_TOKEN」；`gh issue list --repo zhuiyue132/open-ai-canvas` 返回 `has disabled issues`。
- `gh workflow list --repo zhuiyue132/open-ai-canvas --all` 确认 `Publish container images` 当前为 `disabled_manually`，与第 3 节手工检查的期望一致。
- 引用同步：`.github/workflows/fork-sync-upstream.yml` 在 `docs/`、`AGENTS.md`、`.agents/notes/` 的引用全部更新为本笔记或「手工同步」；`docs/index.md` 的 `AGENT_LOCAL_DEVELOPMENT.md` 描述改为手工同步与冲突结算规则。
- 决策笔记三线校验与 `verify-feature-map` 通过。
- 未做：删除提交合并到 `work` 之后 GitHub 上「Fork sync upstream」条目的消失（`work` 是默认分支，推送后 Actions 列表会移除该 workflow）与一次完整手工同步的演练，均需推送后观察。
