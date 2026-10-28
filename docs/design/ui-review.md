# 意绘前端 UI 巡检记录

本轮巡检针对 `v1.6.8.3` 工作区前端，覆盖用户侧与管理后台的全部可达路由，记录 UI 细节缺陷、控制台告警和空状态问题。每条结论都附截图或控制台日志作为证据。

## 1. 巡检环境与方法

| 项 | 值 |
| --- | --- |
| 前端 | `http://127.0.0.1:3001`（Vite dev，后端 `/api` 代理到 `127.0.0.1:8080`） |
| 后端 | `CANVAS_BACKEND_DATA_DIR=../.local/project-workbench-debug`，SQLite schema v54 |
| 账号 | `admin`（管理员） |
| 浏览器 | Playwright 受控 Chromium，视口 1440×900（另测 1280×800、1024×768） |
| 主题 | 亮色为主，另测暗色（工作区 `theme=dark`） |
| 覆盖路由 | 45 个（用户侧 16 + 管理后台 29），见 `ui-review-evidence/` 内同名截图 |

### 未满足的验证条件

`chrome-devtools-mcp`（配置为 `--auto-connect`）无法连接到已运行的用户默认 Chrome 配置：

```
Could not connect to Chrome. Check if Chrome is running.
Cause: Could not find DevToolsActivePort for chrome at
/Users/zhuiyue132/Library/Application Support/Google/Chrome/DevToolsActivePort
```

根因是 macOS 对 `~/Library/Application Support/Google/Chrome` 的应用数据保护：`stat` 可用，读取 `DevToolsActivePort` 返回 `EPERM`。`chrome-devtools-mcp --auto-connect` 依赖读取该文件取得调试端口与 WebSocket 路径，因此无法附着到该 Chrome。本轮改用同仓库已配置的 Playwright MCP 浏览器，用给定管理员账号登录后完成巡检。

因此本轮结论**未覆盖**用户默认配置中的登录态、扩展、Cookie 与本地存储差异；这部分需要 `chrome-devtools-mcp` 可用后补测。

## 2. 问题清单

按类型分组；每条给出「现象 / 证据 / 位置 / 建议」。

### A. 布局与视觉细节

#### A1. 图片 / 视频工作台底部模型提示断行，出现孤字

**现象**：无可用模型时，底部提示区把「暂无可用的图片模型」压成两行，第二行只剩一个孤立的「型」字，右侧紧挨「报价暂不可用」，下方再单独一行「模型设置」，整块文字呈锯齿状错位。视频工作台完全同样。

**证据**：

- `ui-review-evidence/05b-image-workbench-footer.png`（放大）
- `ui-review-evidence/05-image-workbench.png`、`ui-review-evidence/06-video-workbench.png`（整页）

**定位**：`.workbench-model-empty`（`web/src/pages/workbench/workbench.css:869`）在 `.workbench-composer-dock > .workbench-model-empty` 约束下可用宽度约 101px，文案无 `white-space` 或最小宽度保护。

**建议**：给该提示块设置 `min-width` 或 `white-space: nowrap`，或缩短文案为「暂无可用的图片模型」以外的更短表述（例如「图片模型不可用」），并让「报价暂不可用」独立成块。

---

#### A2. 短剧制作页缺少空状态

**现象**：`/projects` 在 0 个项目时，列表区域完全空白，没有任何空状态文案或引导按钮；同一套工作区的资产、创作历史、技能、插件、自由画布都提供了完整的空状态。

**证据**：`ui-review-evidence/12-projects.png`

**验证数据**：`[class*=project-card]` 数量 0，页面正文以「展开创作 / 全部状态 / 最近更新」结束，无「暂无」类节点。

**建议**：复用 `WorkspaceState` 补一个「还没有短剧项目」空状态，并放置主操作（新建 / 导入）。

---

#### A3. 空画布的「节点」面板提示错误

**现象**：画布内一个节点都没有时，展开左侧「节点」面板显示「没有匹配节点 / 换一个关键词继续搜索。」——用户从未输入搜索词，提示语却在引导更换关键词，属于误导性空状态。

**证据**：`ui-review-evidence/A3-canvas-empty-nodes-panel.png`

**建议**：区分「画布无节点」与「搜索无结果」两种状态；前者应提示创建节点或使用 Agent，后者才提示更换关键词。

---

#### A4. `/admin/channels` 导航名与页面标题不一致

**现象**：左侧导航高亮项为「系统渠道」，但页面标题与面包屑为「系统模型」，同一路由出现两个名字。用户在「系统渠道」入口看到的是「系统模型」标题。

**证据**：`ui-review-evidence/A4-nav-vs-title.png`

**验证数据**：`activeNav = ["系统渠道"]`，`breadcrumbTitle = "模型与资源 / 系统模型"`。

**建议**：统一为「系统渠道」（与导航、URL 一致），或在导航中把该项改名为「系统模型」；如果确实同时管理渠道与模型，标题应体现两者关系。

---

#### A5. 系统模型页同时渲染两个空状态

**现象**：`/admin/channels` 在无渠道时，左栏显示「还没有系统渠道」，右栏同时显示「添加渠道，开始管理模型」——同一屏出现两块空状态说明，信息重复。

**证据**：`ui-review-evidence/23-admin-channels.png`

**建议**：无渠道时右栏只保留主操作，或让左栏空状态承担引导、右栏保持静默。

---

#### A6. 账户菜单用外链箭头表示站内跳转

**现象**：账户菜单中「账户与设置」「管理员后台」两项右侧使用外链箭头（↗）图标，但两者都是站内路由（`/settings`、`/admin`），图标语义与行为不符；「更新日志」也使用同一图标，容易让用户以为会离开当前站点。

**证据**：`ui-review-evidence/A6-account-menu-icons.png`、`ui-review-evidence/70-account-menu.png`

**建议**：站内跳转改用普通进入箭头（`→` / `chevron-right`），外链才用 `↗`。

---

#### A7. 插件卡片「发布 / 更新」恒为「未记录」

**现象**：插件中心 106 张卡片全部显示「发布 未记录 / 更新 未记录」，该行不承载任何有效信息，却占据了卡片中部固定位置。

**证据**：`ui-review-evidence/A7-plugin-card.png`、`ui-review-evidence/10-plugins.png`

**验证数据**：`GET /api/plugins` 返回 106 条记录，其中 `publishedAt` 非空数量为 **0**。

**建议**：数据缺失时隐藏整行，或改为其他可用元信息（来源、安装时间、协议能力数）。

---

### B. 交互与表单

#### B1. 注册页堆叠两条警告，表单可填但无法提交

**现象**：注册页同时显示两条警告——「当前已关闭普通注册，请咨询管理员创建账号。」和「当前没有可用的注册验证方式，请咨询管理员检查短信及邮件配置。」。第二条在关闭注册时属于派生信息，重复提醒；同时四个输入框、协议勾选都保持可用，「创建账号」按钮却持续禁用，用户可完整填写后才失败。

**证据**：`ui-review-evidence/17-register.png`

**建议**：关闭注册时只保留第一条并在表单区给出统一说明；或将表单整体置为禁用态，避免可填写却不可提交。

---

### C. 控制台告警（代码层，跨页面）

以下均为 antd 6 的弃用告警，会打印到浏览器控制台，属于需要跟进的代码债。日志原文保存在 `ui-review-evidence/logs/`。

| 编号 | 告警 | 命中页面 | 证据 |
| --- | --- | --- | --- |
| C1 | `[antd: Switch] size="default" is deprecated. Please use size="medium" instead.` | `/admin/plugins`、`/admin/skill-curation`、`/admin/announcements`、`/admin/settings/appearance`、`/admin/settings/features`、`/admin/settings/access`、`/admin/settings/email`、`/admin/settings/storage`、`/admin/settings/response-interception`（9 处） | `logs/25-admin-plugins.txt` 等 |
| C2 | `[antd: Drawer] width is deprecated. Please use size instead.` | `/canvas`、`/canvas/:id`、`/admin/payments` | `logs/13-canvas-list.txt`、`logs/14-canvas-project.txt`、`logs/28-admin-payments.txt` |
| C3 | `[antd: Modal] destroyOnClose is deprecated. Please use destroyOnHidden instead.` | `/canvas/:id` | `logs/14-canvas-project.txt` |
| C4 | `[antd: Modal] maskClosable is deprecated. Please use mask.closable instead.` | `/admin/workbench-tools` | `logs/26-admin-workbench-tools.txt` |
| C5 | `[antd: Modal] focusTriggerAfterClose is deprecated. Please use focusable.focusTriggerAfterClose instead.` | `/create`（首次进入）、`/plugins` | `logs/01-create-home.txt`、`logs/10-plugins.txt` |
| C6 | `<Focusable> child must have an interactive ARIA role.` × 40 | `/skills` | `logs/09-skills.txt` |

C1 覆盖面最广，建议一次性全仓替换 `size="default"` → `size="medium"`。C6 是 react-aria `Focusable` 包裹了非交互子元素，属于可访问性问题，需要定位技能卡片中的具体子元素。

---

### D. 登录后首次加载的 401 与失败提示

**现象**：登录成功后首次进入工作区，控制台出现一次 401 与一条中文失败提示：

```
[ERROR] Failed to load resource: the server responded with a status of 401 (Unauthorized) @ /api/model-catalog
[WARNING] 模型目录后台刷新失败，保留本地配置 ApiError: 请先登录
```

刷新页面后不再复现，符合「会话尚未就绪就发起模型目录刷新」的竞态特征。

**证据**：`ui-review-evidence/logs/01-create-home.txt`

**建议**：模型目录刷新应在登录态就绪后触发，或对 401 静默重试，避免把正常的登录时序当作错误暴露给用户。

## 3. 已核查、当前无问题的项

以下检查未发现问题，记录以缩小后续回归范围：

- **横向溢出**：1440 / 1280 / 1024 三档宽度下，用户侧与管理后台各页面 `scrollWidth` 均等于视口宽度，无页面级横向滚动。
- **宽表格**：`/admin`、`/admin/login-logs`、`/admin/resources`、`/admin/credit-operations` 的表格宽度超过内容区，但外层 `ant-table-content` 为 `overflow-x: auto`，属于预期行为，不是布局缺陷。
- **图片可访问性**：全部巡检页面的 `<img>` 均带 `alt`，无加载失败图片。
- **暗色主题**：工作区 `theme=dark` 与画布工作区（独立 `yingce:canvas-theme`）渲染正常，顶栏积分胶囊、卡片边框对比度正常；画布路由挂载 `dark` 类并在离开时移除，未发现主题泄漏。
- **主要弹窗**：`新增系统渠道`、`新建异步生成任务`、`系统公告`、账户菜单渲染正常，无遮挡与溢出。
- **画布工作区面板**：`节点` / `资产` / `任务` / `历史` 四个面板均可正常展开，除 A3 的误导性空状态外无布局问题。

## 4. 未覆盖范围

- **真实用户默认浏览器配置**：受第 1 节限制未验证。
- **需要数据才有意义的状态**：插件启用/停用后的卡片变化、支付订单列表、渠道协议表单校验失败态、素材批量选择与跨页操作、时间线编辑器与 3D 预演台（当前账号无对应数据）。
- **生成链路实时状态**：任务运行中/失败态的进度与日志 UI 需要真实上游渠道，本次未联调。
- **移动端断点**：仅测到 1024px；更窄的移动视口未覆盖。

## 5. 证据索引

```
docs/design/ui-review-evidence/
├── 01–19   用户侧页面（创作、工作台、任务、资产、技能、插件、设置、短剧、画布、鉴权、404）
├── 20–48   管理后台页面（监控、用户、渠道、模型、插件、支付、公告、设置等）
├── 50–60   主题与响应式（暗色创作页、暗色顶栏、1024 断点）
├── A3–A7   针对性放大证据（画布空节点面板、导航与标题不一致、账户菜单图标、插件卡片）
└── logs/   各页面控制台告警原文（44 份）
```
