# Agent Note: 补上游漏登记的 audio 技能分类，并格式化其 web 变更

Status: implemented

## Problem

每日同步把上游 `adc6f42e`（fix(canvas): 画布与音频 - 修复保存冲突并完善豆包音频配置）合进 `work` 后，
本仓库 CI 的两个作业同时变红，`work` 主线不再绿：

- **Backend checks**：6 个 `internal/skills` 用例加 1 个 `internal/handler` 用例失败，报
  `内置技能 doubao-audio-prompt 分类无效: audio`。该提交新增的内置技能
  `backend/builtin/豆包音频提示词/SKILL.md` 写了 `tag: audio`，但白名单
  `skillCategoryLabels`（skills.go）与 `skillCategoryLabels` 驱动的 `skillCategories()`
  都没有 `audio`。内置技能加载失败会让 `/api/skills/presets` 直接返回 500——
  这是**运行时破坏**，不只是测试问题。
- **Web checks**：`Check formatting` 失败，`src/components/audio-settings-panel.tsx` 与新增的
  `test/audio-settings-panel.test.tsx` 不符合本仓库 Prettier 规则（同一批里被修改的
  `canvas-node-prompt-panel.tsx`、`generation-contract.ts` 被"遗留未格式化"分支正确跳过）。

关键是这不是本仓库的改动造成的：**上游同一提交的 CI 也是红的**（`Quality checks` 的 Backend 与 Web
两个作业同样失败），也就是新装的闸门正确抓到了上游的问题。但"上游的问题"不等于可以放着不管：
主线常红会让闸门变成噪声，而 release 又必须打在绿的提交上（首个 `fork-v1.6.8.3.1` 就是为此
打在合并前的 `aeda0e65` 上的）。

## Decision

在 fork 里补齐上游漏登记的分类，让 `work` 恢复绿，改动限定在"上游修复必然会做的那几处"，
以便上游修复同步进来时自然收敛：

- `backend/internal/skills/skills.go`：`skillCategoryLabels` 增加 `"audio": "音频"`，
  `skillCategories()` 在 `others` 之前加一项（保持"其他"排最后）。注释写明来源与"等上游修复对齐"。
- `backend/internal/skills/skill_curation_test.go`：`TestSkillCurationDisabledSnapshot` 的期望快照
  包含固定分类顺序，同步加上 `{"value":"audio","label":"音频"}`。
- `web/src/pages/skills/skill-catalog.ts`：`fallbackSkillCategories` 增加 `{ value: "audio", label: "音频" }`。
  这一处不是可选项：技能广场按 `skill.tag` 与分类列表分组，分类缺失会让该技能在分组视图里直接消失。
- `web/src/components/audio-settings-panel.tsx`、`web/test/audio-settings-panel.test.tsx`：
  用仓库自己的 Prettier 规则格式化（`prettier --write`），不改任何逻辑。

不做的事：不在 fork 里改上游那份 `SKILL.md` 的 `tag`（那是改变上游的设计意图），也不推迟到
"上游修好再说"（绿的主线是这个仓库自己的门与发布前提）。

## Alternatives considered

- **把技能里的 `tag: audio` 改成已有分类（如 `creative`）**：一行改动、不用碰分类列表与前端，
  冲突面最小。否决理由：那是**改变上游的设计意图**——上游显然想要一个独立的音频分类，
  修 tag 等于把它的技能塞进"创意设计"；而上游的修复若补分类，我们改动的那一行会被上游版本
  与我们的版本来回覆盖，反而更容易在后续同步里迷失。
- **只加后端白名单（`skillCategoryLabels`）**：7 个失败用例都会转绿，改动最小。否决理由：
  分类列表 `skillCategories()` 与前端 `fallbackSkillCategories` 都没变，技能能加载但会在
  技能广场的分组视图里消失——把"接口 500"换成了"技能看不到"，是更隐蔽的坏法。
- **等上游修复后再同步**：零冲突面，最"干净"。否决理由：`work` 在自己仓库里持续红着，
  闸门失去信号意义、发布被阻塞，而等待时长不可控（上游 CI 已红 1.5 小时无修复）。
- **把上游那个提交从 `work` 回滚掉**：立刻恢复绿且完全不碰上游文件。否决理由：回滚会连带丢掉
  该提交里真正有价值的内容（画布保存冲突修复、音频配置改进），而且回滚提交与上游后续修复
  合并时会互相打架，比直接补分类更难收拾。

## Consequences

- **收益**：`work` 恢复绿；内置技能能加载，`/api/skills/presets` 不再 500，技能广场能按"音频"分类
  筛选；首个 release 之后可以正常发布包含上游最新提交的版本。
- **代价与已知上限**：
  - 这几处是对**上游文件的本地改动**，后续同步可能与上游修复在相同行冲突；判断依据是上游修复
    为了自身 UI 正确性也必须改同一批位置（尤其前端分类），冲突属"两边加同一项"的简单形态。
  - 分类标签取"音频"是本地判断，若上游采用别的措辞，合并时以上游版本为准即可。
  - `web/vercel.json` 之外的 web 格式化改动（两个文件）同样会与上游同文件的后续改动在同一行相遇，
    但格式化差异通常可自动合并。
  - 这个补丁没有"到期自动失效"机制：重访信号是**上游 `adc6f42e` 之后出现修复技能分类的提交**
    （上游 CI 转绿即可确认），同步进来后按上游写法对齐并删掉本地注释。
- 首个 `fork-v1.6.8.3.1` 发布不含这些修复与上游 `adc6f42e`；下一个二开版本（`fork-v1.6.8.3.2`）
  才会包含。

## Verification

- 后端（`golang:1.26-alpine` 容器，CGO 可用）：CI 里失败的两个包 `go test ./internal/skills ./internal/handler -count=1`
  现在分别 `ok`（2.0s、38.4s）；修复前 `internal/skills` 报 `内置技能 doubao-audio-prompt 分类无效: audio`。
- 前端格式化门：`BASE_SHA=$(git rev-parse aeda0e65) bun scripts/check-changed-formatting.mjs`
  输出 `Changed web files passed formatting checks.`（修复前点名 `audio-settings-panel.tsx` 与
  `test/audio-settings-panel.test.tsx`）。
- 前端全量：`bun run test` 覆盖新增的 `test/audio-settings-panel.test.tsx`（见提交记录中的结果）。
- 说明：本机 `CGO_ENABLED=0` 跑 `./internal/skills` 会因 sqlite 存根失败，所以后端验证走容器；
  纯校验类用例（`TestSkillPresetsCatalogIsValid`）本地即可复现修复前后的差异。
