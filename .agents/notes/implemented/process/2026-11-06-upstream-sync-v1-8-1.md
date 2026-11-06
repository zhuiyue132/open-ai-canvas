# Agent Note: main v1.8.1 合入 work，保留二开策略并补齐同步门禁

Status: implemented

## Problem

`work` 基线为 `d7f1f7b6`，上次已合入的上游基线为 `82fc5c03`。本批 `origin/main` 与 `upstream/main` 同为 `8611fc0e`（v1.8.1），包含 156 个尚未进入 work 的提交、1430 个变更文件：电商 Agent、六种界面语言、方舟素材组与真人认证、画布姿势库、Agent 批量生成、文本定价和参考视频计费，以及声明式协议晚到结果等修复。

三方合并有 26 个冲突文件。品牌文字被迁入 i18n 字典、预演台改为读取站点品牌、插件协议和支付产物升级，同时触及 work 的品牌与内容边界。直接取任一侧会丢功能或撤销二开策略。初次测试类型检查还暴露新测试夹具与当前类型合同不一致；功能地图缺少 15 条新路由。可达漏洞扫描另发现上游新增 `x/image v0.40.0` 的三个 WebP 解码漏洞，正常测试通过不足以满足 CI 的安全门。

## Decision

1. **同步只走 merge**：本地 main 快进到 `origin/main`；work 合入同一个远端提交，保留两侧历史，不 rebase、不强推，也不额外发布 tag。同步前确认 `Publish container images` 仍为 `disabled_manually`；本地与远端 work 在同步起点一致。
2. **产品实现取上游，策略按区块重放**：保留多语言、动态品牌与预演监看标题更新；中文默认品牌和新品牌文案仍为「意绘」，其他语言中的英文品牌仍为 `EASYDRAW`。短剧资产包、剪映草稿与姿势库的新用户文案同步重放。`yingce` 协议、环境变量、包后缀、部署身份和第三方品牌不改。
3. **欢迎页与文档边界不退回**：欢迎页采用上游翻译键，但继续删除贡献者入口与卡片；`docs/index.md` 保留只列参考文档的 work 版本。`pending-test.mdx` 两侧章节均保留，README、二开 CI 与部署入口不退回上游展示策略。
4. **安全依赖不降级**：保留 work 的 Go 1.26 与较高的 `x/crypto`、`x/net`、`x/sync`、`x/sys` 版本，上游新增的 `x/image` 升级到 `v0.45.0`，修复 `GO-2026-6222`、`GO-2026-5061`、`GO-2026-4961` 三个可达漏洞；其模块仅要求 Go 1.25，与现有工具链兼容，不联动升级其他依赖。前端吸收 i18next 与 react-i18next，保留现有依赖升级与 overrides；按锁文件安装。把这一既有决定单列进 `docs/AGENT_LOCAL_DEVELOPMENT.md` 的冲突表，避免通用的「实现取上游」被误用为依赖降级。
5. **插件以源码与逐条目核对为准**：七个协议包（NewAPI 两包、Novita、OpenAI Images、即梦图片/视频、Runcrate）采用上游协议，重放作者品牌、重新内嵌完整文档并 `zip -X` 打包。支付FM包按合并后的源码重新打包；其七个可执行条目与本批上游包逐字节一致，不重新构建或回退旧二进制。八个产物合计 32 个文件条目均与源码比对。
6. **保留 audio 技能分类修复**：上游多语言改造未补 audio 分类，继续保留后端白名单和前端兜底分类，并为六种语言补齐对应翻译键。预演台已改为从外观设置读取品牌，不再保留静态中文 logo；默认品牌仍来自 work 的外观配置。
7. **测试按真实合同修复，不放宽门禁**：补缓存写入价格、参考视频计费、资源标题、分镜可见列与引用等必填字段；连接夹具使用 `fromNodeId/toNodeId`，计价枚举使用 `fixed_request`。电商任务输出由媒体夹具工厂统一提供图片类型；happy-dom 事件与 lib.dom 声明的转换集中在测试派发边界。修正 AntD 测试中的 `Modal` 导出别名、测试 UUID 参数推断和创作参数类型。预加载测试通过真实 React SSR 验证挂起与预加载后的同步渲染，不再把可能是 class 的组件类型强行当函数调用。
8. **上游已覆盖的超时补丁收敛**：云端 Agent 面板包装用例采用上游的 35 秒超时（子进程预算 30 秒），上游已覆盖旧版默认 5 秒的问题；不再保留 work 的 60 秒独立补丁。
9. **功能地图跟随入口变化**：登记电商页面及其后台和旧入口跳转、管理员技能列表/编辑、姿势库后台与公开真人认证回跳，补两个电商开关及其依赖；修正后台模型页不再受前台模型开关阻挡的说明。地图检查只证明登记与锚点存在，不作为真实页面验收。
10. **文档姿势 ID 误报只放行单条历史指纹**：用户确认后，`.gitleaksignore` 仅登记上游 `948b1ba7049d5918e68ddb9a02fcfac9ed5c6ee1`、`docs/content/docs/canvas/pose-library.mdx`、`generic-api-key`、第 105 行组成的精确指纹。`genericPack` 将该字段作为公开姿势的 `ExternalKey`，不是鉴权信息；当前文档示例的 `items[].key` 改为 `pose-1`，避免新提交再产生同类误报。所有规则继续运行，不按路径、规则或整个提交豁免；真实凭据不适用此处理。

### 既有笔记审计

[冲突结算规范](./2026-10-28-upstream-conflict-resolution-policy.md) 继续作为规则入口，补安全依赖与已确认误报两类；[工具链与安全依赖](./2026-10-15-repo-artifacts-and-toolchain-pins.md)、[品牌边界](../feature/2026-10-28-brand-name-yihui.md) 与 [audio 分类修复](../bug-fix/2026-10-15-upstream-audio-skill-category.md) 的决定不变。[v1.7.3.3 同步](./2026-11-02-upstream-sync-v1-7-3-3.md) 是不同批次证据，只就地标注超时补丁被本批上游覆盖。检索时不存在 proposed / rejected 目录，没有待裁决的相关提案。

## Alternatives considered

- **冲突整文件取上游**：可以直接得到上游最新功能和原始插件包。否决理由：会重新显示贡献者、恢复旧品牌，并把已修复漏洞的依赖退回较低版本；这些是 work 已明确保留的策略，不是本批可撤销的兼容补丁。
- **品牌冲突整块取 work**：品牌文案与已验证行为最稳定。否决理由：会丢掉翻译键、预演台的自定义站点品牌与实时监看标题更新，也会让插件停留在旧协议。采用上游实现后在文案、字典和生成产物层重放策略。
- **为了通过类型检查而排除新测试或增加宽泛类型断言**：修改量最小。否决理由：会把上游类型漂移留到运行期，违反 work 的整目录测试类型门禁。补齐真实夹具合同，并把重复事件与媒体输出边界集中到测试 helper。
- **只修改当前文档示例，不登记历史指纹**：不引入任何安全扫描例外。否决理由：Gitleaks 扫描本批上游历史，旧提交的公开姿势标识仍会失败；为修改上游历史而重写 work 会违反分支规则。使用单条精确历史指纹，同时缩短当前样例，不扩大未来扫描豁免。

## Consequences

- 收益：v1.8.1 的功能与修复进入 work 的合并结果；品牌、内容边界、安全依赖和 CI 门槛保持。插件源码、内嵌文档与产物可以逐条目复核，15 条新增路由有可检索的抵达方式。
- 代价：二开品牌仍要随新增语言字典和插件作者文案重放；ZIP 时间戳使产物二进制重写，不能只凭文件哈希判断协议变化。上游新增测试仍需同步当前类型合同。
- 上限：没有运行真实收费模型、真人认证外部服务或服务器升级；未使用开发账号数据库，也未启动长期 dev server。公开回跳页的查询参数不是认证事实。单条 Gitleaks 指纹绑定不可变上游提交的文件与行号，不覆盖后续提交；以后再命中须重新核实，不能扩成全文件或全规则例外。

## Verification

- `cd web && bun install --frozen-lockfile`、`bun run typecheck:test` 通过；专项回归 98 项通过、0 失败。
- 功能地图校验通过：78 条路由、1 个非 Router 界面、5 个路由守卫开关、250 个代码锚点；校验器专项 29 项通过。
- 八个插件包共 32 个文件条目与合并后的源码一致；支付FM七个可执行条目与 `origin/main` 包一致。
- `python3 .github/scripts/check-env-docs.py` 通过（22 个环境变量）；`nginx:1.27-alpine nginx -t` 通过。
- `bun run build`、`bun run typecheck:test` 通过；前端全量 3255 项通过、0 失败（460 个文件），预演台 Chrome E2E 76 条断言通过。Agent runtime 的 Node 测试 4 项通过。
- `cd backend && go test -json -count=1 -timeout=20m ./...`：4208 项通过，5 项跳过；`.github/scripts/check-dependency-tests.py` 确认 PostgreSQL / Redis 的五项依赖用例实际执行并通过。跳过的是付费模型、跨端浏览器 runner、Linux errno、显式开启的外网知识同步，以及未配置 OSS 密钥的公网地址分支。该轮在安全扫描升级 `x/image` 前执行，升级后的结果以随后完整分片复验为准。
- 决策笔记三线校验通过；五份 Compose 与两个 build overlay 组合解析通过。`verify-payment-packages.sh --all linux amd64` 验证五个支付包的六平台文件格式与包内外字节一致，但在 macOS 不执行 Linux 双架构 smoke。
- `bun run audit:gate` 通过；升级 `x/image v0.45.0` 后 `govulncheck` 报告 0 个可达漏洞。扫描仍报告未被当前代码调用的包 / 模块漏洞，不把它们写成全部依赖零公告。
- `bun scripts/verify-before-push.mjs --base origin/work --jobs 4`：首轮共 12 项，失败 0 项，用时 210.9 秒；升级 `x/image v0.45.0` 后完整复验共 12 项，失败 0 项，用时 190.7 秒，包含全量后端分片、3255 项前端测试与 76 条预演台断言。脚本对待提交合并快照运行，未把结果称作已推送版本。
- `go test -count=1 ./internal/protocol` 再次通过，避免 Go 测试缓存掩盖插件产物字节变化。
- 上游提交范围的 Gitleaks 初次扫描命中一个文档误报：`948b1ba7049d5918e68ddb9a02fcfac9ed5c6ee1` 中 `docs/content/docs/canvas/pose-library.mdx:105` 的公开姿势标识符。`genericPack` 在 `backend/internal/poselibrary/importer.go` 把它解析为 `ExternalKey`，不是鉴权凭据；原始规则为 `generic-api-key`。用户确认的处理仅登记这一历史指纹，并把当前文档样例改为短 ID。处理后按 CI 的默认调用扫描上游范围（149 个非合并提交）通过；另以单父验证快照扫描当前合并树的完整改动，通过且无新命中。脚本校验 `.gitleaksignore` 只有这一条非注释指纹，文档 JSON 样例仍可解析。
- 本地未覆盖：支付插件 Linux 双架构构建 / 运行 smoke、`golangci-lint`（未安装），以及真实收费模型、真人认证、外网知识同步、OSS 公网分支、跨端生成浏览器 runner 和服务器升级。本节记录提交前的验证；提交后的干净工作区门禁、推送结果与远端 CI 状态以交付回复为准。
