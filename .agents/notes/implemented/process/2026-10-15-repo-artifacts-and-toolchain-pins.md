# Agent Note: 仓库产物、工具链版本与环境变量登记

Status: implemented

## Problem

三件与"仓库里到底该有什么"有关的事实长期没人核，彼此还互相掩盖：

1. **63MB 构建产物入库**。`backend/server` 被 git track，`.gitignore` 与 `.dockerignore` 里写着"不要提交构建产物"的规则却指向 `backend/cmd/server/server`——一个不存在的路径，规则从来没生效过。`go version -m backend/server` 显示它的模块路径是 `infinite-canvas/backend/cmd/server`，而本仓库的模块是 `yingce/backend`：这是上游遗留的 macOS 二进制，不是本仓库的产物，也不被任何构建、脚本或文档引用。每次 clone 与每轮同步都要搬 63MB，且它进 Docker 构建上下文。
2. **工具链版本没有单一来源**。bun 版本在 CI、根 `Dockerfile`、`web/package.json` 的 `packageManager` 里都是 `1.3.9`，但 `docker-compose.dev.yml` 用 `oven/bun:1.3.13`，而 Bun 本身不执行 `packageManager` 字段。实测症状：本机 bun 1.2.19 跑 `bun test` 得到 `1 fail`（`decodeNovelText > UTF-8 严格解码失败后回退到 GB18030`），因为该版本 `new TextDecoder("gb18030")` 抛 `Unsupported encoding label`；换成 1.3.9 后同一用例通过、全量 `2330 pass / 0 fail`。也就是说版本漂移会伪装成代码缺陷。
3. **环境变量只能读源码**。抽取后端的读取点（`os.Getenv`/`os.LookupEnv` 与本地 `env`/`envInt`/`envBool`/`envDuration` helper）得到 21 个 `CANVAS_*`，其中 8 个在 `.env.example`、`README.md`、`AGENTS.md`、`SECURITY.md` 与 `docs/**` 里全都搜不到：`CANVAS_AGENT_MAX_PROCESSES`、`CANVAS_AGENT_STEP_TIMEOUT_SECONDS`、`CANVAS_AGENT_STEP_MAX_OUTPUT_TOKENS`、`CANVAS_CHANNEL_CIRCUIT_FAILURES`、`CANVAS_CHANNEL_CIRCUIT_SECONDS`、`CANVAS_DATABASE_DRIVER`、`CANVAS_OFFICIAL_PLUGIN_DIR`、`CANVAS_PI_RUNTIME_DIR`。

顺带发现两处小的重复与遗留：`bun run test` 因为 npm 生命周期的 `pretest` 会把同一批 9 个文件跑两遍；`web/vercel.json` 是上游初始提交带来的 Vercel 配置，与 Docker + nginx 的部署链无关。

## Decision

- `backend/server` 用 `git rm --cached` 解绑版本控制（磁盘文件保留），`.gitignore` 与 `.dockerignore` 的规则由 `backend/cmd/server/server` 改为 `backend/server`。上游若将来删除该文件，双方都是删除，合并不会冲突。
- 新增 `.tool-versions` 声明 `bun 1.3.9`、`nodejs 22.19.0`、`golang 1.25.0`（与 CI、镜像一致）；`docker-compose.dev.yml` 的 `oven/bun:1.3.13` 改回 `1.3.9`。版本不一致的可观察症状写进 `AGENTS.md` 第 8 节，指向具体用例与 `bun --version` 排查动作。
- 8 个未登记的环境变量写进 `.env.example`：可选开关用注释行并带上默认值与取值区间（`env()`/`envInt()` 把空值视为未设置，所以占位值可以是注释），`CANVAS_DATABASE_DRIVER` 与两个目录覆盖也一并登记。新增 `.github/scripts/check-env-docs.py` 在 CI 拦截后续漏登记，作用域为 `backend/` 下非测试文件，排除宿主机更新器（`cmd/host-updater`、`internal/hostupdate`、`internal/updaterclient`）——那里的 `CANVAS_UPDATER_*` 是安装脚本与自更新服务之间的内部契约，不是用户配置面。
- `web/package.json` 的 `pretest` 改名为 `test:gate`，`bun run test` 只跑一次；需要快速回归时可显式 `bun run test:gate`。
- `web/vercel.json` 保留在树中，但在 `docs/AGENT_LOCAL_DEVELOPMENT.md` 第 6 节标注为上游遗留、本仓库不使用，部署只走 Docker + nginx。

## Alternatives considered

- **把 `backend/server` 从磁盘上删掉** — 更彻底，直接回收 63MB。否决理由：这是别人留下的构建产物，本次任务的目标是让它不再进版本控制；解绑后它已被 ignore，是否删除磁盘文件留给使用者。
- **加硬性版本闸门（`bun --version` 不等于 1.3.9 就失败）** — 能立刻挡住漂移，不会再有人把运行时差异当代码缺陷。否决理由：Bun 不执行 `packageManager`，硬闸会让换机器或升级 Bun 的人直接卡在第一步，而仓库当前的默许做法是声明 + 症状文档；等 `.tool-versions` 真被使用（asdf/mise）再考虑升级为阻断。
- **把 8 个环境变量加进校验脚本的 allowlist** — 不用改文档，一行就能过。否决理由：allowlist 会把"只能读源码才能发现"变成永久状态，而这些开关（Agent 并发、单步超时、熔断阈值、插件目录）恰恰是排障时最需要先看到的。
- **全量扫描环境变量（含宿主机更新器）** — 规则更简单，不用维护例外清单。否决理由：`CANVAS_UPDATER_*` 由 `install-host-updater.sh` 写进宿主机的 `.env` 并由更新器读取，用户不配置它；强行要求登记只会让人往文档里灌无关条目，降低文档的信噪比。
- **删除 `web/vercel.json`** — 消除一个不被维护的部署配置，避免有人照它部署到 Vercel。否决理由：它是上游初始提交跟踪的文件，删除会在每日同步里留下 modify/delete 面，而保留它的唯一后果是"误部署 Vercel 会立刻 404 且与文档矛盾"；用文档标注的收益/风险比更划算。

## Consequences

- **收益**：每次 clone 与每轮同步不再搬运 63MB 上游二进制，Docker 构建上下文同步变小；本地与 CI/容器的 bun 版本一致，运行时差异有可检索的症状与排查动作；运行时可调开关在模板里可发现（含默认值与区间）；环境变量漏登记从此有机械判定。
- **代价与已知上限**：
  - `backend/server` 的文件仍在磁盘上（63MB），需要手工删除才回收空间。
  - 上游若修改 `backend/server`，本次删除会变成 modify/delete 冲突；判断依据是上游最近一次改动只发生在 `chore: commit workspace updates` 这类整树提交里，风险低。
  - `.tool-versions` 在没有 asdf/mise 的机器上不产生任何约束，只作为声明与 CI/镜像的对照。
  - `check-env-docs.py` 只校验"名字出现过"：文档里写错默认值或区间它不会发现；新增读取 helper（如新的 `envX`）也需要同步更新脚本的正则，否则会漏检。
  - `test:gate` 不再自动执行，忘记单独跑它只会损失"先失败在关键回归上"的顺序，覆盖范围不变。
  - `web/vercel.json` 的不支持状态只写在二开本地文档里，上游文档不会反映。

## Verification

- 产物解绑：`git rm --cached backend/server` 后 `git check-ignore -v backend/server` 命中 `.gitignore:75`，磁盘文件仍在；`rg "backend/server" --glob '!node_modules'` 除本次改动外无引用。
- 工具链：`.local/bun/bin/bun`（1.3.9）下 `bun test` 全量 `2330 pass / 0 fail`，本机 1.2.19 下同一套件 `1 fail`（GB18030 用例），定位为 `TextDecoder` 标签支持差异；`docker-compose.dev.yml` 与根 `Dockerfile`、CI、`packageManager` 现在都是 `1.3.9`。
- 环境变量门：`python3 .github/scripts/check-env-docs.py` 输出 `ok: 21 CANVAS_* env var(s) read by backend are documented`；把 `.env.example` 里 `CANVAS_CHANNEL_CIRCUIT_SECONDS` 的登记替换成占位符后，脚本点名该变量并退出 1；8 个变量的默认值与区间来自 `internal/platform/runtime_policy.go`、`internal/agent/runtime/runtime.go`、`internal/app/protocol_plugins.go`、`cmd/server/main.go`。
- 测试去重：`PATH` 前缀指向 bun 1.3.9 后 `bun run test` 只输出一行 `Ran 2330 tests across 322 files`；改动前 `pretest` 会先跑 8 个文件再跑 1 个文件。
