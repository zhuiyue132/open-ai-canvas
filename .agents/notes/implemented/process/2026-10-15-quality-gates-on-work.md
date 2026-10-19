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
  - `bun run typecheck:test`：整目录检查。存量欠账已在 2026-10-19 清零并转为 CI 门禁，见 [测试类型欠账清零](../testing/2026-10-19-test-typecheck-zero-debt.md)；
  - `bun run typecheck:test:new`：只对本次 diff 新增的测试文件（含未跟踪文件）拦类型错误，CI 用 `BASE_SHA` 判定范围。**2026-10-19 已撤掉**：存量清零后 CI 直接跑整目录检查，脚本与 `typecheck:test:new` 一并删除，见同一篇笔记。
- 新增 `deploy-config` job：用占位 env 对 5 份 compose 逐份跑 `docker compose config --quiet`，再对 `docker-compose.deploy.yml`、`docker-compose.server.yml` 各叠加一次 `docker-compose.build.yml`；`nginx.conf` 用 Dockerfile 里解析出的 nginx 镜像跑 `nginx -t`，并加 `--add-host backend:127.0.0.1`（nginx 在加载配置时就解析 `proxy_pass` 上游）。
- 新增 `vulnerability-scan` job：gitleaks 只扫本次推送的提交范围（`BASE_SHA..HEAD_SHA`，无法解析 base 时退化为 `HEAD~1..HEAD`），govulncheck 扫 Go 依赖，`bun audit` 扫 npm 依赖。
- 依赖扫描的拦截线按各自能达到的"干净"定义拆分：
  - **Go 拦截**：`govulncheck ./...` 直接作为门。它只认**可达**漏洞，工具链升到 Go 1.26 并升级 `golang.org/x/net v0.60.0` / `x/text v0.42.0` 后输出 `No vulnerabilities found`（升级动机与代价见 [仓库产物与工具链版本](2026-10-15-repo-artifacts-and-toolchain-pins.md)）。
  - **npm 分两层**：`bun audit --audit-level=critical` 拦截，全量 `bun audit` 只报告。一轮 overrides 补齐后公告数从 112 条 / 31 包降到 12 条 / 5 包、critical 归零；剩下的 high/moderate 里，`braces` 与 `sprintf-js` 上游根本没有修复版本，`nanoid`（`@excalidraw` 内部的 3.x/4.x 副本）、`katex`、`fflate`（`three-stdlib` 内部）必须先升级被刻意 pin 的直接依赖才能修，所以拦 high 需要一张长期 ignore 名单，收益不抵维护成本。
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
  - 存量测试类型欠账曾长期留在树里（提出时 163 项 / 56 个文件），棘轮只保证新增不增长；2026-10-19 已按六类清零并换成整目录门禁，欠账与棘轮同时收摊（见 [测试类型欠账清零](../testing/2026-10-19-test-typecheck-zero-debt.md)）。
  - **npm 侧只拦 critical，high/moderate 靠报告与 dependabot。** 这一档缺口是已知的：12 条残留里没有可用的自动化修法。重访信号：`bun` 升到真正支持嵌套 override 的版本（1.3.9 会**静默忽略** `parent>dep` 与 `pkg@range` 两种写法——实测 package.json 里写完、`bun install` 报 `no changes`、lock 仍是 `lockfileVersion 1`），或 `@excalidraw` 升级后，把拦截线提到 high。
  - compose 校验用占位值，只能证明结构与插值成立，不证明镜像、digest 真实存在或服务能起。
  - `--add-host backend:127.0.0.1` 只让 `nginx -t` 通过，不代表运行时 DNS 正确。
  - 每次 push 增加约 `bun run build` 5s、部署校验数十秒、govulncheck 40s + 工具下载、gitleaks 数秒。
  - 棘轮的 `BASE_SHA` 在"新分支首推"时会退化成只检查最后一个提交。
  - **每次同步上游都要补一轮收尾**：合并 `upstream/main` 后，上游带来的测试文件都会落进整目录门的检查范围，而上游代码不是 prettier-clean（格式门只在 base 版本同样不干净时才跳过）。同步 `48543609` 实测：8 个文件格式不通过（6 个新增 + 2 个上游改动后失格式），17 个新增测试文件里 3 个共 13 处类型错误（`happy-dom` 的 `Event` 缺 `isTrusted/returnValue/srcElement` 因此与 lib.dom 的 `Event` 不兼容、夹具缺 `CanvasProject` 必填字段）。处理方式是 `prettier --write` 这些文件、在派发边界做一次 `Event` 转换、给夹具补齐字段；放宽门或把它们塞进存量豁免会削弱棘轮本身。

## Verification

- 触发与结构：`python3 -c "import yaml..."` 解析 `quality.yml` 得 `on = [pull_request, push, workflow_call]`，`push.branches = [work]`，jobs 为 backend / deploy-config / vulnerability-scan / payment-plugins / web；所有 `run` 片段逐个 `bash -n` 通过。
- 部署面：占位 env 下 5 份 compose 与 2 个叠加组合 `config --quiet` 全部退出 0；`nginx:1.27-alpine` + `--add-host backend:127.0.0.1` 跑 `nginx -t` 输出 `test is successful`（不带 `--add-host` 会 `host not found in upstream "backend"`）。
- 密钥扫描：`gitleaks git --log-opts="upstream/main..work"` → 15 commits、237KB、565ms、no leaks；base 解析的四种输入（有效 base / 空 / 全零 / 不在本地）各自落到正确的 range。
- 依赖扫描（本轮两个方向的实测值）：升级前 `govulncheck` 在 go1.25 下报 5 个可达漏洞（`x/net` 4、`x/text` 1），升级后输出 `No vulnerabilities found`；`bun audit` 从 112 条（2 critical / 50 high / 51 moderate / 9 low，31 包）降到 12 条（0 critical / 7 high / 4 moderate / 1 low，5 包 = `braces`、`fflate`、`katex`、`nanoid`、`sprintf-js`）。前端在升级后重新验证：`bun install --frozen-lockfile`、`bun run typecheck`、`bun run lint`、`bun run build`、`bun run test`（2330 通过 / 0 失败）、`bun run test:previs:e2e`（65 断言 / 0 失败）全部通过。
- 清理方式与残留清单：`package.json` 的 `overrides` 由 6 项非 tiptap 条目扩到 25 项（补齐 `undici`、`fast-uri`、`@xmldom/xmldom`、`postcss`、`dompurify`、`mermaid`、`lodash-es`、`gh-pages` 等已过期的 pin），直接依赖升 `axios ^1.20.0`、`react-router ^8.3.0`、`@tiptap/* 3.30.5`；`nanoid` 的 3 个传递副本（3.3.3 / 3.3.16 / 4.0.2）在 bun 1.3.9 下无法定点修复，已在 `package.json` 里移除无效的嵌套规则（不留假承诺）。
- 类型棘轮：新增一个干净测试文件 → 输出 `1 new test file(s) type-checked clean; legacy backlog: 163 error(s) in 56 file(s)` 并退出 0；把该文件写成类型错误 → 打印 `TS2322` 并退出 1；未新增测试文件时快速返回不跑 tsc。
- 测试去重与运行时：`PATH` 指向 bun 1.3.9 时 `bun run test` 只输出一行 `Ran 2330 tests across 322 files`（2330 pass / 0 fail），改动前 `pretest` 会先额外跑 9 个文件。
- 环境变量门：`python3 .github/scripts/check-env-docs.py` 正向输出 `ok: 21 CANVAS_* env var(s) ... are documented`；删掉 `.env.example` 里一行登记后报出 `CANVAS_CHANNEL_CIRCUIT_SECONDS` 并退出 1。
- 未验证：CI 上的真实运行（需要推送 `work` 才产生 run）。
