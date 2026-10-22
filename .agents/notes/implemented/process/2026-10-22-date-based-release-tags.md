# Agent Note: 二开发布版本号改为日期 + 时分（vYYYY.MM.DD-HHMM），弃用 fork- 前缀

Status: implemented

## Problem

二开发布沿用了 `fork-v<上游 VERSION>.<二开序号>`（[二开发布身份](./2026-10-15-fork-release-identity.md)）。它解决了"与上游 tag 同命名空间"的问题，但把版本号绑在上游 `VERSION` 文件上，代价在使用中持续放大：

- **版本号表达的不是这次发布**：`fork-v1.6.8.3.1` 里 `v1.6.8.3` 是上游 `VERSION`，`.1` 是二开序号。看到版本号既不知道是哪天发的、也不知道它包含哪批二开改动；上游一 bump，二开版本号就跟着跳，内容却与上游版本号无关（二开经常不包含上游最新提交）。
- **每次发版都要查 `VERSION` 并手算序号**：`prepare` 必须读 `VERSION`、比较前缀、判断后缀是不是 `.N`，才能决定放行；人也要先 `cat VERSION` 才知道该打什么 tag。
- **前缀在四处重复解释**：部署参数 `CANVAS_IMAGE_TAG`、镜像标签、Release 名与文档示例都要说明 `fork-` 是什么；它只解决"不与上游 `v*` 撞名"，而这本来可以用号段解决。

## Decision

二开发布版本号改成**日期 + 时分**，不带任何前缀：

| 名字 | 取值 | 例子 |
| --- | --- | --- |
| Git tag / Release 名 | `vYYYY.MM.DD-HHMM`（北京时间） | `v2026.10.22-1706` |
| 镜像标签 | 同一串去掉 `v` | `2026.10.22-1706` |
| `prepare` 输出的 `version` | 同上（写进 `BUILD_VERSION` 与镜像 label） | `2026.10.22-1706` |

`publish-fork-images.yml` 随之调整：

- 触发只认日期版本号：`on.push.tags` 用字符类 glob `v[0-9][0-9][0-9][0-9].[0-9][0-9].[0-9][0-9]-[0-9][0-9][0-9][0-9]`，同步工作流推进来的上游 `v1.x` tag 不会命中。
- `prepare` 用正则 `^v[0-9]{4}\.[0-9]{2}\.[0-9]{2}-[0-9]{4}$` 二次钉住格式（glob 只保证形状），并用 `git merge-base --is-ancestor "$GITHUB_SHA" origin/work` 拒绝不在 `work` 上的 tag。
- 不再读 `VERSION`：`version` 直接由 tag 推导，`image_tag` 与 `release_tag` 拆成两个输出——推广镜像用去 `v` 的 `image_tag`，建 Release 用带 `v` 的 `release_tag`。
- `workflow_dispatch` 预演仍只构建 `sha-` 镜像；`version_tag` 现在按 Docker 标签规则校验，不接受 `latest`。

日期版本号必须能被 `hostupdate.CompareVersions` 认成正式版本，所以**日期部分只能点分，且至少三段数字**：

- `backend/internal/hostupdate/version.go` 的 `parseVersion` 要求 ≥3 段点分数字，否则 `IsReleaseVersion` 为假、`CompareVersions` 退化成字典序比较，Host Updater 会把新版本当成"不是更新"；
- `v2026.10.22-1706` 解析为 core `[2026,10,22]` + 预发布段 `[1706]`，`1706 < 1730` 这类同日内先后顺序也按数字比较，成立；
- 因此 `v20261022-1706`（紧凑写法）与 `v2026.10.22`（无时分）都不允许：前者不是版本号，后者无法区分同一天多次发布。

镜像标签去 `v` 是既有的部署契约，不是新规矩：`scripts/install-server-image.sh` 用 `${REQUESTED_IMAGE_TAG#v}`、`scripts/install-host-updater.sh` 见到首位数字就补 `v`、`host-updater` 写 `.env` 时 `TrimPrefix(version, "v")`。上游 `v1.6.9` → 镜像 `1.6.9` 同样走这条路径，二开只是回到同一套规则。

`scripts/fork-deploy-image.sh` 增加一条拒绝：`CANVAS_IMAGE_TAG` 必须匹配 `^v[0-9]{4}\.[0-9]{2}\.[0-9]{2}-[0-9]{4}$`；误传上游 tag 时直接给出原因，不再等到 `docker compose pull` 才失败。

## Alternatives considered

- **保留 `fork-v<上游版本>.<序号>`，只在发布说明里补日期** — 不动流水线，成本最低。否决理由：版本号本身仍然表达"对应哪个上游版本"，而这个对应关系在二开仓库里本来就不成立，也要继续维护 `VERSION` 解析与序号。
- **`v20261022-1706`（紧凑日期）** — 更短，也完全避开与上游 `v1.x` 的相似性。否决理由：`parseVersion` 只有一段数字，Host Updater 会把它当非发布标签，更新检测与版本比较直接失效——分辨率是"每次自更新都判不出来"，代价远大于两个点号。
- **`2026.10.22.1706`（四段点分、不带 `v`）** — 版本比较天然成立，`v` 前缀的删除/补齐也不存在了。否决理由：Release tag 不带 `v` 与仓库里所有历史 tag、README 与安装脚本的示例都不一致，而 `install-host-updater.sh` 对"首位是数字"的值会补 `v`，反而会去找 `v2026.10.22.1706` 这个不存在的 Release。
- **继续用语义化版本 `v1.6.9.1`、`v1.6.9.2` 自行递增** — 与上游号段形状一致，比较逻辑零改动。否决理由：二开与上游不是同一个版本序列，号段早晚与上游重叠（同步工作流会把上游同名 tag 推进来），撞名时只能改写历史。

## Consequences

- **收益**：版本号直接读出发布时间；发版不再依赖 `VERSION` 与序号计算；上游 bump 不再连带改变二开版本号；发布只允许来自 `work`，tag 打在特性分支上会被流水线拒绝。
- **代价与已知上限**：
  - 同一分钟内不能发两次版（tag 冲突）；时间戳是本地时区，tag 一旦打错只能删 tag 重打，已产生的 Release 资产要人工清理。
  - 版本号不再编码"对应哪个上游版本"，需要时只能靠 Release 的自动生成说明（前后 commit 列表）追溯。
  - `publish-fork-images.yml` 的文件名、job 名里的 fork 字样保留（改名的代价是丢历史 run 与文档锚点），只有版本号去掉了前缀。
- **验证**：`prepare` 脚本逐例执行——`v2026.10.22-1706` 在 `work` 上得到 `version=2026.10.22-1706`、`image_tag=2026.10.22-1706`、`release_tag=v2026.10.22-1706`、`release=true`；`v1.6.9`、`v2026.10.22-170`、`v2026.10.22-1706-snap`、不在 `work` 上的提交、预演标签 `latest` 全部退出 1 并给出对应原因；`dry-run` 预演退出 0 且 `release=false`。`bash -n` 覆盖全部 `run` 片段，`fork-deploy-image.sh --check-only` 对日期 tag 与上游 tag 两种输入分别放行/拒绝。
