#!/usr/bin/env bash
#
# 二开部署入口：把官方一键部署脚本的三个默认值从上游改成二开仓库，再交给它执行。
#
# 为什么需要这一层：`scripts/install-server-image.sh` 的默认值是
# `IMAGE_REPOSITORY=ghcr.io/ddcat-ai/open-ai-canvas` 和上游 raw.githubusercontent 的
# COMPOSE_URL。直接照 README 的命令执行，装出来的是**上游代码**，二开改动一行都不会生效，
# 而且不会有任何报错。这里把默认值换成二开仓库，并在解析结果仍指向上游时直接失败。
#
# 用法：
#   CANVAS_IMAGE_TAG=fork-v1.6.8.3.1 \
#     curl -fsSL "https://raw.githubusercontent.com/zhuiyue132/open-ai-canvas/fork-v1.6.8.3.1/scripts/fork-deploy-image.sh" | sudo bash
#
# 先看解析结果不安装：
#   scripts/fork-deploy-image.sh --check-only
#
# 前置条件：二开镜像与 Release 资产已由二开的发布流水线产出（见
# .agents/notes/implemented/process/2026-10-15-fork-release-identity.md）。
set -Eeuo pipefail

FORK_REPOSITORY="${FORK_REPOSITORY:-zhuiyue132/open-ai-canvas}"
FORK_OWNER="${FORK_REPOSITORY%%/*}"
UPSTREAM_OWNER="ddcat-ai"

CANVAS_IMAGE_TAG="${CANVAS_IMAGE_TAG:-}"
REPOSITORY_REF="${REPOSITORY_REF:-${CANVAS_IMAGE_TAG}}"
IMAGE_REPOSITORY="${IMAGE_REPOSITORY:-ghcr.io/${FORK_OWNER}/open-ai-canvas}"
COMPOSE_URL="${COMPOSE_URL:-https://raw.githubusercontent.com/${FORK_REPOSITORY}/${REPOSITORY_REF}/docker-compose.deploy.yml}"
UPDATER_INSTALL_URL="${UPDATER_INSTALL_URL:-https://raw.githubusercontent.com/${FORK_REPOSITORY}/${REPOSITORY_REF}/scripts/install-host-updater.sh}"
INSTALLER_URL="${INSTALLER_URL:-https://raw.githubusercontent.com/${FORK_REPOSITORY}/${REPOSITORY_REF}/scripts/install-server-image.sh}"

check_only=false
if [[ "${1:-}" == "--check-only" ]]; then
    check_only=true
elif [[ -n "${1:-}" ]]; then
    printf '用法：scripts/fork-deploy-image.sh [--check-only]\n' >&2
    exit 2
fi

step() { printf '\n==> %s\n' "$1"; }
fail() { printf '\n部署入口失败：%s\n' "$1" >&2; exit 1; }

validate() {
    [[ -n "$CANVAS_IMAGE_TAG" ]] || fail "必须显式指定二开 Release 标签，例如 CANVAS_IMAGE_TAG=fork-v1.6.8.3.1"
    [[ "$CANVAS_IMAGE_TAG" != "latest" ]] || fail "二开部署必须固定到具体 Release，不能使用 latest"
    [[ "$REPOSITORY_REF" == "$CANVAS_IMAGE_TAG" ]] || fail "REPOSITORY_REF 必须与 CANVAS_IMAGE_TAG 一致，避免 Compose/更新器取自另一个提交"
    [[ "$CANVAS_IMAGE_TAG" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$ ]] || fail "CANVAS_IMAGE_TAG 不是有效的 Docker 镜像标签"

    # 上游镜像仓库里的 tag 与二开 tag 互不相认：一旦解析到上游，部署出来的是别人的代码。
    case "$IMAGE_REPOSITORY" in
        *"${UPSTREAM_OWNER}"*) fail "IMAGE_REPOSITORY 指向上游仓库（${IMAGE_REPOSITORY}）；二开部署必须使用二开镜像，或先产出二开 Release" ;;
    esac
    case "$COMPOSE_URL" in
        *"${UPSTREAM_OWNER}"*) fail "COMPOSE_URL 指向上游仓库（${COMPOSE_URL}）；二开部署必须使用二开 Compose" ;;
    esac
    case "$UPDATER_INSTALL_URL" in
        *"${UPSTREAM_OWNER}"*) fail "UPDATER_INSTALL_URL 指向上游仓库（${UPDATER_INSTALL_URL}）" ;;
    esac
}

report() {
    cat <<EOF
二开部署参数：
  FORK_REPOSITORY        = ${FORK_REPOSITORY}
  CANVAS_IMAGE_TAG       = ${CANVAS_IMAGE_TAG}
  REPOSITORY_REF         = ${REPOSITORY_REF}
  IMAGE_REPOSITORY       = ${IMAGE_REPOSITORY}
  COMPOSE_URL            = ${COMPOSE_URL}
  UPDATER_INSTALL_URL    = ${UPDATER_INSTALL_URL}
  INSTALLER_URL          = ${INSTALLER_URL}
EOF
}

validate
report
if [[ "$check_only" == "true" ]]; then
    exit 0
fi

[[ "${EUID}" -eq 0 ]] || fail "请使用 sudo 运行（与官方安装脚本一致）"

step "下载二开安装脚本"
installer="$(mktemp)"
trap 'rm -f "$installer"' EXIT HUP INT TERM
curl -fsSL "$INSTALLER_URL" -o "$installer" || fail "无法下载 ${INSTALLER_URL}；确认该 Release 已发布 scripts/ 目录"

step "执行官方安装脚本（镜像、Compose 与更新器均指向二开仓库）"
env \
    CANVAS_IMAGE_TAG="$CANVAS_IMAGE_TAG" \
    REPOSITORY_REF="$REPOSITORY_REF" \
    IMAGE_REPOSITORY="$IMAGE_REPOSITORY" \
    COMPOSE_URL="$COMPOSE_URL" \
    UPDATER_INSTALL_URL="$UPDATER_INSTALL_URL" \
    bash "$installer"
