# Agent Note: Agent 媒体用例的后台写者隔离

Status: implemented

## Problem

`internal/app` 里三个 cloud agent 媒体用例会随机失败，报错是创作记录的条件更新冲突
`ErrCreationConflict`（"数据已被更新，请刷新后重试"）：`TestCloudAgentMediaCleanupUsesPersistedTaskTarget`、
`TestCloudAgentMediaCompletionKeepsGenerationAndWritebackFailures`、
`TestCloudAgentCanvasPatchesPersistDraftSubmissionAndAllTerminalStates`，以及紧接着暴露的第四个
`TestCloudAgentMediaApprovalCreatesNodeReferencesAndResult`。现象是**每次失败的都是同族里不同的用例**
（3 次全量运行分别出现 1、2、1 次失败），单独跑同一用例 3/3 通过，amd64 的 CI 上看不到——
典型的时序竞态，只在较慢的 arm64 容器里稳定暴露。

根因不是产品缺陷，而是**用例里同时存在两个写者**：

1. `DecideCloudAgentApproval(approve)` 对媒体任务**立即返回**，并在后台启动等待者
   （`cloud_agent_runtime_media.go` 的 `finishApprovedCloudAgentMedia`）：它 `waitCloudAgentTask`
   轮询到任务终态后再恢复运行。
2. 用例把任务直接改成终态后，又用 `advanceCloudAgentByID` 手动推进同一条 run，期望由这次推进
   完成回写/清理。

两个写者各自读一次 `revision`，再各自做 `UPDATE ... WHERE revision = ?`
（`repository.MutateCloudAgent`）；条件更新只有一个能中，输的一方拿到 `ErrCreationConflict`，
用例把它当失败 `t.Fatal`。生产侧对这种冲突是**有预期**的：调度器
`advanceCloudAgents` 遇到它就 `noteCloudAgentSchedulerConflict` 后 `continue`。

## Decision

用例在"要自己驱动回写"时，必须先停掉后台等待者，让显式推进成为唯一写者：

- 新增测试 helper `isolateApprovedMediaWaiters(t, s)`（`internal/app/cloud_agent_media_test.go`），
  内部调用服务已有的 `closeApprovedCloudAgentMediaWaiters()`（取消 + 等待 + 关闭后续启动，
  与服务停机的清理路径同一个方法）。
- 在共享的审批 helper `approveAgentMediaDraft` 里，`DecideCloudAgentApproval` 之后、
  `advanceCloudAgentByID` 之前调用它；`TestCloudAgentMediaApprovalCreatesNodeReferencesAndResult`
  因为直接调 `DecideCloudAgentApproval`，单独调用一次。
- 后台等待者本身的行为保持由异步用例覆盖（`cloud_agent_approved_media_cancel_test.go`、
  `cloud_agent_runtime_e2e_test.go`、`cloud_agent_runtime_live_regressions_test.go`），
  不在这些用例里重复验证。

## Alternatives considered

- **让用例容忍 `ErrCreationConflict`**（照抄调度器的 `noteCloudAgentSchedulerConflict`）：改动最小，
  也符合"生产把冲突当正常竞态"的语义。否决理由：容忍只消掉了报错，没有消掉顺序不确定性——
  后台写者仍可能在断言**之后**继续写同一条 run，用例读到的可能是中间状态；那是把稳定失败换回偶发失败。
- **在推进前等待后台等待者落定**：听起来最贴近生产顺序（先让后台完成，再断言）。否决理由：实测
  让 `TestCloudAgentMediaCleanupUsesPersistedTaskTarget` 变成**5/5 稳定失败**——等待期间后台
  已经把运行恢复完，用例想验证的 `finishCloudAgentCleanup` 路径不再被执行，等于换掉了被测对象。
- **在 fixture 层统一关闭等待者**（`agentMediaFixture` 里直接关）：一处改动覆盖所有媒体用例，
  不用逐个记得调用。否决理由：`cloud_agent_approved_media_cancel_test.go` 用的是同一个 fixture，
  它专门验证等待者与取消路径，统一关闭会把被测对象从它脚下抽掉。
- **改产品代码让 advance 路径重试冲突**：能同时解决生产里的同类竞态。否决理由：冲突是合法信号
  （另一写者已推进），生产已在调度层按正常竞态处理，重试会把语义从"报告冲突"改成"静默合并"，
  属于超出本次范围的运行时行为变更。

## Consequences

- **收益**：媒体用例的写入顺序确定——测试用显式推进驱动回写，后台等待者不再插队；同一族用例在
  arm64 容器上从"3 次全量运行 3 次出现失败"变为"3 次独立全量运行全绿"。
- **代价与已知上限**：
  - 隔离是**按用例**的：新写一个"审批媒体后再手动推进"的用例，需要自己调用
    `isolateApprovedMediaWaiters`，否则会重现同一个竞态。约定写在 helper 注释里，没有机械校验。
  - 这些用例从此不再覆盖"任务终态后由后台等待者自动恢复"这条路径，覆盖责任落在异步用例上。
  - 排查过程中确认另一个**与本次无关**的既有问题：`internal/app` 用 `-count=2` 重复执行时会有
    7 个用例瞬时失败（诊断包导出、轮询日志等），属重复执行不幂等，CI 只用默认 `count=1`，未处理。

## Verification

- 修复前（Go 1.26 / linux-arm64 容器，全量 `go test ./internal/app`）：3 次运行分别出现 1、2、1 次
  本族失败，报错均为 `数据已被更新，请刷新后重试`。
- 修复后：同容器 `go test ./internal/app -count=1` 连续两次独立运行 `ok`（224.5s、226.6s），
  另有一次 `go test ./internal/app` 也 `ok`（227.0s）；定向
  `-run "TestCloudAgentMedia|TestCloudAgentCanvasPatches|TestCloudAgentApprovedMedia" -count=5` 一次 `ok`（40.1s）。
- 反向验证：把隔离放在"等待后台落定"位置时，`TestCloudAgentMediaCleanupUsesPersistedTaskTarget`
  5/5 稳定失败（`cloud_agent_media_writeback_test.go:60` 的 unknown target 断言），据此否决了那个方案。
