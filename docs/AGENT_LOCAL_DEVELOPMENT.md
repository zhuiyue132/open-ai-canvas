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
| `work` | 二开主线（fork 默认分支） | 日常开发、合并、推送都在这里 |

二开工作流：从 `work` 切特性分支 → PR/合并回 `work` → 需要发版时在 `work` 打 `v*` tag。

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
- 手动触发可选参数：`work_mode`（`merge` 默认 / `rebase` / `none`）、`push_tags`（默认 true）。
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

- **不要在 `work` 上强推**。`rebase` 同步模式（`work_mode=rebase`）会用 `--force-with-lease` 推送，其他人本地会需要 `git reset` 才能继续；多人/多 Agent 并行时保持默认 `merge` 模式。
- **`main` 的跟踪关系**：本地 `main` 跟踪 `origin/main`（fork 的镜像分支），`git pull` 拿到的是 fork 的镜像，不是上游；要拉上游必须显式 `git fetch upstream`。
- **不要在 fork 里复用上游的发布流水线**。`publish-images.yml` 已禁用，二开发版请另写一份 fork 自己的工作流放在 `work` 上。
- **上游 tag 与二开 tag 不要同名**。同步工作流会把上游 `v*` tag 推到这个仓库，二开自己的版本 tag 需要换成不会被上游占用的名字。
