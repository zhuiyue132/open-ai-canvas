# Agent Note: 二开发布身份：fork-v tag 命名空间与拒绝上游镜像的部署入口

Status: implemented

> 版本号方案已由 [日期版本号发布](./2026-10-22-date-based-release-tags.md) 取代（`fork-v<上游版本>.<序号>` → `vYYYY.MM.DD-HHMM`）；镜像仓库、Compose、Host Updater 与部署入口的身份约定仍然有效。
>
> 事实更新（2026-10-28）：`fork-sync-upstream.yml` 已下线，本文提到的「同步工作流的 preflight 强制保持 `disabled_manually`」与「每日推送上游 tag」都改为手工同步前的检查与 `git push origin --tags`，见 [移除定时上游同步](./2026-10-28-remove-scheduled-upstream-sync.md)。身份约定本身不变。

## Problem

二开仓库继承的部署文档默认装的是**上游代码**，而且不会报错：

- `scripts/install-server-image.sh` 的默认值是 `IMAGE_REPOSITORY=ghcr.io/ddcat-ai/open-ai-canvas`、`COMPOSE_URL=https://raw.githubusercontent.com/ddcat-ai/open-ai-canvas/<ref>/docker-compose.deploy.yml`、`UPDATER_INSTALL_URL` 同理；根 `README.md` 的一键部署命令也直接调用上游 raw 地址。照抄执行后，容器里跑的是上游镜像与上游 Compose，二开改动一行都不会生效，也没有任何提示。
- `publish-images.yml` 在本仓库是 `disabled_manually`（原 `fork-sync-upstream.yml` 的 preflight 要求它保持该状态，否则每次同步都会重跑几十次镜像构建并让同步失败；该 workflow 已于 2026-10-28 下线，现由手工同步前复查，见 [移除定时上游同步](./2026-10-28-remove-scheduled-upstream-sync.md)），所以本仓库没有产出镜像、Release 资产与 `SHA256SUMS` 的路径。
- tag 命名空间与上游共享：同步工作流每天 `git fetch upstream --tags --force && git push origin --tags`，上游发布 `v1.6.8.4` 会占用本仓库同名 tag，二开自己的版本号无处安放。

三者叠加的后果是：二开版本既发不出来，也无法被"官方 Release + Host Updater"这条（AGENTS.md 指定的默认）路径安装，而唯一能用的默认命令装的是别人的代码。

## Decision

二开使用一套与上游正交的身份，三样必须同时切换，只切一样会得到"半上游"部署（例如新后端配旧 nginx 配置）：

| 身份 | 二开取值 |
| --- | --- |
| 版本 tag | `fork-v<上游版本>.<二开序号>`，例如 `fork-v1.6.8.3.1` |
| 镜像仓库 | `ghcr.io/zhuiyue132/open-ai-canvas-{backend,web,yingce-agent}` |
| Compose | `raw.githubusercontent.com/zhuiyue132/open-ai-canvas/<tag>/docker-compose.deploy.yml` |
| Host Updater | `raw.githubusercontent.com/zhuiyue132/open-ai-canvas/<tag>/scripts/install-host-updater.sh` |

部署入口是新增的 `scripts/fork-deploy-image.sh`：它先解析出上面四个值（环境变量仍可覆盖），把解析结果打印出来供核对，然后交给官方 `install-server-image.sh` 执行。它带三道拒绝：

1. `CANVAS_IMAGE_TAG` 必须显式给定且不能是 `latest`；
2. `REPOSITORY_REF` 必须与 `CANVAS_IMAGE_TAG` 一致（否则 Compose/更新器可能取自另一个提交）；
3. 解析结果里 `IMAGE_REPOSITORY`、`COMPOSE_URL`、`UPDATER_INSTALL_URL` 任一仍指向 `ddcat-ai` 时直接失败，不做静默回退。

`--check-only` 只打印解析结果与校验结论，不下载、不安装，也不需要 root。

约定写进 `docs/AGENT_LOCAL_DEVELOPMENT.md` 第 7 节与 `AGENTS.md` 第 7 节。

二开发布流水线是 `.github/workflows/publish-fork-images.yml`（独立文件名：上游继承来的 `publish-images.yml` 必须保持 `disabled_manually`，同步工作流的 preflight 会强制这一点）：

- 触发：推送 `fork-v*` tag 走完整流程；`workflow_dispatch` 走预演（只构建并推送 `sha-<commit>-<arch>` 镜像，不推广版本标签、不建 Release）。
- 版本校验：tag 必须是 `fork-<VERSION>` 或 `fork-<VERSION>.<序号>`（`VERSION` 仍是上游维护的 `v1.6.8.3`，末尾 `.N` 是二开序号），其余一律拒绝；嵌入二进制的版本用去掉 `fork-` 前缀的字符串。
- **不读 `CHANGELOG.md`**：上游近 30 天改了 38 次，二开条目会在每轮同步反复冲突；Release 说明用 `gh release create --generate-notes`。
- 推广步骤不调用上游的 `.github/scripts/promote-image.sh`：它把版本标签限定为 `refs/tags/v*` 且要求纯数字版本号，`fork-v*` 不满足；改为用 `docker buildx imagetools create` 把已验证的 digest 组装成版本标签（digest 不变，推广的是不可变内容），并校验 digest 数量（backend 双架构为 2）。
- Release 资产与上游一致（两个架构的 Host Updater 二进制 + `SHA256SUMS` + `docker-compose.deploy.yml`），安装脚本按 `REPOSITORY` 从 GitHub Releases 取用。

为了让"引导脚本 → 更新器 → Release 资产"这条链在二开仓库闭合，两个上游脚本各改了一处：

- `scripts/install-server-image.sh`：从 `UPDATER_INSTALL_URL` 推出 `REPOSITORY`（`raw.githubusercontent.com/<owner>/<repo>/...`）并传给更新器安装脚本；URL 不是 GitHub 时保持原有默认，不会误伤镜像站。
- `scripts/install-host-updater.sh`：`RELEASE_TAG` 的推导由"不以 `v` 开头就补 `v`"改为"纯数字才补 `v`，其余按原样"，否则 `fork-v1.6.8.3.1` 会被拼成 `vfork-v1.6.8.3.1` 去下载不存在的 Release。上游 `1.6.8.3` / `v1.6.8.3` 两种写法行为不变。

## Alternatives considered

- **直接改 `scripts/install-server-image.sh` 与 README 的默认值为二开仓库** — 改动最小，用户不需要记新命令。否决理由：这两个位置是上游文件与上游文档，改默认值等于每轮同步都要解一次冲突；而且"用官方脚本装上游官方版本"是正当用法，把默认值改掉会让这条路径消失。包装层 + 显式覆盖同时保住了两种用法。
- **在 `work` 上启用继承来的 `publish-images.yml`** — 不用写新代码就能拿到镜像与 Release。否决理由：同步工作流的 preflight 要求该 workflow 处于 `disabled_manually`，启用它会让每日同步直接失败；而且它的触发条件是 `main` 与 `v*`，与本仓库的 `fork-v*` 命名空间不符，fork 需要一份独立名字的工作流。
- **复用上游 `v*` tag 发布二开版本** — 版本号连续，用户不需要理解两套命名。否决理由：同步工作流会把上游 tag 推到本仓库，上游发布同名版本时要么推送失败、要么覆盖，二开与上游版本无法区分。
- **现在就写好二开发布工作流** — 一次性把发布路径补齐，不必等到需要时再写。否决理由：镜像构建涉及 GHCR 打包权限、双架构与 Release 资产，本地无法端到端验证；在没有任何部署面改动之前落一份未经运行的流水线，只会让"看起来已经支持发布"成为误导。

## Consequences

- **收益**：装错代码从静默变成拒绝；镜像、Compose、更新器三者身份一致，避免半上游部署；版本号与上游正交，`fork-v*` 与 `v*` 可以共存；核对部署参数不需要真的执行安装。
- **代价与已知上限**：
  - 部署前置条件是二开 Release 已产出。在发布工作流建立前，`fork-deploy-image.sh` 会一路走到 `docker compose pull` 才失败（预期行为，不是缺陷）。
  - `--check-only` 只能校验身份与内部一致性，不能证明镜像、`SHA256SUMS` 或 Release 资产真的存在。
  - 包装脚本本身也是二开文件，需要跟着上游安装脚本的接口变化维护（上游若改环境变量名，它不会自动跟随）。
  - 发布流水线**从未真正跑过一次 `fork-v*` 发布**：本地只能验证标签校验、脚本语法与被引用文件，GHCR 推送、双架构构建与 Release 创建都要等第一次真实运行；`workflow_dispatch` 的预演用来先验证构建。
  - 发布要消耗双架构 Runner（含 `ubuntu-24.04-arm`），且 `fork-v*` tag 打错会直接失败——这是有意的，避免把上游版本号当二开发版。

## Verification

- `bash -n scripts/fork-deploy-image.sh` 通过。
- 校验分支逐个执行：`CANVAS_IMAGE_TAG=fork-v1.6.8.3.1 --check-only` 打印六个解析值并退出 0；缺 tag、`latest`、`REPOSITORY_REF` 与 tag 不一致、`IMAGE_REPOSITORY`/`COMPOSE_URL`/`UPDATER_INSTALL_URL` 指向上游，六种输入全部退出 1 并给出对应原因；非 root 执行在下载前退出并提示用 sudo。
- 修掉一个实测到的缺陷：`$VAR` 紧跟全角字符时 bash 会把多字节首字节并入变量名（`set -u` 下报 `IMAGE_REPOSITORY…: unbound variable`），变量引用全部改为 `${VAR}` 后三条拒绝信息恢复正常（`grep` 校验已无裸 `$VAR` 紧邻非 ASCII）。
- 发布流水线（本地可验证的部分）：YAML 可解析、全部 `run` 片段 `bash -n` 通过、被引用的 `Dockerfile`/`backend/Dockerfile`/`yingce-agent/Dockerfile`/`docker-compose.deploy.yml`/`cmd/host-updater` 都存在；`prepare` 步骤的标签校验在 bash 5 容器里逐例验证：`fork-v1.6.8.3.1` 与 `fork-v1.6.8.3` 通过（`release=true`，owner 小写化正确），`fork-v1.6.8`、`fork-v1.6.8.3.x` 与裸 `v1.6.8.3` 被拒绝，`workflow_dispatch` 得到 `image_tag=dry-run` / `release=false`。
- 两个脚本改动：`RELEASE_TAG` 推导四种输入（`1.6.8.3` → `v1.6.8.3`；`v1.6.8.3`、`fork-v1.6.8.3.1`、`fork-v1.6.8.3` → 原样）；`REPOSITORY` 从更新器 URL 提取三种输入（二开 URL → `zhuiyue132/open-ai-canvas`；上游 URL → `ddcat-ai/open-ai-canvas`；非 GitHub URL → 空并回落默认）。两个脚本 `bash -n` 通过。
- 未验证：真实 `fork-v*` 的端到端发布（GHCR 推送、双架构构建、Release 创建）与 Host Updater 自更新——需要先由人触发一次发布或预演。
