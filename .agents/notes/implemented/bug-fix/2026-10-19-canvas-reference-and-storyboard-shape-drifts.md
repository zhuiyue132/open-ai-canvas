# Agent Note: 画布参考字段与分镜角色形状的四处漂移

Status: implemented

## Problem

测试类型清零（[测试类型欠账清零](../testing/2026-10-19-test-typecheck-zero-debt.md)）时暴露出四处「类型声明与运行期数据不一致」的漂移。它们不是测试写错，而是生产代码两侧用了不同的名字/形状，类型系统因为展开写法、`any` 透传或 `as` 断言而没有拦住：

1. **节点级参考字段名分叉**：`canvas-workflow-builder.ts` 通过对象展开把参考写成 `metadata.referenceNodeIds`，而 `CanvasNodeMetadata` 只声明 `referenceAssetNodeIds`。后者是 `use-canvas-previs` / `use-canvas-node-operations` 读取的字段；前者在 `web/src` 里**没有任何读取方**，只有后端审批校验 `backend/internal/app/creation.go` 在读它。展开写法绕过 excess property 检查，所以类型没报错。
2. **分镜角色形状**：`storyboardRowsFromTask` 把模型返回的 `characters` 原样透传（实际是字符串数组），而 `StoryboardRow.characters` 声明为 `StoryboardCharacterReference[]`（带 `characterName`）。下游素材绑定、提示词编译、引用组都按对象读取，字符串进入后这些字段全部落空。
3. **清理工具的返回类型**：`clearMissingCanvasResources<T>(value: T): T` 会删掉失效的媒体定位字段，返回的对象并不等于 `T`；调用方（当时只有测试）只能按线格式断言。
4. **技能最小引用**：`normalizeAddedSkillReference` 对旧后端/测试桩返回的 `{skillId, isAdded}` 直接 `as unknown as Skill` 透传，而正式路径会补齐宽 `Skill` 的展示默认值。

## Decision

四处都改成「运行期数据满足声明的类型」，而不是放宽类型或继续加断言：

- `canvas-workflow-builder` 写 `metadata.referenceAssetNodeIds`（唯一 canonical 字段）；前端新增回归断言：该字段有值、旧字段 `referenceNodeIds` 不存在。
- `creation.go` 的审批校验读 `referenceAssetNodeIds`，为空时回退 `referenceNodeIds`。回退只为**已持久化的旧批准方案**（`ApprovedOperationsJSON` 存在 DB 里），不是给新写入留双写；新增 Go 用例覆盖旧字段仍可通过校验、且参考被改仍会拒绝。
- `storyboardRowsFromTask` 新增 `normalizeStoryboardCharacters`：字符串转 `{ characterName }`，对象保留 `characterAssetId/characterVersionId/characterDescription/characterImageNodeId`，`name` 作为 `characterName` 的别名，空白名与非法项丢弃。下游不再需要兼容字符串。
- `clearMissingCanvasResources` 改为 `(value: JsonValue) => JsonValue | undefined`，返回「清理后的线格式」，不再声称同型；调用方断言不再需要 `as unknown as`。
- `normalizeAddedSkillReference` 对最小引用也补齐默认值（`skillName/description/versionId/version` 空串等），返回值真的是 `Skill`，删掉 `as unknown as`。

## Alternatives considered

- **前端继续写 `referenceNodeIds`，只补 `CanvasNodeMetadata` 的类型声明** — 改动最小，不动后端。否决理由：这等于把「后端审批用的旧名字」提升成正式字段，而预演台/引用组消费的仍是另一个字段，节点级参考会永久存在两份语义相同的名字；类型里加注释也挡不住下一次有人读错。
- **前端同时写两个字段** — 前后端都不用改，最省事。否决理由：双写让「哪个才是真相」永远需要查文档；而且 `metadata` 会进入画布同步与快照哈希，重复字段直接增大 wire 体积与冲突面。
- **后端只读新字段，不做回退** — 最干净。否决理由：已批准方案的 `ApprovedOperationsJSON` 是持久化数据，升级后旧方案的提交会因为「参考数量不一致」被拒；这属于必须兼容的存量数据（不是可以随手丢弃的旧 API）。
- **分镜角色按字符串继续透传，只把类型放宽成 `Array<string | StoryboardCharacterReference>`** — 不用改数据。否决理由：下游所有读取点（素材绑定、提示词、引用组）都要加分支，且字符串分支永远拿不到 `characterAssetId`，等于把缺陷固化进类型。
- **`clearMissingCanvasResources` 直接删掉（生产无调用方）** — 少一个维护点。否决理由：它是上游「素材缺失恢复」能力的纯函数部分，后续接线概率高；删除会在下次上游同步时产生 delete/modify 冲突。改为诚实签名即可。

## Consequences

- **收益**：节点级参考只有一个 canonical 字段，预演台/引用组和后端审批校验读到同一份数据；分镜角色在任何入口（模型字符串、对象、旧任务）都归一化成同一形状；两处 `as unknown as` 的谎报消失。
- **代价与已知上限**：
  - 后端保留了对旧字段的回退读取，属于为持久化旧数据准备的兼容层；等确认没有活跃的升级前方案后可以删掉（删除时同步删 `TestCreationMediaScopeAcceptsLegacyReferenceNodeField`）。
  - 分镜角色归一化会**丢弃**空白名与非法项（此前是原样透传），模型返回脏数据时行内角色数量可能变少；这是有意的，避免下游把 `undefined` 当成角色名。
  - 已生成的历史画布里，旧节点仍带 `metadata.referenceNodeIds`；预演台读不到这些旧引用。没有做数据迁移：这些节点本来就没有被 previs 消费过，等下次编辑/重新生成时自然写成新字段。
- **验证**：`bun run typecheck:test` 0 诊断；`bun run test` 2547 通过 / 0 失败（新增分镜归一化用例与参考字段回归断言）；`bun run build` / `lint` 通过；后端 `go test ./...` 33 包通过（含新增 legacy 字段用例），`gofmt` 干净。
