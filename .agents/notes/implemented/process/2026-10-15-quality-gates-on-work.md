# Agent Note: 二开主线的质量门：push 触发、生产构建、测试类型棘轮与扫描器

Status: implemented

## Problem

二开仓库把上游的 `quality.yml` 原样继承下来，但触发条件与二开的工作方式不匹配：上游靠 PR 拿到检查，本仓库的日常提交直推默认分支 `work`。结果是**代码级质量门一次都没执行过**：

- `quality.yml` 只有 `pull_request` 与 `workflow_call` 两个入口，`work` 的推送不在内；`git log upstream/main..work` 的 15 个二开提交里 `--merges` 为 0，`gh pr list --state all` 为空，`gh run list -w quality.yml` 返回空。后端 `go test`、前端 `typecheck`/`lint`/`bun test` 在二开仓库从未运行。
- 只有笔记校验（`verify-notes.yml`）挂到了 `work` 的推送，且 `work` 没有分支保护。

即使把触发条件补上，仍有三层缺口：

1. **生产打包没有门**。`bun run build` = `tsc --noEmit && vite build`，CI 只跑到 typecheck；唯一的生产打包在镜像构建里，而 `publish-images.yml` 在本仓库是 `disabled_manually`（同步工作流的 preflight 强制保持该状态）。rolldown 的 chunk 分组、产物路径、CSS 这类只在打包期暴露的问题可以一路过关到部署。
2. **测试不在类型系统里**。`web/tsconfig.json` 的 include 只有 `vite.config.ts` 与 `src/**`，`tsc --listFiles` 实测 0 个 `test/` 文件，而 `web/test` 有 317 个文件、2300+ 用例；`@types/bun` 也没装，测试连 `bun:test` 的类型都没有。
3. **依赖与部署面没有机械检查**。没有任何漏洞或密钥扫描（dependabot 只覆盖 `gomod` 与 `npm`）；6 份 compose 与 `nginx.conf` 只在部署 runbook 里人工跑 `docker compose config`，而它们是本地与服务器部署的唯一入口。

## Decision

`quality.yml` 同时作为 push 门与 PR 门，并按下面的范围界定责任：

- 增加 `push: branches: [work]`。`main` 是上游纯镜像（只允许快进对齐），其内容由上游 CI 覆盖，不在本仓库重复跑。
- 并发组按事件区分：PR 与 `work` 推送保留最新一轮，`workflow_call` 保持每次独立分组、互不取消。判定用 `github.ref == 'refs/heads/work'` 而不是 `github.event_name`——被发布流程调用时 `event_name` 继承调用方（push/tag），拿它区分会把发布流程误判成二开推送。
- 支付插件的双架构 smoke 由「仅 PR」改为「PR 或 `work` 推送」。发布流程在本仓库停用，若仍限定 PR，ARM64 支付产物在二开仓库永远拿不到验收。
- web job 增加 `bun run build`（Typecheck 步骤保留，TypeScript 7 的冷启动 typecheck 实测 3.6s，重复一次比丢掉打包门便宜）。
- 测试类型采用**只拦新增的棘轮**：装 `@types/bun@1.3.9`（与运行时同版本，精确锁），新增 `web/tsconfig.test.json` 与两个脚本——
  - `bun run typecheck:test`：整目录检查，用来量化存量欠账（当前 163 个错误 / 56 个文件，全部在 `test/` 下）；
  - `bun run typecheck:test:new`：只对本次 diff 新增的测试文件（含未跟踪文件）拦类型错误，CI 用 `BASE_SHA` 判定范围。
- 新增 `deploy-config` job：用占位 env 对 5 份 compose 逐份跑 `docker compose config --quiet`，再对 `docker-compose.deploy.yml`、`docker-compose.server.yml` 各叠加一次 `docker-compose.build.yml`；`nginx.conf` 用 Dockerfile 里解析出的 nginx 镜像跑 `nginx -t`，并加 `--add-host backend:127.0.0.1`（nginx 在加载配置时就解析 `proxy_pass` 上游）。
- 新增 `vulnerability-scan` job：gitleaks 只扫本次推送的提交范围（`BASE_SHA..HEAD_SHA`，无法解析 base 时退化为 `HEAD~1..HEAD`），govulncheck 扫 Go 依赖，`bun audit` 扫 npm 依赖。
- 两个依赖扫描目前都是**只报告不拦截**（`continue-on-error: true`），退出条件写在对应注释里：
  - govulncheck：go1.25 下实测有 5 个可达漏洞（`golang.org/x/net` 4 个、`golang.org/x/text` 1 个），修掉它们要求 `golang.org/x/net v0.60.0`，而该版本 `requires go >= 1.26.0`——那是一次独立的工具链迁移，见 [仓库产物与工具链版本](2026-10-15-repo-artifacts-and-toolchain-pins.md)。
  - `bun audit`：实测 112 条公告（2 critical / 50 high / 51 moderate / 9 low），含直接依赖 `react-router` 的 RSC CSRF 绕过，修它们是一次依赖大版本升级。
- 新增 `.github/scripts/check-env-docs.py` 挂到 backend job：后端读到的每个 `CANVAS_*` 必须出现在 `.env.example`、`README.md`、`AGENTS.md`、`SECURITY.md` 或 `docs/**` 里。
- dependabot 补齐 `github-actions`（`/`）与 `docker`（`/`、`/backend`、`/yingce-agent`），并把 `backend/agent-runtime/pi` 的 npm 依赖纳入。

范围边界（有意不做）：`docs/` 内容仍无机械校验，本改动不引入文档站或链接检查；质量门只管 `work`，不管上游镜像的 `main`。

## Alternatives considered

- **改用 PR 流程 + 分支保护，不动触发条件** — 这是最标准的做法，成本只是每次多一步 PR，而且天然带评审与状态检查。否决理由：单人二开仓库目前直推 `work`，改流程会先中断既有工作方式，且分支保护的开关属于仓库设置而不是代码；先把门挂到既有的 push 路径上，推送也照旧被拦，PR 流程可以之后按需叠加。
- **整目录纳入测试类型检查** — 一步到位，没有"存量"这一说。否决理由：`tsc -p tsconfig.test.json` 实测 163 个错误分布在 56 个文件，多数是测试替身与真实类型不一致（`as ProjectDetail` 只写一半字段之类），要逐个判断是补字段还是补类型；用 `as unknown as` 批量抹平会让这些契约漂移永久隐身，比不做更糟。
- **govulncheck / `bun audit` 直接设为拦截** — 漏洞是真实可达的，本该立刻红。否决理由：两端各自都只能靠独立的大改动修掉（Go 侧需升到 1.26，npm 侧是 112 条公告、含直接依赖大版本升级）；在用户没要求这两项迁移的前提下让主分支常红，等于让整套 CI 变成噪声，反而会诱发绕过。
- **gitleaks 扫全历史** — 覆盖面最大，一次扫清所有历史提交里的密钥。否决理由：实测 `dir` 模式扫工作树 4m41s、834 条命中，绝大多数来自已提交的插件二进制与本地缓存目录；改成只扫本次提交范围后 15 个提交 / 237KB / 565ms / 0 命中。历史泄漏不是靠每次 push 重扫解决的。
- **为 compose 写自定义校验** — 可以精确表达"必须带 digest""不许用 `*`"这类团队规则。否决理由：部署时用的是官方解析器，先保证"官方解析器能读通"，团队规则等真实踩坑后再加。

## Consequences

- **收益**：`work` 的每次推送都会得到后端测试、前端类型/构建/测试/E2E、支付插件产物、部署配置、密钥与依赖漏洞的机械判定；打包错误与新增测试的类型错误在推送阶段就被拦住；`main` 与发布流程的行为完全不变。
- **代价与已知上限**：
  - 存量测试类型欠账 163 项 / 56 个文件仍在树里，棘轮只保证新增不增长；编辑旧测试文件不会被强制修（这是有意的：单文件平均 1.25 个错误，强制修会让改一行测试变成修一整片）。
  - **govulncheck 与 `bun audit` 只报告不拦截，属于会腐烂的门。** 重访信号：Go 工具链升到 1.26、或 npm 依赖完成一轮升级后，删掉 `continue-on-error` 改为拦截。
  - compose 校验用占位值，只能证明结构与插值成立，不证明镜像、digest 真实存在或服务能起。
  - `--add-host backend:127.0.0.1` 只让 `nginx -t` 通过，不代表运行时 DNS 正确。
  - 每次 push 增加约 `bun run build` 5s、部署校验数十秒、govulncheck 40s + 工具下载、gitleaks 数秒。
  - 棘轮的 `BASE_SHA` 在"新分支首推"时会退化成只检查最后一个提交。

## Verification

- 触发与结构：`python3 -c "import yaml..."` 解析 `quality.yml` 得 `on = [pull_request, push, workflow_call]`，`push.branches = [work]`，jobs 为 backend / deploy-config / vulnerability-scan / payment-plugins / web；所有 `run` 片段逐个 `bash -n` 通过。
- 部署面：占位 env 下 5 份 compose 与 2 个叠加组合 `config --quiet` 全部退出 0；`nginx:1.27-alpine` + `--add-host backend:127.0.0.1` 跑 `nginx -t` 输出 `test is successful`（不带 `--add-host` 会 `host not found in upstream "backend"`）。
- 密钥扫描：`gitleaks git --log-opts="upstream/main..work"` → 15 commits、237KB、565ms、no leaks；base 解析的四种输入（有效 base / 空 / 全零 / 不在本地）各自落到正确的 range。
- 依赖扫描：`CGO_ENABLED=0 go run golang.org/x/vuln/cmd/govulncheck@latest ./...` 36s 输出 5 个可达漏洞（`x/net` 4、`x/text` 1），并给出修复版本；`BUN_CONFIG_REGISTRY=https://registry.npmjs.org bun audit` 输出 112 条公告（2 critical / 50 high / 51 moderate / 9 low），两者都是只报告模式的依据。
- 类型棘轮：新增一个干净测试文件 → 输出 `1 new test file(s) type-checked clean; legacy backlog: 163 error(s) in 56 file(s)` 并退出 0；把该文件写成类型错误 → 打印 `TS2322` 并退出 1；未新增测试文件时快速返回不跑 tsc。
- 测试去重与运行时：`PATH` 指向 bun 1.3.9 时 `bun run test` 只输出一行 `Ran 2330 tests across 322 files`（2330 pass / 0 fail），改动前 `pretest` 会先额外跑 9 个文件。
- 环境变量门：`python3 .github/scripts/check-env-docs.py` 正向输出 `ok: 21 CANVAS_* env var(s) ... are documented`；删掉 `.env.example` 里一行登记后报出 `CANVAS_CHANNEL_CIRCUIT_SECONDS` 并退出 1。
- 未验证：CI 上的真实运行（需要推送 `work` 才产生 run）。
