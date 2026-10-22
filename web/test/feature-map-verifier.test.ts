import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { findRepoRoot, verifyFeatureMap } from "../../.agents/skills/feature-map/scripts/verify-feature-map";
import { readRouterContract } from "../scripts/feature-map-routes";

const repoRoot = resolve(import.meta.dir, "../..");
const script = join(repoRoot, ".agents/skills/feature-map/scripts/verify-feature-map.ts");
const mapFile = ".agents/skills/feature-map/FEATURE_MAP.md";
const temporaryRoots: string[] = [];
const routerSource = (routes: string) => `import { createBrowserRouter } from "react-router"; export const router = createBrowserRouter(${routes});`;

function write(root: string, path: string, content: string) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
}

function fixture(routes = '[{ path: "/", element: null }]', map = "`/`\n`/welcome`") {
    const root = mkdtempSync(join(tmpdir(), "feature-map-test-"));
    temporaryRoots.push(root);
    write(root, "web/src/router.tsx", routerSource(routes));
    write(root, "web/src/main.tsx", String.raw`const welcome = /^\/welcome\/?$/.test(location.pathname);`);
    write(root, mapFile, map);
    return root;
}

afterEach(() => {
    for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("feature map route tree", () => {
    test("resolves pathless layouts, indexes, relative children and nested admin routes", () => {
        const result = readRouterContract(
            routerSource(`[
            { children: [{ index: true }, { path: 'review-probe' }] },
            { path: '/admin', children: [
                { index: true },
                { path: 'settings', children: [{ path: 'users' }, { path: '/admin/settings/audit' }] }
            ] },
            { path: '/projects/:id?', children: [{ path: '*' }] },
            { path: '*' }
        ]`),
        );
        expect([...result.routes]).toEqual(["/", "/review-probe", "/admin", "/admin/settings", "/admin/settings/users", "/admin/settings/audit", "/projects/:id?", "/projects/:id?/*"]);
    });

    test("reads aliases, static arrays, factories and both DEV branches without executing them", () => {
        const result = readRouterContract(`
            import { createBrowserRouter as create } from 'react-router';
            const extra = [{ path: 'extra' }] as const;
            function devRoutes() {
                const page = lazy(() => import('browser-only-module'));
                return [{ path: 'dev', element: <Page label={'] path: "/fake"'} /> }];
            }
            const prodRoutes = () => [{ path: 'prod' }];
            export const router = create([{ path: '/tools', children: [...extra, ...(import.meta.env.DEV ? devRoutes() : prodRoutes())] }]);
            // { path: '/commented' }
            const unused = { path: '/unused' };
        `);
        expect([...result.routes]).toEqual(["/tools", "/tools/extra", "/tools/dev", "/tools/prod"]);
    });

    test("resolves factory-local arrays without confusing them with shadowed outer bindings", () => {
        const result = readRouterContract(`
            const children = [{ path: 'outer' }];
            function outerRoutes() { return children; }
            function localRoutes() {
                const children = [{ path: 'inner' }];
                return [...children, ...outerRoutes()];
            }
            ${routerSource('[{ path: "/tools", children: localRoutes() }]')}
        `);
        expect([...result.routes]).toEqual(["/tools", "/tools/inner", "/tools/outer"]);
        expect(() =>
            readRouterContract(`
            const children = [{ path: 'outer' }];
            function localRoutes() { const children = dynamicRoutes(); return children; }
            ${routerSource("localRoutes()")}
        `),
        ).toThrow("静态路由工厂");
    });

    test("extracts quoted and JSX-expression feature names but ignores comments", () => {
        const result = readRouterContract(routerSource(`[{ path: '/', element: <><RequireFeature feature='firstFlag' /><RequireFeature feature={"secondFlag"} /></> }]`));
        expect([...result.featureFlags]).toEqual(["firstFlag", "secondFlag"]);
    });

    test.each([
        "[{ path: dynamicPath }]",
        "[{ path: `/prefix/${id}` }]",
        '[{ ...sharedRoute, path: "/" }]',
        '[{ [key]: "/" }]',
        '[{ path: "/", children: importedRoutes }]',
        "[...getRoutes(config)]",
        "[...routes.map(makeRoute)]",
        '[{ path: "/", element: <RequireFeature feature={flag} /> }]',
        '[{ path: "/admin", children: [{ path: "/elsewhere" }] }]',
    ])("rejects unsupported or invalid route declarations: %s", (routes) => {
        expect(() => readRouterContract(routerSource(routes))).toThrow("路由声明无法静态校验");
    });

    test("rejects cyclic arrays and conditional factory returns rather than omitting branches", () => {
        expect(() => readRouterContract(`const loop = [...loop]; ${routerSource("loop")}`)).toThrow("循环引用");
        expect(() => readRouterContract(`function routes() { if (flag) return [{path: '/a'}]; return []; } ${routerSource("routes()")}`)).toThrow("控制流");
    });

    test("rejects unrecognized router factories and syntax errors", () => {
        expect(() => readRouterContract("export const router = buildRouter([]);")).toThrow("createBrowserRouter");
        expect(() => readRouterContract(routerSource("[{"))).toThrow();
    });
});

describe("feature map drift checks", () => {
    test.each([
        ['[{ path: "/new" }]', "/new"],
        ['[{ children: [{ path: "review-probe" }] }]', "/review-probe"],
        ['[{ path: "/admin", children: [{ path: "settings", children: [{ path: "users" }] }] }]', "/admin/settings/users"],
    ])("rejects undocumented routes in %s", (routes, expectedRoute) => {
        const result = verifyFeatureMap(fixture(routes));
        expect(result.failures.some((failure) => failure.startsWith(`新增路由未登记：${expectedRoute}（`))).toBe(true);
    });

    test("requires documentation AND the dispatch marker for out-of-router surfaces", () => {
        const root = fixture(undefined, "`/`");
        expect(verifyFeatureMap(root).failures).toContain("非路由界面未登记：/welcome");
        write(root, mapFile, "`/`\n`/welcome`");
        write(root, "web/src/main.tsx", "");
        expect(verifyFeatureMap(root).failures.some((failure) => failure.includes("分流标记已不在"))).toBe(true);
    });

    test("rejects ghost routes and duplicate registration of external surfaces", () => {
        const root = fixture(undefined, "`/` `/welcome` `/ghost`");
        expect(verifyFeatureMap(root).failures.some((failure) => failure.startsWith("图中路由不存在：/ghost"))).toBe(true);
        write(root, "web/src/router.tsx", routerSource('[{ path: "/" }, { path: "/welcome" }]'));
        expect(verifyFeatureMap(root).failures.some((failure) => failure.includes("二选一"))).toBe(true);
    });

    test("ignores API paths and query deep links, but accepts optional and splat routes", () => {
        const root = fixture('[{ path: "/items/:id?" }, { path: "/files/*" }]', "`/items/:id?` `/files/*` `/welcome` `/api` `/api/public/canvas-shares/:token` `/settings?section=profile`");
        expect(verifyFeatureMap(root).failures).toEqual([]);
    });

    test("requires a feature table row rather than an incidental mention", () => {
        const root = fixture('[{ path: "/", element: <RequireFeature feature="newFlag" /> }]', "`/` `/welcome` `newFlag`");
        expect(verifyFeatureMap(root).failures.some((failure) => failure.startsWith("feature flag 未解释：newFlag"))).toBe(true);
        write(root, mapFile, "`/` `/welcome`\n| `newFlag` | false | 暂未开放 | 首页 |\n");
        expect(verifyFeatureMap(root).failures).toEqual([]);
    });

    test("checks every test argument inside a command, including quoted and ./ paths", () => {
        const root = fixture(undefined, '`/` `/welcome`\n`cd web && bun test test/exists.test.ts "test/missing.test.ts" ./test/other-missing.test.ts`');
        write(root, "web/test/exists.test.ts", "");
        expect(verifyFeatureMap(root).failures).toEqual(["锚点不存在：web/test/missing.test.ts", "锚点不存在：web/test/other-missing.test.ts"]);
        write(root, "web/test/missing.test.ts", "");
        write(root, "web/test/other-missing.test.ts", "");
        expect(verifyFeatureMap(root)).toMatchObject({ failures: [], anchors: 3 });
    });

    test("checks standalone and test-relative anchors; rejects ambiguous bare filenames", () => {
        const root = fixture(undefined, "`/` `/welcome` `web/src/missing.tsx` `test/missing.test.ts` `sibling.tsx`");
        expect(verifyFeatureMap(root).failures).toEqual(["锚点必须使用仓库相对完整路径：sibling.tsx", "锚点不存在：web/src/missing.tsx", "锚点不存在：web/test/missing.test.ts"]);
    });

    test("expands globs, counts only existing unique paths, and fails unmatched patterns", () => {
        const root = fixture(undefined, "`/` `/welcome` `backend/internal/app/admin_*.go` `backend/internal/app/admin_one.go` `SKILL.md`");
        write(root, "backend/internal/app/admin_one.go", "");
        write(root, ".agents/skills/feature-map/SKILL.md", "");
        expect(verifyFeatureMap(root)).toMatchObject({ failures: [], anchors: 2 });
        write(root, mapFile, "`/` `/welcome` `backend/internal/app/missing_*.go`");
        expect(verifyFeatureMap(root).failures).toEqual(["锚点模式没有匹配：backend/internal/app/missing_*.go"]);
    });

    test("rejects anchors that traverse outside their registered directory", () => {
        const root = fixture(undefined, "`/` `/welcome` `web/../secret.ts`");
        expect(verifyFeatureMap(root).failures).toEqual(["锚点不能越出登记目录：web/../secret.ts"]);
    });

    test("CLI exits nonzero without success messages for missing files or unsupported routes", () => {
        const root = fixture(undefined, "`/` `/welcome` `bun test test/missing.test.ts`");
        const result = Bun.spawnSync([process.execPath, script], { cwd: root });
        expect(result.exitCode).toBe(1);
        expect(result.stderr.toString()).toContain("web/test/missing.test.ts");
        expect(result.stdout.toString()).not.toContain("ok");
        write(root, "web/src/router.tsx", routerSource("importedRoutes"));
        const unsupported = Bun.spawnSync([process.execPath, script], { cwd: root });
        expect(unsupported.exitCode).toBe(1);
        expect(unsupported.stderr.toString()).toContain("无法静态校验");
    });

    test("CLI and root detection work from the web subdirectory", () => {
        const root = fixture();
        expect(findRepoRoot(join(root, "web"))).toBe(root);
        const result = Bun.spawnSync([process.execPath, script], { cwd: join(root, "web") });
        expect(result.exitCode).toBe(0);
        expect(result.stdout.toString()).toContain("通过路由、开关登记和锚点存在性校验");
    });

    test("the real router and map pass without loading application modules", () => {
        expect(readRouterContract(readFileSync(join(repoRoot, "web/src/router.tsx"), "utf8")).routes.size).toBeGreaterThan(0);
        expect(verifyFeatureMap(repoRoot).failures).toEqual([]);
    });
});
