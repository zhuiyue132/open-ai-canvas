# Agent Note: 诊断包由用户触发、默认脱敏，并用硬上限替代全量采集

Status: implemented

## Problem

普通用户遇到页面报错、任务失败或生成卡住时，无法在不打开开发者工具的前提下描述链路。开发人员需要从一次操作还原「前端事件 → HTTP 请求 → 后端业务任务 → 模型上游请求 → 响应或失败」的对应关系，而这段链路天然聚集敏感内容：提示词、素材、Cookie、密钥。让用户手工收集日志既不可复现，也让脱敏无从实施。

## Decision

诊断包只能由用户触发，一次导出一个 ZIP：入口是 `web/src/pages/settings/diagnostics-panel.tsx`，请求走 `web/src/services/diagnostics/diagnostics-api.ts`，服务端聚合与打包在 `backend/internal/app/diagnostics.go`，包内包含前端上下文、当前用户有权访问的后端记录与 `manifest.json`。

默认脱敏，MVP 不提供加入提示词、截图或其他敏感数据的选项；包内不含服务器数据库、环境变量、进程日志与宿主机文件。关联 ID 串起前端事件、HTTP 请求、后端任务与上游调用，服务端只导出当前用户有权访问的记录。

体量有硬上限：时间范围 24 小时、前端事件 500 条、任务 100 条、任务日志 2,000 条、上游调用 1,000 条、ZIP 10 MB。触顶时在 `manifest.json` 写入 `truncated: true` 与各数据源的截断数量，并按固定顺序降级：优先保留错误事件、选中任务与最接近错误的记录；体积超限时依次移除普通信息事件、成功请求、冗长堆栈。敏感字段规则不因体积压力放宽。

导出失败不影响原任务与用户数据，前端给出可操作错误而不是笼统的「系统错误」。

## Alternatives considered

- **自动上传到客服、工单或第三方错误平台** — 排障最省事，省掉用户下载再提交的一步。否决原因是出站数据边界与授权链路尚未定义，而诊断包已经能靠人工提交闭环；自动上传属于第二阶段能力。
- **全量采集控制台输出、键盘输入、操作录像，并把提示词与截图一并入包** — 复现率最高，很多"用户说卡住"的场景能直接看到现场。否决原因是它把诊断包变成最大敏感数据出口；第一阶段只交付能安全下载的脱敏包，增强能力按后续阶段规划。
- **把诊断包当作生产可观测性与告警系统** — 可省去额外监控投入，用同一份数据同时服务用户与运维。否决原因是诊断包是用户触发的单次快照，常驻采集与留存会带来存储和隐私成本，超出诊断职责。
- **不设上限，导出全部匹配记录** — 实现简单，不需要截断与降级逻辑。否决原因是导出会同时拖慢后端并让包不可提交，规模上限与明确降级顺序是可用性前提。

## Consequences

- **收益**：排障不要求用户理解日志；默认脱敏加硬上限让「能导出」与「安全边界」并存；跨用户越权与脱敏都有用例钉住；导出失败不牵连原任务。
- **代价与已知上限**：没有自动上传与提示词、截图，部分问题仍需开发人员向用户追加材料；体量上限会截断长链路或长堆栈，重访信号是"截断后无法定位根因"反复出现。

## Verification

- `cd backend && go test ./internal/app/ -run Diagnostic -count=1`：`TestExportDiagnosticBundleRedactsSensitiveValues` 钉住默认脱敏，`TestExportDiagnosticBundleRejectsForeignTask` 钉住跨用户任务拒绝。
- 归集与打包实现：`backend/internal/app/diagnostics.go`；前端入口与请求层：`web/src/pages/settings/diagnostics-panel.tsx`、`web/src/services/diagnostics/diagnostics-api.ts`。
- API 形状、脱敏字段表、诊断包格式与分阶段计划见上游遗产 `docs/design/user-diagnostic-bundle.mdx`（只读）。
