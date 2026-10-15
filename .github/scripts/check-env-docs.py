#!/usr/bin/env python3
"""Fail when backend code reads a CANVAS_* env var that no doc explains.

Why: the runtime surface grew to dozens of CANVAS_* knobs while .env.example and
docs/ only covered a subset. An operator cannot discover or set a knob that is
read by the code but exists in no template, and the drift is invisible in review.

Scope: every env read in backend/ (os.Getenv, os.LookupEnv, and the local
env/envInt/envBool/envDuration helpers), excluding _test.go files and the host
updater, which reads CANVAS_UPDATER_* only from the host-side updater service
that the install script configures.

Documented means the name appears in .env.example, README.md, AGENTS.md,
SECURITY.md, or any docs/**/*.md(x). Commented template lines count: the entry
that carries the semantics may be a comment (empty values are treated as unset
by env()/envInt()/envBool()/envDuration(), so templates ship suggested values
commented out).
"""

from __future__ import annotations

import pathlib
import re
import subprocess
import sys

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]

# 与代码里的读取入口一一对应：新增 helper 时在这里补名字，否则该变量会被漏检。
READ_PATTERN = re.compile(
    r'(?:os\.(?:Getenv|LookupEnv)|env|envInt|envBool|envDuration)\s*\(\s*"(CANVAS_[A-Z0-9_]+)"'
)

# 宿主机更新器（install-host-updater.sh 写入 .env 并由 host-updater 自己读）不在本节约束内：
# 它不是用户配置面，而是安装脚本与备份/自更新服务之间的内部契约。
EXCLUDED_PREFIXES = (
    "backend/cmd/host-updater/",
    "backend/internal/hostupdate/",
    "backend/internal/updaterclient/",
)

DOC_FILES = (".env.example", "README.md", "AGENTS.md", "SECURITY.md")


def tracked_files(*suffixes: str) -> list[str]:
    result = subprocess.run(
        ["git", "ls-files", *[f"*{suffix}" for suffix in suffixes]],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
    return [line for line in result.stdout.splitlines() if line]


def read_text(relative: str) -> str:
    return (REPO_ROOT / relative).read_text(encoding="utf-8", errors="ignore")


def collect_reads() -> dict[str, set[str]]:
    reads: dict[str, set[str]] = {}
    for path in tracked_files(".go"):
        if not path.startswith("backend/") or path.endswith("_test.go"):
            continue
        if path.startswith(EXCLUDED_PREFIXES):
            continue
        for name in READ_PATTERN.findall(read_text(path)):
            reads.setdefault(name, set()).add(path)
    return reads


def collect_documented() -> str:
    parts = [read_text(path) for path in DOC_FILES if (REPO_ROOT / path).exists()]
    parts += [read_text(path) for path in tracked_files(".md", ".mdx") if path.startswith("docs/")]
    return "\n".join(parts)


def main() -> int:
    reads = collect_reads()
    documented = collect_documented()
    missing = {name: sorted(paths) for name, paths in reads.items() if name not in documented}

    if missing:
        print("以下 CANVAS_* 环境变量被后端代码读取，但没有出现在 .env.example 或文档里：", file=sys.stderr)
        for name in sorted(missing):
            print(f"  {name}  ({', '.join(missing[name])})", file=sys.stderr)
        print(
            "\n把它们连同默认值、取值区间和影响写进 .env.example（可选开关用注释行），"
            "或在脚本里说明为什么不需要登记。",
            file=sys.stderr,
        )
        return 1

    print(f"ok: {len(reads)} CANVAS_* env var(s) read by backend are documented")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
