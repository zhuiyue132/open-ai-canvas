import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 新增测试文件的类型闸门。
//
// 背景：`tsconfig.json` 只包含 src（构建用的 tsc 也只会看 src），310+ 个测试文件长期不在
// 类型检查范围内。整目录纳入 `tsc -p tsconfig.test.json` 会立刻暴露 56 个文件里的存量错误，
// 其中多数是测试替身与真实类型不一致，需要逐个判断，不能靠 `as unknown as` 一把梭抹平。
//
// 因此本脚本只拦新增：diff 里新出现的测试文件（含未跟踪文件）必须是类型干净的。存量 56 个
// 文件保持现状，`bun run typecheck:test` 可随时量化剩余欠账，欠账清零后把这个脚本换成整目录检查。

const TEST_FILE_PATTERN = /\.(ts|tsx|mts|cts)$/;

function git(args, cwd) {
    const result = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
    return result.stdout;
}

export function resolveBase({ cwd, baseSha, headSha = process.env.GITHUB_SHA || "HEAD", log = console.log }) {
    const head = git(["rev-parse", "--verify", `${headSha}^{commit}`], cwd).trim();
    const parent = git(["rev-list", "--parents", "-n", "1", head], cwd).trim().split(" ")[1] || null;
    if (!baseSha || /^0+$/.test(baseSha)) return parent;
    if (!/^[0-9a-f]{40}$/i.test(baseSha)) throw new Error(`Invalid base SHA: ${baseSha}`);
    const resolved = spawnSync("git", ["rev-parse", "--verify", `${baseSha}^{commit}`], { cwd, encoding: "utf8" });
    if (resolved.status === 0) return resolved.stdout.trim();
    log(`Base SHA ${baseSha} is unavailable; checking against the head parent instead.`);
    return parent;
}

export function collectNewTestFiles({ cwd, base, head, log = console.log }) {
    const added = base ? git(["diff", "--relative", "--name-only", "--diff-filter=A", "-z", base, head, "--", "test"], cwd) : git(["ls-tree", "-r", "--name-only", "-z", head, "--", "test"], cwd);
    const untracked = git(["ls-files", "--others", "--exclude-standard", "-z", "--", "test"], cwd);
    const files = [...added.split("\0"), ...untracked.split("\0")].filter((file) => file.startsWith("test/") && TEST_FILE_PATTERN.test(file));
    return [...new Set(files)].sort();
}

export function parseDiagnostics(output) {
    const diagnostics = [];
    for (const line of output.split("\n")) {
        // tsc 逐条诊断形如 "test/x.test.ts(12,5): error TS2322: ..."，续行不带位置前缀。
        const match = /^(.+?)\((\d+),(\d+)\): error (TS\d+):/u.exec(line.trim());
        if (match) diagnostics.push({ file: match[1], line: Number(match[2]), column: Number(match[3]), code: match[4], text: line.trim() });
    }
    return diagnostics;
}

export function runTestTypecheck({ cwd }) {
    const tsc = path.join(cwd, "node_modules", ".bin", "tsc");
    if (!existsSync(tsc)) throw new Error(`tsc not found at ${tsc}; run bun install first`);
    const result = spawnSync(tsc, ["-p", "tsconfig.test.json", "--pretty", "false"], { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    if (result.error) throw result.error;
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    const diagnostics = parseDiagnostics(output);
    // 存量欠账会让 tsc 以非零码退出，只有当它连一条诊断都没给出时才当作真正的失败。
    if (!diagnostics.length && result.status !== 0) {
        throw new Error(`tsc failed without diagnostics (exit ${result.status}):\n${output.trim().slice(0, 4000)}`);
    }
    return diagnostics;
}

export async function checkNewTestTypes({ cwd = process.cwd(), baseSha = process.env.BASE_SHA, headSha = process.env.GITHUB_SHA || "HEAD", log = console.log } = {}) {
    const head = git(["rev-parse", "--verify", `${headSha}^{commit}`], cwd).trim();
    const base = resolveBase({ cwd, baseSha, headSha: head, log });
    const newFiles = collectNewTestFiles({ cwd, base, head, log });
    if (!newFiles.length) {
        log("No new test files in this change.");
        return { newFiles, failures: [], backlog: null };
    }
    const diagnostics = runTestTypecheck({ cwd });
    const newFileSet = new Set(newFiles);
    const failures = diagnostics.filter((diagnostic) => newFileSet.has(diagnostic.file));
    const backlog = { errors: diagnostics.length, files: new Set(diagnostics.map((diagnostic) => diagnostic.file)).size };
    if (failures.length) {
        throw new Error(`新增测试文件必须类型干净，以下错误需要修掉：\n${failures.map((failure) => `  ${failure.text}`).join("\n")}`);
    }
    log(`${newFiles.length} new test file(s) type-checked clean; legacy backlog: ${backlog.errors} error(s) in ${backlog.files} file(s).`);
    return { newFiles, failures, backlog };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    checkNewTestTypes().catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
}
