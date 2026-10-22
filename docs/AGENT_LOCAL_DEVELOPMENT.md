# Agent 本地开发说明

本文件位于 `docs/`，被 `.gitignore` 的 `docs/*` 规则忽略，**不随仓库分发、也不会进入提交或上游合并**：换机器或重新 clone 后需要按本文重建本地配置。

Agent runtime 的依赖安装、内嵌模式启动和数据目录约定见 [AGENTS.md](../AGENTS.md) 第 2 节「开始工作前」，这里不重复，避免两处内容漂移。本文只记录**本仓库特有的远端/分支约定**。

## 1. 仓库身份

这是 `ddcat-ai/open-ai-canvas` 的 GitHub fork（`zhuiyue132/open-ai-canvas`），按二开仓库使用：日常提交进自己的仓库，每期把上游变更同步进来。

```
origin    https://github.com/zhuiyue132/open-ai-canvas.git   # 二开仓库，唯一推送目标
upstream  https://github.com/ddcat-ai/open-ai-canvas.git     # 源仓库，只读
          └─ pushurl = no_push
```

配套的本地配置（存在 `.git/config`，不随仓库分发）：

| 配置 | 作用 |
| --- | --- |
| `remote.pushDefault=origin` | 即使分支跟踪的是 `upstream/*`，`git push` 也只推自己的仓库 |
| `remote.upstream.pushurl=no_push` | 误敲 `git push upstream` 会直接失败，防止把二开代码推到上游 |
| `fetch.prune=true` | 上游删分支后自动清理本地 `refs/remotes/upstream/*` |

重建方式（新 clone 或换机器时）：

```bash
git remote rename origin upstream          # 视 clone 来源而定
git remote add origin https://github.com/zhuiyue132/open-ai-canvas.git
git config remote.pushDefault origin
git config fetch.prune true
git remote set-url --push upstream no_push
```

需要给上游提 PR 时，临时恢复推送地址，用完改回：

```bash
git remote set-url --push upstream https://github.com/ddcat-ai/open-ai-canvas.git
# ... git push upstream <branch>
git remote set-url --push upstream no_push
```

## 2. 分支模型

| 分支 | 角色 | 允许的操作 |
| --- | --- | --- |
| `main` | 上游 `main` 的**纯镜像** | 只允许快进对齐上游；**永不承载本地提交** |
| `work` | 二开主线（fork 默认分支） | 日常开发、合并、推送都在这里；**只允许快进推送**，强推由 ruleset 拒绝 |

二开工作流：从 `work` 切特性分支 → PR/合并回 `work` → 需要发版时在 `work` 打日期版本号 tag（`vYYYY.MM.DD-HHMM`，北京时间）。

`work` 上挂着仓库级 ruleset「work 主线保护」（`non_fast_forward`，只作用于 `refs/heads/work`）：
任何非快进推送都会被服务端拒绝，包括 `git push --force` 与同步工作流的 `--force-with-lease`。
重写历史属于人工介入场景，需要临时停用规则：

```bash
ruleset=$(gh api repos/zhuiyue132/open-ai-canvas/rulesets --jq '.[] | select(.name=="work 主线保护") | .id')
gh api -X PUT "repos/zhuiyue132/open-ai-canvas/rulesets/$ruleset" -f enforcement=disabled   # 用完改回 active
```
注意：`git push --dry-run --force` 不校验 ruleset（本地就短路了），判断规则是否生效要用真实推送。

不变式（同步工作流和本地钩子都会校验）：

```bash
git fetch upstream --prune
git merge-base --is-ancestor refs/remotes/origin/main refs/remotes/upstream/main && echo "main 仍是纯镜像"
```

如果 `main` 上真的落了本地提交，处理方式是**把提交挪到 `work`**，再把 `main` 重新对齐上游（不要直接把二开提交留在 main 上等同步工作流去解）：

```bash
git switch -c rescue main            # 先把 main 上的提交存下来
git switch work && git cherry-pick <提交>
git branch -f main upstream/main     # main 指回上游；HEAD 不能停在 main 上
git push --force-with-lease origin main:main
```

## 3. 定时上游同步（推荐路径，无需手动）

`.github/workflows/fork-sync-upstream.yml`（位于 `work`，因此也是默认分支上的 workflow）：

- 触发：`cron: 0 18 * * *`（UTC 18:00 = 北京次日 02:00），以及手动 `workflow_dispatch`。
- 手动触发可选参数：`work_mode`（`merge` 默认 / `none`）、`push_tags`（默认 true）。`rebase` 模式已移除：它会改写 `work` 历史，被 ruleset 拒绝。
- 步骤与安全阀：
  1. **Preflight**：确认上游自带的 `publish-images.yml` 仍为 `disabled_manually`，否则中止本次同步。上游那份流水线按 `push: main` 和 `tags: v*` 触发，在 fork 里会往 `ghcr.io/zhuiyue132/*` 重复构建镜像，必须在 fork 中保持禁用（`gh workflow disable publish-images.yml -R zhuiyue132/open-ai-canvas`）。
  2. **Mirror main**：`git push origin upstream/main:main`，不带 `--force`，`main` 一旦被污染就报错停摆而不是覆盖。
  3. **Mirror tags**：`git fetch upstream --tags --force` 后 `git push origin --tags`。上游改写同名 tag 会失败并要求人工确认，不静默覆盖。
  4. **Sync work**：把 `upstream/main` 合并进 `work` 并推送；冲突就 `--abort` 保持仓库原样，开/更新 issue「上游同步冲突：work ← upstream/main」列出冲突文件，同时让 job 变红。
- 必须配置仓库 secret `SYNC_TOKEN`：fine-grained PAT，仓库只选本 fork，权限 **Contents: Read and write** + **Workflows: Read and write**（可选 **Actions: Read and write**，让预检能自动关掉被重新启用的发布流水线）。原因：上游经常改 `.github/workflows/*`，默认 `GITHUB_TOKEN` 推送含 workflow 改动的提交会被 GitHub 拒绝（`refusing to allow a GitHub App to create or update workflow ... without workflows permission`）。
- 注意：GitHub 会在仓库 60 天无活动后自动停用定时工作流，届时在 Actions 页面点 Enable。

## 4. 手工同步（不想等定时任务）

```bash
git fetch upstream --prune
git switch main && git merge --ff-only upstream/main && git push origin main
git switch work && git merge upstream/main && git push origin work
```

只同步 tag：

```bash
git fetch upstream --tags --force && git push origin --tags
```

## 5. 本地钩子：禁止在 main 上提交

`.git/hooks/pre-commit`（本地文件，不进仓库）：

```bash
git switch main                    # 钩子会拒绝提交并提示切到 work
ALLOW_MAIN_COMMIT=1 git commit ... # 逃生阀，仅调试用
```

新 clone 后重建：

```bash
cat > .git/hooks/pre-commit <<'HOOK'
#!/usr/bin/env bash
set -euo pipefail
[[ "${ALLOW_MAIN_COMMIT:-}" == "1" ]] && exit 0
[[ "$(git symbolic-ref --quiet --short HEAD || true)" == "main" ]] || exit 0
cat >&2 <<'MSG'
拒绝在 main 上提交：main 是上游 open-ai-canvas 的纯镜像分支，只允许快进对齐上游。
二开提交请放到 work：git switch work
临时绕过：ALLOW_MAIN_COMMIT=1 git commit ...
MSG
exit 1
HOOK
chmod +x .git/hooks/pre-commit
git hook run pre-commit            # 自检：在 main 上应报错退出
```

## 6. 常见坑

- **不要在 `work` 上强推**（现在会被 ruleset 拒绝，见 §2）。上游同步固定走 `merge`：`rebase` 需要改写历史，规则会直接拒绝；若工作区已被 rebase 过，先 `git reset --hard origin/work` 回到远端状态再合并。
- **`main` 的跟踪关系**：本地 `main` 跟踪 `origin/main`（fork 的镜像分支），`git pull` 拿到的是 fork 的镜像，不是上游；要拉上游必须显式 `git fetch upstream`。
- **不要在 fork 里复用上游的发布流水线**。`publish-images.yml` 已禁用（同步工作流的 preflight 会强制保持 `disabled_manually`），二开发布需要一份独立名字的工作流，见 §7。
- **上游 tag 与二开 tag 不要同名**。同步工作流会把上游 `v*` tag 推到这个仓库；二开用日期版本号 `vYYYY.MM.DD-HHMM`（北京时间），与上游 `v1.x` 号段不相交，见 §7。
- **不要照 README 的一键命令部署二开版本**。`scripts/install-server-image.sh` 默认指向 `ghcr.io/ddcat-ai/...` 和上游 Compose，装出来的是上游代码且不会报错；二开部署走 `scripts/fork-deploy-image.sh`，见 §7。
- **`web/vercel.json` 是上游初始提交里的 Vercel 配置，本仓库不使用也不维护**。部署只走 Docker + nginx（根 `Dockerfile` + `nginx.conf`）；照该文件把前端部署到 Vercel 不会有 `/api` 代理，接口全部 404。

## 7. 二开发布与部署身份

二开改动要能真正上线，镜像、Compose、更新器三样都必须指向二开仓库；只覆盖其中一样会得到"半上游"部署（例如新后端配旧 nginx 配置）。约定如下：

| 身份 | 二开取值 | 为什么不能沿用上游 |
| --- | --- | --- |
| 版本 tag | 日期版本号 `vYYYY.MM.DD-HHMM`（北京时间），例如 `v2026.10.22-1706` | 同步工作流会把上游 `v*` tag 推到本仓库，同名会互相覆盖；日期号段与上游 `v1.x` 不相交 |
| 镜像标签 | 同一个串去掉 `v`（`2026.10.22-1706`） | 安装脚本与更新器都会删 `v` 前缀再拉镜像，与上游 `v1.6.9` → `1.6.9` 一致 |
| 镜像仓库 | `ghcr.io/zhuiyue132/open-ai-canvas-{backend,web,yingce-agent}` | 上游镜像里没有二开代码 |
| Compose | `raw.githubusercontent.com/zhuiyue132/open-ai-canvas/<tag>/docker-compose.deploy.yml` | 上游 Compose 指向上游镜像 |
| Host Updater | `raw.githubusercontent.com/zhuiyue132/open-ai-canvas/<tag>/scripts/install-host-updater.sh` | 更新器按 `<IMAGE_REPOSITORY>` 拉取，仓库不一致会拉回上游 |

为什么日期必须点分成三段：`hostupdate.CompareVersions` 只把「≥3 段点分数字」的 tag 当正式版本号，`v20261022-1706` 这类紧凑写法会被归成非发布标签，更新判断失效。

发版（在 `work` 上打 tag，推送后由 `publish-fork-images.yml` 完成质量检查、双架构镜像、Release 资产）：

```bash
git switch work && git pull --ff-only
tag="v$(TZ=Asia/Shanghai date +%Y.%m.%d-%H%M)"
git tag -a "$tag" -m "$tag"
git push origin "$tag"
```

部署入口（把 `IMAGE_REPOSITORY`/`COMPOSE_URL`/`UPDATER_INSTALL_URL` 三个默认值一次改对，并在解析结果仍指向上游时直接失败）：

```bash
# 先看解析结果，不安装
CANVAS_IMAGE_TAG=v2026.10.22-1706 scripts/fork-deploy-image.sh --check-only

# 部署
CANVAS_IMAGE_TAG=v2026.10.22-1706 \
  curl -fsSL "https://raw.githubusercontent.com/zhuiyue132/open-ai-canvas/v2026.10.22-1706/scripts/fork-deploy-image.sh" \
  | sudo bash
```

镜像与 Release 资产是这条路径的前置条件：没有对应 tag 的镜像与 `SHA256SUMS` 时，`fork-deploy-image.sh` 会在 `docker compose pull` 阶段失败——这是预期行为，不要用"回退到上游镜像"绕过。

版本号只由 tag 名字决定（不再读 `VERSION`）：`VERSION` 仍然跟着上游，二开发版不需要改它，也不会因为上游 bump 而连带改变二开版本号。
