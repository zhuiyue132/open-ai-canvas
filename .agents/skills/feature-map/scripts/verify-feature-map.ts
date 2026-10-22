/** 功能地图漂移校验：路由树双向登记、开关名称登记、锚点及验收测试文件存在性。 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { readRouterContract } from "../../../../web/scripts/feature-map-routes";

const ROUTER_FILE = "web/src/router.tsx";
const MAIN_FILE = "web/src/main.tsx";
const MAP_FILE = ".agents/skills/feature-map/FEATURE_MAP.md";

const OUT_OF_ROUTER_SURFACES = [
    {
        route: "/welcome",
        file: MAIN_FILE,
        marker: "\\/welcome\\/?$",
        note: "欢迎页在 main.tsx 分流到独立 root（welcome-application.tsx）",
    },
];

export function findRepoRoot(start: string): string {
    let current = resolve(start);
    for (let depth = 0; depth < 6; depth += 1) {
        if (existsSync(join(current, ROUTER_FILE))) return current;
        const parent = dirname(current);
        if (parent === current) break;
        current = parent;
    }
    throw new Error(`找不到仓库根目录：从 ${start} 向上 6 层都没有 ${ROUTER_FILE}`);
}

function read(root: string, relative: string): string {
    return readFileSync(join(root, relative), "utf8");
}

function backtickTokens(mapSource: string): string[] {
    return [...mapSource.matchAll(/`([^`\n]+)`/g)].map((match) => match[1].trim());
}

function isRouteToken(token: string): boolean {
    if (token === "/") return true;
    if (token === "/api" || token.startsWith("/api/")) return false;
    // 允许可选段和 splat，但不把带查询参数的深链或正则当成路由。
    return /^\/[A-Za-z0-9:_.*-]+\??(?:\/[A-Za-z0-9:_.*-]+\??)*\/?$/.test(token);
}

function anchorPaths(token: string): string[] {
    // 测试命令是一个 code span，必须检查其中每个路径，不能只看 span 的开头。
    const matches = token.matchAll(/(?:^|[\s"'])(?:\.\/)?((?:web|backend|plugin-packages|yingce-agent|scripts|docs|tools|\.agents|test)\/[^\s"'`;&|]+)/g);
    return [...matches].map((match) => (match[1].startsWith("test/") ? `web/${match[1]}` : match[1]));
}

export function verifyFeatureMap(root: string) {
    const failures: string[] = [];
    const { routes, featureFlags } = readRouterContract(read(root, ROUTER_FILE));
    const mapSource = read(root, MAP_FILE);
    const tokens = backtickTokens(mapSource);
    const documentedRoutes = new Set(tokens.filter(isRouteToken));
    const outOfRouter = new Set(OUT_OF_ROUTER_SURFACES.map((surface) => surface.route));

    for (const surface of OUT_OF_ROUTER_SURFACES) {
        if (!documentedRoutes.has(surface.route)) failures.push(`非路由界面未登记：${surface.route}`);
        if (!existsSync(join(root, surface.file)) || !read(root, surface.file).includes(surface.marker)) {
            failures.push(`非路由界面 ${surface.route} 的分流标记已不在 ${surface.file}（${surface.note}）。若该界面已删除，同步删掉脚本里的条目和图里的行。`);
        }
    }
    for (const route of routes) {
        if (!documentedRoutes.has(route)) failures.push(`新增路由未登记：${route}（在 ${MAP_FILE} 对应功能块补一行「抵达」）`);
        if (outOfRouter.has(route)) failures.push(`路由 ${route} 同时出现在 router.tsx 与 OUT_OF_ROUTER_SURFACES，二选一`);
    }
    for (const route of documentedRoutes) {
        if (!routes.has(route) && !outOfRouter.has(route)) failures.push(`图中路由不存在：${route}（已从 ${ROUTER_FILE} 移除，或写错参数名）`);
    }
    const documentedFlags = new Set([...mapSource.matchAll(/^\|\s*`([A-Za-z][A-Za-z0-9_]*)`\s*\|.+$/gm)].map((match) => match[1]));
    for (const flag of featureFlags) {
        if (!documentedFlags.has(flag)) failures.push(`feature flag 未解释：${flag}（在 §1「feature flag 现状」补一行）`);
    }

    const anchors = new Set<string>();
    for (const token of new Set(tokens)) {
        if (token === "SKILL.md") anchors.add(`${dirname(MAP_FILE)}/${token}`);
        else if (/^[\w.*-]+\.(?:[cm]?[jt]sx?|go|mdx?|json|ya?ml|sh)$/.test(token)) {
            failures.push(`锚点必须使用仓库相对完整路径：${token}`);
        }
        for (const path of anchorPaths(token)) anchors.add(path);
    }
    const checkedAnchors = new Set<string>();
    for (const anchor of anchors) {
        if (anchor.split("/").includes("..") || anchor.includes("\\")) {
            failures.push(`锚点不能越出登记目录：${anchor}`);
            continue;
        }
        if (/[\*?\[\]{}]/.test(anchor)) {
            const matches = [...new Bun.Glob(anchor).scanSync({ cwd: root, onlyFiles: false })];
            if (!matches.length) failures.push(`锚点模式没有匹配：${anchor}`);
            for (const match of matches) checkedAnchors.add(match);
        } else if (!existsSync(join(root, anchor))) failures.push(`锚点不存在：${anchor}`);
        else checkedAnchors.add(anchor);
    }
    return {
        failures,
        routes: routes.size,
        surfaces: outOfRouter.size,
        flags: featureFlags.size,
        anchors: checkedAnchors.size,
    };
}

if (import.meta.main) {
    try {
        const result = verifyFeatureMap(findRepoRoot(process.cwd()));
        if (result.failures.length) {
            for (const failure of result.failures) console.error(`FAIL  ${failure}`);
            console.error(`\n${result.failures.length} 项失败。功能地图：${MAP_FILE}`);
            process.exitCode = 1;
        } else {
            console.log(`ok    路由 ${result.routes} 条：${ROUTER_FILE} 与图一致`);
            console.log(`ok    非路由界面 ${result.surfaces} 条：已登记且分流标记仍在`);
            console.log(`ok    feature flag ${result.flags} 个：图内均有登记行`);
            console.log(`ok    代码锚点 ${result.anchors} 个：含命令中的测试文件与模式匹配，均在磁盘上存在`);
            console.log(`\nok    ${MAP_FILE} 通过路由、开关登记和锚点存在性校验`);
        }
    } catch (error) {
        console.error(`FAIL  ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
    }
}
