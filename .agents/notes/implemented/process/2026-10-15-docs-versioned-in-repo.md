# Agent Note: docs 全量随仓库分发，放行规则放在 docs/.gitignore 而不是根文件

Status: implemented

## Problem

`docs/` 的可见性由根 `.gitignore` 的「`docs/*` + 逐文件白名单」控制：新增文档若不在白名单里会被静默忽略，`git add` 收不进来、`git status` 不提示，只有 `git add -f` 或补一行白名单才能入库。代价已经出现：白名单落后于跟踪集（`docs/content/docs/plugins/plugin-system.mdx`、`docs/content/docs/backend/meta.json` 被跟踪却不在白名单），白名单里还有两条指向不存在文件的幽灵条目（`overview/creative-agent-design.mdx`、`creative-agent-runtime.mdx`），而协作者与 Agent 需要的二开远端与上游同步说明只能留在本机。上游对根 `.gitignore` 的写入很频繁：近 90 天 31 次提交，其中多次就是往这段白名单追加条目。

## Decision

`docs/` 全量随仓库分发。放行规则写在 `docs/.gitignore`：`!*` 放行文件、`!*/` 放行目录，随后回压不该入库的本地与敏感文件——`.env*`（保留 `.env.example`）、`.settings-key`、`*.log`、`*.tmp`、`*.bak`、`*.db*`、`*.sqlite*`、`*.tsbuildinfo`、`.DS_Store`、`node_modules/`、`.cache/`、`.data/`、`coverage/`、`dist/` 与编辑器/工具目录。同一文件内后写的规则优先，所以回压必须排在两条放行规则之后。

根 `.gitignore` 保持上游原样，`work` 分支不修改它；新增文档不再需要 `git add -f`。

## Alternatives considered

- **重写根 `.gitignore`，删掉 docs 白名单段** — 语义最直接，一处规则说清所有文档的可见性。否决理由是冲突成本：上游近 90 天有 31 次 `.gitignore` 提交且仍在往同一片段追加白名单，删掉它会与上游改动落在同一区域，让每日上游同步反复在 `.gitignore` 上冲突并中止。
- **保留白名单，新增文档时用 `git add -f` 或补一行** — 不需要改任何忽略规则，风险为零。否决理由是它没有反馈面：文件被忽略时 `git status` 什么都不显示，白名单落后与幽灵条目就是这么积累的，新文档是否入库取决于作者是否记得 `-f`。
- **把放行写进 `.git/info/exclude`** — 只影响本机、零冲突。否决理由是本机规则不随 clone 分发，协作者与 Agent 拿到的是另一套行为，解决的不是同一个问题。
- **按扩展名逐条放行（`!*.md`、`!*.mdx`、`!*.png` …）** — 同样绕开冲突。否决理由是它把「白名单维护」换成「扩展名维护」：新增 `.yaml`、`.csv` 或新图片格式时又会被静默忽略。

## Consequences

- **收益**：新增文档默认入库，不需要 `-f`，也不会静默消失；上游 `.gitignore` 的冲突面为零（根文件与上游逐字节一致）；协作者与 Agent clone 后能拿到全部文档。
- **代价与已知上限**：
  - 敏感与本地文件的压制规则在两处表达（根 `.gitignore` 与 `docs/.gitignore`），根文件新增密钥类或大产物模式时需要在 `docs/.gitignore` 同步补一行；重访信号是根 `.gitignore` 出现新的凭据、密钥或大产物模式。
  - `docs/` 下任何文件都默认入库，体积异常或不该公开的文件只能靠评审拦截。
  - 上游若把某篇文档移出白名单甚至删除，本仓库仍保留该文件，属于二开范围，不视为缺陷。

## Verification

- 探针实测（可复跑）：`docs/probe1.md`、`docs/probe-newdir/probe3.md`、`docs/content/docs/progress/probe2.mdx`、`docs/content/docs/backend/probe4.mdx` 在 `git check-ignore` 下都不命中，`git add -n docs` 直接列出这些路径而无需 `-f`。
- 回压实测：`docs/.env`、`docs/newdir/.env`、`docs/.env.local`、`docs/.settings-key`、`docs/content/docs/.settings-key`、`docs/x.log`、`docs/x.tmp`、`docs/newdir/data.db` 全部仍被忽略，`docs/.env.example` 按例外可入库。
- 根文件未改动：`git diff upstream/main -- .gitignore` 为空，`git diff --name-only upstream/main..work -- .gitignore` 为空。
- 现状核对：`git status --short -- docs` 只列出待提交的文档文件，不出现被忽略项。
