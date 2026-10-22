---
name: feature-map
description: Use when you need to locate a user-visible feature from a vague report (screenshot, "免费画布打不开", "任务中心没出现入口"), when deciding which surface a UI/route/flag change touches, or when you need a runnable acceptance signal for a feature. Holds FEATURE_MAP.md (功能 ↔ 抵达路径 ↔ 代码锚点 ↔ 验收信号) and a drift gate that keeps it honest against web/src/router.tsx.
---

# Feature Map

> 面向 Agent 的功能地图：给一句话（用户的原话、半张截图、报障里的一句抱怨），能落到**一条可打开的路由**，再从路由落到**真实代码锚点**和**可运行的验收信号**。

## 这张图解决什么

没有它的时候，Agent 的默认动作是从关键词猜文件名、`rg` 撞运气、或者读一遍 `docs/content/docs/backend/code-map.mdx` 里 200 行的文件清单——那份文档回答「哪个文件干什么」，不回答「用户在哪看到它、我怎么证明它坏了」。

`FEATURE_MAP.md` 的每一块固定四行：

| 行 | 回答 |
| --- | --- |
| 抵达 | 从侧栏 / ⌘K / 深链 / 卡片怎么点到它，需要什么前置条件（登录、feature flag、admin 角色） |
| 锚点 | 页面、状态、API 模块、后端 handler 的真实路径 |
| 验收 | 能直接跑的命令或能直接断言的 DOM/接口信号 |
| 陷阱 | 这一块最容易误诊的地方（默认开关、重定向、空路由、非路由界面） |

## 用它的三个动作

1. **复现报障**：把用户的话翻成功能名 → 读该块「抵达」拿到路由和前置条件 → 打开页面看「验收」里的 DOM 信号；入口根本不存在时先看「陷阱」里的 feature flag 默认值，不要当路由 bug 修。
2. **改动定界**：改一个 UI 之前，从「锚点」确认页面、状态、API、后端 handler 各在哪一层，避免只改页面导致状态或权限没跟上。
3. **改完自检**：跑「验收」行里的具体测试文件；需要真浏览器的走 `web/scripts/previs-p0-chrome-e2e.mjs` 同款 CDP 驱动方式，不要新建独立 HTML 仿页面。

## 硬规则

- **改到就同步**：新增/删除/改名路由、改 feature flag、改页面入口文件、改某个功能的抵达方式（例如把入口从侧栏挪进 ⌘K），同一批改动里更新 `FEATURE_MAP.md`。
- **不复制 `code-map.mdx`**：那张表是文件级入口清单，会随实现细节频繁变动。这里只写「定位一个功能需要知道的最小锚点」，通常 3–5 个路径。
- **陷阱只写踩过的**：写的是「我照着文档做，结果错了」的地方，不是通用注意事项。没有就留空，不要用「注意性能」「注意兼容」凑行。
- **验收必须是可执行的**：写测试文件路径或具体选择器、接口，不写「手动验证一下」。
- **路由 token 用反引号包全**：`` `/canvas/:id` `` 这样写，校验脚本按此比对 `web/src/router.tsx`；写成 `/canvas` + 文字描述会漏检。
- **锚点使用完整路径**：除同目录的 `SKILL.md` 外，不写裸文件名或省略目录的同级文件。验收命令中的 `test/` 按 `web/test/` 解析；通配模式至少匹配一个文件，不能把“跳过检查”当成“存在”。

## 校验

先在 `web/` 执行 `bun install --frozen-lockfile` 安装锁定依赖（解析器复用前端的 Babel 工具链），然后从仓库根目录执行：

```bash
(cd web && bun test test/feature-map-verifier.test.ts)
bun run .agents/skills/feature-map/scripts/verify-feature-map.ts
```

四类判定，任一失败退出 1：

1. 按 TSX AST 递归解析 `web/src/router.tsx` 的路由树，拼接相对路径、保留绝对子路径，处理无路径布局和 index 路由；可抵达路由必须登记，根级 `*` 404 兜底除外。
2. 图里的路由都真实存在于路由树或显式登记的非 Router 界面中（防止改名后留下幽灵路由）。
3. 路由源码中的每个 `feature` 字符串名称都在图的表格行中登记；不把正文偶然提到这个名称当作说明。
4. 检查完整的 `web/`、`backend/`、`plugin-packages/`、`yingce-agent/`、`scripts/`、`docs/`、`tools/`、`.agents/` 路径及相对 `web/` 的 `test/` 路径，包括反引号命令内的每个文件参数；文件模式展开后检查匹配，统计只计真实存在的唯一锚点。

静态路由语法支持对象/数组字面量、本文件 const 数组、无参同步工厂、数组展开以及条件表达式的两个分支（包含 DEV 路由），不执行应用代码。动态 path、跨文件路由数组、计算/展开路由属性和复杂工厂控制流等无法解析的声明会报错；采用新声明形式时先扩展解析器和回归用例，不得绕过检查。

校验不证明默认值、菜单位置、运行时行为、接口路径或测试覆盖语义正确；这些仍需沿真实调用链人工核对，不能把 CI 通过称为功能验收通过。

`/welcome` 这类不经 React Router 的界面由脚本内的 `OUT_OF_ROUTER_SURFACES` 登记，同时要求地图保留对应路由 token、源码保留分流标记；删掉地图条目或分流实现都会失败。

CI 落点：`.github/workflows/verify-feature-map.yml`，在 `pull_request` 与 `work` 分支推送时安装锁定依赖，执行 `web/test/feature-map-verifier.test.ts` 和地图校验。测试也纳入前端全量测试与 `typecheck:test`。

## 与其它文档的分工

| 文档 | 回答 | 变动频率 |
| --- | --- | --- |
| `.agents/skills/feature-map/FEATURE_MAP.md`（本 Skill） | 功能在哪、怎么到、怎么证明它工作 | 中：路由与入口变化时 |
| `docs/content/docs/overview/features.mdx` | 这个功能对用户意味着什么、操作细则 | 低：按功能发布写 |
| `docs/content/docs/backend/code-map.mdx` | 某段实现由哪些文件承担 | 高：随重构 |
| `docs/content/docs/progress/pending-test.mdx` | 已实现但用户还没确认的部分 | 中 |
| `.agents/notes/` | 为什么这样决定、放弃了什么 | 低 |
