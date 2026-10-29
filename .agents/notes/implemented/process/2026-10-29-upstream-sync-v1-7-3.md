# Agent Note: 合并 main v1.7.3 到 work，保留品牌与内容边界

Status: implemented

## Problem

`work` 位于 `c77baaa9`，`main` 有 20 个尚未进入二开分支的提交。远端 `origin/main` 与 `upstream/main` 同为 `0a6f7c4d`，包含 v1.7.3 及其后的 Agent、迁移和 xAI 视频修复；本地 `main` 仍停在 `4cbb1134`。本次需要合入这些实现，而不回退刚完成的意绘品牌和 README / 欢迎页内容边界。

三方合并有 4 个冲突文件：README、xAI 插件 manifest、对应二进制包、已删除的贡献者测试。合并后的门禁另发现 2 处测试类型漂移，以及功能地图漏登新路由、引用已删记忆提案组件的问题。

## Decision

1. **本地 main 只快进，work 只 merge**：本地 `main` 快进到 `0a6f7c4d`，以 `c77baaa9` 为 work 侧父提交完成合并，不 rebase、不重写历史。本次不推送分支或 tag；同步前确认 `Publish container images` 仍为 `disabled_manually`。
2. **README 与贡献者测试保留 work 边界**：上游 README 的唯一新增差异是删掉贡献者表格中的一名成员，该表格在 work 已整体删除，因此 README 保持 work 内容；`web/test/welcome-contributors.test.ts` 继续删除，不复活只服务于已删除展示区的断言。依据仍是 [README 内容边界](../simplification/2026-10-15-sponsors-contributors-removal.md)。
3. **xAI 插件保留上游协议修复，再重放品牌**：保留 `response.video.url` 嵌套结果提取；manifest 的作者与内嵌文档继续使用意绘。新增 `coolhs-wan3-relay` 同样规范作者文案。两个 `.yingce-plugin` 均以上游包为基准，仅替换各 3 处品牌文本，保留条目名、顺序、压缩方式与其余字节内容；全部条目与合并后源码逐一相等。`yingce.plugin/v2` 等标识符不改，不运行全量生成器。
4. **测试类型只补真实合同**：`canvas-node-generation-reveal.harness.tsx` 的部分 `matchMedia` 替身显式经过 `unknown` 转换；`video-screen-specs.test.tsx` 的表单夹具补上 `priceCurrency: "credits"`。不新增 `any`，不删断言，不放宽类型门禁。
5. **功能地图跟随入口变化**：登记 `/admin/user-groups`；记忆设置锚点从已删的提案组件转到记忆文件 API；更新后台记忆文件默认页，补充短剧精修画布、行业推荐安装、Agent 右侧停靠的入口说明。地图共有 63 条 Router 路由、6 个路由开关、216 个有效锚点。
6. **冲突规则补齐品牌与插件产物一类**：`docs/AGENT_LOCAL_DEVELOPMENT.md` 第 3 节明确沿用品牌策略、吸收上游协议修复、定向核对产物，不把品牌冲突变成整包二选一。其他类别仍按原有结算表执行。

### 既有笔记审计

[冲突结算规范](./2026-10-28-upstream-conflict-resolution-policy.md) 与 [品牌改名](../feature/2026-10-28-brand-name-yihui.md) 部分重叠，规则不翻转，分别补充当前类别与本次同步的互链。[v1.7.2 同步](./2026-10-28-upstream-sync-v1-7-2.md) 是不同批次的证据，保留，不覆盖或归档。检索范围没有待处理的 proposed / rejected 提案。

## Alternatives considered

- **xAI 插件整包取 work**：最容易保住品牌，且二进制差异最小。否决理由：会丢失本次上游修复的嵌套 `video.url` 结果提取，源码、文档和产物也可能分裂。
- **插件 manifest 与产物整包取 main**：上游实现和包天然一致，解决冲突最快。否决理由：会回退既有品牌决定；新插件也会重新引入旧作者文案。选择上游实现加定向品牌重放，而不是撤销品牌。
- **运行全量插件生成与打包脚本**：产物由源码生成，长期维护更直接。否决理由：[品牌改名](../feature/2026-10-28-brand-name-yihui.md) 已记录生成器与现存文件不幂等、部分包存在历史漂移；全量重建会把无关版本和能力变动带进本次合并。这里只处理确实变化的两个包并逐条目核对。

## Consequences

- 收益：用户分组与多币种计价、个人记忆文件、行业技能推荐、短剧精修画布与并行出片、生成进度和按钮更新进入 work，同时保留二开品牌、README 展示边界与历史。
- 代价：上游仍独立维护品牌与贡献者展示，后续同步仍需按类别重放；派生插件文档与包需要一起核对，不能仅依赖 Git 的文本合并。
- 已知上限：自动化门禁不代表真实页面、收费模型调用或存量部署升级通过；浏览器与真实插件调用待人工复核，入口记录在 `docs/content/docs/progress/pending-test.mdx`。测试使用临时 PostgreSQL 容器与测试自行启动的 Redis，不接触开发账号库，容器已清理。

## Verification

- `cd web && bun install --frozen-lockfile`、`bun run typecheck:test`、`bun run lint`、`bun run build` 通过；`bun test`：2908 pass、0 fail，402 个文件。构建仍有包体积和无效动态导入提示，不作为失败处理。
- `cd backend && go test -json -timeout=20m ./...`：3589 项通过、3 项设计内跳过（付费 API、浏览器 runner、Linux errno）；配置临时 PostgreSQL DSN，Redis 可执行文件可用，依赖用例检查器确认 5 项全部执行通过。
- `cd backend && go test -count=1 ./internal/protocol` 与 `go build ./...` 通过；插件产物校验刻意禁用测试缓存，以读取本次变更后的真实包字节。
- `verify-feature-map` 与 `python3 .github/scripts/check-env-docs.py` 通过；决策笔记三线校验通过。工具链为 Bun 1.3.9、Go 1.26.0；本机 Node 24.14.0，未替换为 CI 的 Node 22.19.0。
- 未做浏览器验收、收费上游调用、镜像构建或服务器部署；未启用 dev server，未推送远端。
