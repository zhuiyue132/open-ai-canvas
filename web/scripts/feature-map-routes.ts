import { parse } from "@babel/parser";
import { traverseFast, type Node, type ObjectExpression } from "@babel/types";

/** 只读路由声明，不 import router.tsx，避免执行浏览器初始化和应用副作用。 */
export function readRouterContract(source: string) {
    const ast = parse(source, { sourceType: "module", plugins: ["typescript", "jsx"] });
    const routes = new Set<string>();
    const featureFlags = new Set<string>();
    type Binding = { node: Node; scope: Map<string, Binding> };
    const bindings = new Map<string, Binding>();
    const factoryNames = new Set<string>();
    const factories: Node[] = [];
    const active = new Set<Node>();

    function unsupported(node: Node, detail: string): never {
        throw new Error(`路由声明无法静态校验（${node.loc?.start.line ?? "?"} 行）：${detail}`);
    }

    for (const statement of ast.program.body) {
        if (statement.type === "ImportDeclaration" && ["react-router", "react-router-dom"].includes(statement.source.value)) {
            for (const specifier of statement.specifiers) {
                if (specifier.type === "ImportSpecifier" && (specifier.imported.type === "Identifier" ? specifier.imported.name : specifier.imported.value) === "createBrowserRouter") {
                    factoryNames.add(specifier.local.name);
                }
            }
        }
        const declaration = statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
        if (declaration?.type === "FunctionDeclaration" && declaration.id) bindings.set(declaration.id.name, { node: declaration, scope: bindings });
        if (declaration?.type === "VariableDeclaration" && declaration.kind === "const") {
            for (const binding of declaration.declarations) {
                if (binding.id.type === "Identifier" && binding.init) bindings.set(binding.id.name, { node: binding.init, scope: bindings });
            }
        }
    }

    traverseFast(ast, (node) => {
        if (node.type === "CallExpression" && node.callee.type === "Identifier" && factoryNames.has(node.callee.name)) factories.push(node);
        if (node.type === "JSXAttribute" && node.name.type === "JSXIdentifier" && node.name.name === "feature") {
            const value = node.value?.type === "JSXExpressionContainer" ? node.value.expression : node.value;
            if (value?.type !== "StringLiteral") unsupported(node, "feature 必须是字符串字面量");
            featureFlags.add(value.value);
        }
    });
    if (factories.length !== 1) throw new Error("必须能识别唯一的 createBrowserRouter 调用；不支持的导入或封装需先扩展校验器");

    function unwrap(node: Node): Node {
        if (node.type === "TSAsExpression" || node.type === "TSSatisfiesExpression" || node.type === "TSNonNullExpression" || node.type === "ParenthesizedExpression") return unwrap(node.expression);
        return node;
    }

    function visitArray(input: Node, parent: string, scope = bindings) {
        const node = unwrap(input);
        if (active.has(node)) unsupported(node, "路由声明循环引用");
        active.add(node);
        try {
            if (node.type === "ArrayExpression") {
                for (const element of node.elements) {
                    if (!element) unsupported(node, "路由数组不能包含空项");
                    if (element.type === "SpreadElement") visitArray(element.argument, parent, scope);
                    else if (unwrap(element).type === "ObjectExpression") visitRoute(unwrap(element) as ObjectExpression, parent, scope);
                    else unsupported(element, "路由项必须是对象字面量，或展开可解析的路由数组");
                }
            } else if (node.type === "ConditionalExpression") {
                // DEV 路由同样需要登记，不能只校验当前环境命中的一支。
                visitArray(node.consequent, parent, scope);
                visitArray(node.alternate, parent, scope);
            } else if (node.type === "Identifier") {
                const binding = scope.get(node.name);
                if (!binding) unsupported(node, `无法解析路由数组 ${node.name}；跨文件或动态声明不能静默跳过`);
                visitArray(binding.node, parent, binding.scope);
            } else if (node.type === "CallExpression" && node.callee.type === "Identifier" && node.arguments.length === 0) {
                const binding = scope.get(node.callee.name);
                if (!binding || !["FunctionDeclaration", "ArrowFunctionExpression", "FunctionExpression"].includes(binding.node.type)) unsupported(node, "只支持本文件无参静态路由工厂");
                visitArray(binding.node, parent, binding.scope);
            } else if (node.type === "FunctionDeclaration" || node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression") {
                if (node.params.length || node.async || node.generator || !node.body) unsupported(node, "路由工厂必须是同步无参函数");
                if (node.body.type !== "BlockStatement") visitArray(node.body, parent, scope);
                else {
                    const statements = node.body.body;
                    const returned = statements.at(-1);
                    if (returned?.type !== "ReturnStatement" || !returned.argument || statements.slice(0, -1).some((statement) => statement.type !== "VariableDeclaration")) {
                        unsupported(node, "路由工厂只支持局部变量声明后直接 return；控制流需先扩展校验器");
                    }
                    const localScope = new Map(scope);
                    for (const statement of statements.slice(0, -1)) {
                        if (statement.type !== "VariableDeclaration" || statement.kind !== "const") unsupported(statement, "路由工厂的局部变量必须使用 const");
                        for (const binding of statement.declarations) {
                            if (binding.id.type !== "Identifier" || !binding.init) unsupported(binding, "不支持解构或未初始化的局部变量");
                            localScope.set(binding.id.name, { node: binding.init, scope: localScope });
                        }
                    }
                    visitArray(returned.argument, parent, localScope);
                }
            } else unsupported(node, `不支持 ${node.type} 路由数组表达式`);
        } finally {
            active.delete(node);
        }
    }

    function visitRoute(node: ObjectExpression, parent: string, scope: Map<string, Binding>) {
        const properties = new Map<string, Node>();
        for (const property of node.properties) {
            if (property.type === "SpreadElement" || property.computed) unsupported(property, "不支持展开或计算的路由属性");
            const key = property.key.type === "Identifier" ? property.key.name : property.key.type === "StringLiteral" ? property.key.value : null;
            if (!key || !["path", "children", "index"].includes(key)) continue;
            if (property.type !== "ObjectProperty" || properties.has(key)) unsupported(property, `路由属性 ${key} 必须是唯一的数据属性`);
            properties.set(key, unwrap(property.value));
        }
        const path = properties.get("path");
        const index = properties.get("index");
        const children = properties.get("children");
        if (path && path.type !== "StringLiteral") unsupported(path, "path 必须是字符串字面量");
        if (index && index.type !== "BooleanLiteral") unsupported(index, "index 必须是布尔字面量");
        if (index?.type === "BooleanLiteral" && index.value && children) unsupported(node, "index 路由不能包含 children");

        let fullPath = parent;
        if (path?.type === "StringLiteral") {
            fullPath = path.value.startsWith("/") ? path.value : `${parent === "/" ? "" : parent}/${path.value}`;
            if (path.value.startsWith("/") && parent !== "/" && fullPath !== parent && !fullPath.startsWith(`${parent}/`)) unsupported(path, "绝对子路由必须保留父路径");
            // 根级 * 是 404 兜底，不是可抵达的功能入口；其它 splat 路由仍须登记。
            if (!(parent === "/" && path.value === "*")) routes.add(fullPath);
        } else if (index?.type === "BooleanLiteral" && index.value) routes.add(parent);
        if (children) visitArray(children, fullPath, scope);
    }

    const factory = factories[0];
    if (factory.type !== "CallExpression" || !factory.arguments[0]) throw new Error("createBrowserRouter 缺少路由数组");
    visitArray(factory.arguments[0], "/");
    return { routes, featureFlags };
}
