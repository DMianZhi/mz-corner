# 管理后台代码质量重构 —— 设计规格（Spec）

**Goal:** 消除管理后台四个面板中同一套机制的**四份复制实现**（保存编排 / Ctrl+S / 草稿订阅 / 骨架 / dock / 详情），为逻辑层补上单元测试安全网，并按职责拆分两个超长文件（`ui.tsx` 808 行、`admin.css` 1033 行）。

**Architecture:** 采用**组合式**抽象——抽出纯函数决策层（`savePlan.ts`）+ 三个 hook + 两个展示件，四个面板保留各自独有的 JSX（文章三态编辑器、站点设置批量保存）。保存的**写入策略由调用方以回调注入**，因此「逐文档 PATCH」「首次 POST」「集合级 bulk」三种策略共用同一套校验/错误映射/401 处理。**测试前置**：先给纯逻辑建网，再迁移面板。

**Tech Stack:** React 19（编译器，禁 `useMemo`/`useCallback`）+ TypeScript strict + vitest（node 环境，`renderToStaticMarkup`，零新依赖）+ Playwright e2e（真实浏览器）。

**Spec 状态:** 2026-09-23 经用户逐节评审通过（方案甲 + 测试前置 + 零新依赖测试口径）。

---

## 1. 背景：实测证据

调研（只读）测得的问题，非印象判断：

| 级别 | 问题 | 实测证据 |
|---|---|---|
| P1 | 四份保存编排 | `save()` 在 4 处各写一遍（`ArticleEditor:110` / `CommentsPanel:70` / `ProjectsPanel:66` / `SiteConfigPanel:79`），各 40~50 行 |
| P1 | 计数文案与 401 判定散落 | `Object.keys(x).length` 计数在 **3 文件共 9 处**；`name === 'Unauthorized'` 在 **6 文件共 11 处** |
| P1 | Ctrl+S 四处复制 | 4 处绑定，**全部缺依赖数组** → 每次渲染重注册监听 |
| P1 | 草稿订阅两种写法 | `useSyncExternalStore(subscribeDrafts, draftTotal)`（Projects）vs `useState + useEffect`（Comments / SiteConfig） |
| P1 | 详情组件近乎复制 | `ProjectDetail`(165 行) 与 `CommentDetail`(177 行) 归一化集合名后 **122 行逐字节相同（74%）** |
| P1 | admin 零单测 | admin 代码 **3210 行 / 0 个测试文件**；客户端仅 12 个单测（Markdown、post-nav） |
| P2 | 超长文件 | `ui.tsx` 808 行 / 18 个导出；`admin.css` 1033 行 / 137 选择器 |
| P2 | 圆角无体系 | 8 种硬编码圆角（9/999/7/8/6/4/3/12），仅 1 处用 `var(--radius)` |
| P2 | 按钮变体改几何 | `--primary` 改 padding+radius，`--sm` 再改，`--sm.--primary` 又改 → 组合爆炸 |
| P2 | e2e 基建耦合无关目录 | **7 个脚本**从 `…/skills/custom/career-ops/node_modules/playwright` 绝对路径引 playwright |
| P3 | 一致性瑕疵 | ProjectsPanel/CommentsPanel 从 `./SchemaForm` 分两行重复 import；`draftStore` 同时导出 10 个具名函数 + 1 个对象（两套 API） |

**体量基线**：四个面板 + 编辑器共 **1388 行**；admin 代码（不含 CSS）3210 行。

**诚实说明收益**：面板与编辑器 1388 行 → 约 875 行，但新增共享模块约 420 行（§4.1 各项之和），故**净减仅约 90 行**（1388 → 1295）。本重构的收益在**维护面**（同一机制从四份收敛成一份，改一处四处生效），不在行数。

## 2. 非目标

- **不改服务端**（`server/`）与 `admin-api.ts` 的请求契约。
- **不改任何用户可见行为**，唯一例外是 §7.2 的圆角统一（已单列、单独评审、单独提交）。
- **不引入运行时依赖**；本阶段**不引入** `jsdom` / `@testing-library/react`（hook 交互层继续由 e2e 覆盖，见 §8）。
- **不把 admin 改用 Tailwind**。`client/AGENTS.md` 规定样式用 Tailwind 工具类，但 admin 是 1033 行 `adm-*` 自有 CSS（其文件头注明「引用站点设计令牌，与前台配色同源」）。这是仓库既有的**有意分歧**，改造它是全站视觉重写，风险与收益不成比例。本 spec 只在现有体系内做令牌化。
- **不合并 e2e 脚本**（理由见 §9.3）。

## 3. 验收标准

1. 现有 e2e **全绿且断言条数不减**：本地 4 脚本（audit-local 78 / content 44 / scroll 38 / ui 37）+ 线上 2 冒烟（audit-live 49 / live 16）。
2. `pnpm run lint` / `check:types` / `test` 零错误；新增单测覆盖抽出的纯逻辑。
3. 面板与 dock 的渲染**像素级不变**（重构部分），以截图对比佐证。
4. 每步独立提交，可单独回滚。

## 4. 目标结构

### 4.1 新增模块（`client/src/components/admin/`）

| 文件 | 职责 | 预计 |
|---|---|---|
| `savePlan.ts` | **纯函数**：保存决策（无 React 依赖，单测主战场） | 60 |
| `useDocumentDraft.ts` | hook：`values/update/dirty/errors`，草稿优先初始化 + 统一订阅 | 70 |
| `useSaveAction.ts` | hook：`saving` + `run`，调 `savePlan` 并执行 toast / 聚焦 / 401 | 80 |
| `useCtrlS.ts` | hook：Ctrl/Cmd+S，ref 持最新回调、依赖数组正确、只注册一次 | 20 |
| `useRailSelection.ts` | hook：左栏选中回退（`selectedId ?? 首条`）——**审计 P3-7 那个 bug 的唯一来源** | 20 |
| `SaveDock.tsx` | 浮动 dock：状态文案 + 保存按钮 + 动作插槽（删除 / 放弃） | 60 |
| `DocumentDetail.tsx` | 逐文档详情外壳（项目 / 评论共用），差异走插槽 | 110 |

> **相比口头设计的一处收敛**：原计划的 `WorkbenchRail` 组件改为 `useRailSelection` hook。原因：四个面板的骨架 JSX 只有 4 行（`.adm-workbench` + `Rail` + `.adm-pane`），真正易错且重复的是**选中回退逻辑**；组件化需要 6 个插槽才能覆盖差异，耦合反而更高。

### 4.2 关键接口（遵循 `client/AGENTS.md`：≥3 参数用 options 对象、单 props 参数、命名导出）

```ts
// savePlan.ts —— 纯函数，零 React 依赖
export type FieldErrors = Record<string, string>;
export type SavePlan = { kind: 'invalid'; errors: FieldErrors } | { kind: 'proceed' };
export type FailurePlan =
  | { kind: 'auth-lost' }                                            // 401 → 退回登录门
  | { kind: 'field-errors'; errors: FieldErrors; message: string }   // 服务端错误落到字段
  | { kind: 'retry'; message: string };                              // 兜底：toast + 重试入口

export function planSave(options: {
  fields: ContentField[];
  values: Record<string, unknown>;
}): SavePlan;
export function planFailure(options: { fields: ContentField[]; error: unknown }): FailurePlan;
export function errorCount(errors: FieldErrors): number;   // 「N 处需要修正」的唯一来源
```

```ts
// useDocumentDraft.ts
export function useDocumentDraft(options: {
  collection: string;
  document: ContentDocument;
  fields: ContentField[];
  isNew?: boolean;                    // 本地新建：dirty 恒为 true
}): {
  values: Record<string, unknown>;
  update: (name: string, value: unknown) => void;   // 写值 + 写草稿 + 清该字段错误
  dirty: boolean;
  errors: FieldErrors;
  setErrors: (next: FieldErrors) => void;
};
```

```ts
// useSaveAction.ts —— 写入策略注入，三种策略共用同一套错误处理
export function useSaveAction(options: {
  fields: ContentField[];
  values: Record<string, unknown>;
  setErrors: (next: FieldErrors) => void;
  save: () => Promise<void>;          // PATCH / POST / bulk 由调用方决定
  onAuthLost: () => void;
  successMessage?: string;
}): { saving: boolean; run: () => Promise<void> };
```

```ts
// useCtrlS.ts
export function useCtrlS(options: { onSave: () => void; disabled?: boolean }): void;

// useRailSelection.ts
export function useRailSelection<T extends { _id: string }>(options: {
  documents: T[];
  selectedId: string | null;
}): { selected: T | null; effectiveId: string | null };
```

```tsx
// SaveDock.tsx
export function SaveDock(props: {
  status: string;            // 「已同步」/「有改动」/「3 项待保存」
  saving: boolean;
  disabled: boolean;
  saveLabel: string;         // 「保存」/「保存全部」
  onSave: () => void;
  actions?: ReactNode;       // 删除 / 放弃，由调用方给
}): JSX.Element;
```

### 4.3 迁移后的预计体量

| 文件 | 现在 | 之后 |
|---|---|---|
| `ProjectsPanel.tsx` | 280 | ~130 |
| `CommentsPanel.tsx` | 266 | ~125 |
| `SiteConfigPanel.tsx` | 235 | ~170（批量保存独有） |
| `ArticlesPanel.tsx` | 222 | ~150 |
| `ArticleEditor.tsx` | 385 | ~300（三态编辑器独有） |
| 合计 | **1388** | **~875** + 共享模块 ~420 |

## 5. 保存编排的纯函数（测试落点）

现状把「校验 → 定位 → 映射 → 计数 → 401」混在组件的 `save()` 里，四种策略各写一遍。抽成三个纯函数后：

- `planSave`：客户端校验（复用 `validateValues`），不过则**不发请求**。
- `planFailure`：把 `unknown` 错误归类成三种结局——401 退登录门 / 服务端中文句子按 label 映射回字段 / 兜底 toast 带重试。**401 判定从 11 处收敛到 1 处。**
- `errorCount`：**计数文案从 9 处收敛到 1 处。**

副作用（`toast` / `focusFirstError` / `setSaving`）留在 `useSaveAction` 里执行，纯函数只做决策。

## 6. 迁移顺序

每步**一个提交**，跑该面板 e2e + 全量 e2e + 截图对比，**行为像素级不变**才进下一步：

1. 先落 `savePlan.ts` + 单测（不改任何面板，纯新增）
2. `ProjectsPanel`（最简单，验证抽象够用）
3. `CommentsPanel`（引入 `DocumentDetail`，消掉 122 行重复）
4. `SiteConfigPanel`（批量保存 → 验证策略注入可行）
5. `ArticlesPanel` + `ArticleEditor`（最复杂，三态编辑器 + 本地新建）
6. `ui.tsx` 拆分（§8.1）
7. CSS 令牌化（§8.2a，零视觉变化）
8. CSS 圆角统一（§8.2b，**唯一可见变更，单独提交**）
9. e2e 基建去重（§9）

## 7. 测试计划（零新依赖）

新增两个测试文件，沿用现有 vitest（node 环境）：

**`savePlan.test.ts`**
- 客户端校验：`required` / `max` / `itemMax` / `number` 可解析 / `publishDate` 格式；空值且非必填放行
- 服务端错误映射：label 前缀命中 → `field-errors`；匹配不到 → `retry`；空消息
- 401 → `auth-lost`
- `errorCount` 计数

**`draftStore.test.ts`**
- 草稿读写 / 清除 / 订阅通知 / pending 列表 / `local:` 前缀判定
- **`sessionStorage` 抛异常时降级**（stub 一个会抛的实现，验证内存单例仍工作）

预计新增 ~30 个单测（现有 12 个不动）。

**已知缺口（如实记录）**：hook 与组件交互层无单测，由 e2e 覆盖。补它需引入 `jsdom` + `@testing-library/react`，属本阶段非目标。

## 8. `ui.tsx` 与 CSS

### 8.1 `ui.tsx` 拆分（808 行 → 5 文件）

按文件内既有的分区注释搬运：

| 新文件 | 内容 |
|---|---|
| `ui/icon.tsx` | `Icon`（150 行 SVG）+ `SrOnly` |
| `ui/form.tsx` | `fitTextarea` / `Button` / `TextInput` / `TextArea` / `Select` / `TagInput` / `FieldRow` / `FieldValue` + 字段元信息通道 |
| `ui/nav.tsx` | `Tabs` / `Rail` / `RailItem` / `Kicker` |
| `ui/feedback.tsx` | `Badge` / `EmptyState` / `DangerConfirm` / `LinkButton` |
| `ui/index.ts` | **barrel 重导出全部** —— 所有 `from './ui'` 的导入**一行不改** |

顺带修掉 `ProjectsPanel` / `CommentsPanel` 里从 `./SchemaForm` 分两行的重复 import。

### 8.2 CSS

#### 8.2a 令牌化（零视觉变化）

只把**已经重复出现**的间距 / 尺寸值收敛为 admin 局部令牌（`--adm-*`）。**不做全量间距重排**——那会把 20 余组 bespoke padding 重新对齐，是视觉重设计，需单独立项评审。

#### 8.2b 圆角统一（唯一可见变更）

映射到前台既有令牌（`global.css` 已定义 `--radius: 12px` / `--radius-sm: 7.2px` / `--radius-md: 9.6px` / `--radius-lg: 12px`）。admin 现有的 7/9/12px 正是这套令牌值的**取整版本**，因此绝大多数替换是零或亚像素变化：

| 现值 | 用在哪 | 改为 | 变化 |
|---|---|---|---|
| 6px | `.adm-badge` | `--radius-sm` (7.2) | +1.2 |
| 7px | `.adm-brand-mark` / `.adm-reveal-btn` / `.adm-chip` | `--radius-sm` (7.2) | +0.2 |
| 8px | `.adm-btn--sm` / `.adm-chip-x::after` | `--radius-sm` (7.2) | −0.8 |
| 9px | `.adm-btn` / `.adm-select` / `.adm-taginput` / `.adm-dock-btn` | `--radius-md` (9.6) | +0.6 |
| 12px | `.adm-empty-icon` | `--radius-lg` (12) | 0 |
| 999px | **`.adm-btn--primary`** | `--radius-md` (9.6) | **大改，见下** |
| 14px | `.adm-dock` 容器 | 保留为局部令牌 `--dock-r` | 0（见下注） |
| 999px | 滚动条 | 保留 | 0 |
| 3px / 4px | `:focus-visible` 内环 / `.adm-chip-x` | 保留（语义一次性） | 0 |
| 0 / 50% | `.adm-input--title` / `.adm-split` 文本域 / 圆点 | 保留 | 0 |

> **注（dock 容器 14px 为何不进体系）**：前台令牌里没有 14px 的近邻——`--radius-xl` 是 16.8px（差 2.8px，可见）。且 `--dock-btn-r = calc(14px − 5px 内边距) = 9px` 的同心关系（前一轮已修）依赖这个具体值。故保留为局部令牌，不动。

**两个决定：**

1. **primary 按钮不再是胶囊。** 依据：前台站点只在**标签 / chip** 上用 999px（`ProjectCard`），按钮没有胶囊——后台的胶囊是本地发明；且正是它造成「编辑(9px) 与 保存(胶囊) 并排」的割裂（用户已指出）。统一为 `--radius-md` 后，登录 / 重试 / 保存按钮与其它按钮一致。
2. **变体不再改几何。** 改为 **size 定几何、variant 只改配色**。副作用：primary 的 padding 由 `8px 15px` 变为与 base 一致的 `9px 14px`（高度 +1~2px）。

**此节改可见外观 → 实施前须出明暗两套前后对比截图，用户点头才改。**

#### 8.2c 文件拆分

`admin.css` 1033 行 → 4 文件（`base` / `form` / `workbench` / `misc`）。

> **层叠顺序硬约束**：末尾的审计补充段（`961` 行起）与 `P4 补漏` 段（`1021` 行起）依赖**源序**取胜——例如 `.adm-dock .adm-btn` 的圆角覆盖必须排在 `.adm-btn--sm.adm-btn--primary` 之后（特异性相同，靠源序决定）。拆分后必须**按原顺序 `@import`**，否则层叠胜负改变、外观回归。

## 9. e2e 基建

### 9.1 抽出共享 harness

新增 `scripts/e2e/lib/harness.cjs`：`check()` / `visualDiff()` / `login()` / `launch()` / `report()` / 退出码。6 个脚本各删自己的样板，只留场景。

### 9.2 解除 playwright 的隐藏耦合

现在 **7 个脚本**从 `C:/Users/admin/.wpscomate/agent/skills/custom/career-ops/node_modules/playwright` 绝对路径引入（5 个浏览器端 e2e/冒烟 + 2 个截图脚本 `shots-admin-demos.cjs` / `shots-scroll.cjs`；`e2e-admin-content.mjs` 走 API 层，不引 playwright）——项目测试基建**耦合在一个无关 skill 的安装目录**上，该 skill 一旦升级或卸载，全部浏览器测试立即失效。

改为依次解析：`PLAYWRIGHT_PATH` 环境变量 → 项目 `node_modules/playwright` → 上述路径（文档化兜底），全部失败则报明确错误。

**不加 `playwright` 依赖**（会拉 ~300MB 浏览器）；是否改为正式 devDependency 由用户后续决定。

### 9.3 不合并脚本

`e2e-admin-ui` 与 `e2e-admin-audit-local`、`smoke-admin-live` 与 `smoke-admin-audit-live` 场景有重叠，但**断言标签不同**，无法在不动行为的前提下证明「已被完全覆盖」。删除即拿覆盖换行数——不做。保留 6 个脚本，只去重基建。

## 10. 风险与回滚

| 风险 | 缓解 |
|---|---|
| 抽象与四个面板的实际差异不匹配 | 迁移顺序从最简单的 Projects 起步，第 2 步就暴露抽象是否够用；不够则回退该提交、修正抽象 |
| 重构引入行为回归且 e2e 未覆盖 | 每步 e2e 全绿 + 截图对比；纯逻辑新增单测兜住决策层 |
| CSS 拆分改变层叠顺序 | 按原顺序 `@import`；拆分后跑视觉对比截图 |
| 圆角统一造成意外外观变化 | 单独提交，附前后对比截图；回滚它不影响其它步骤 |

## 11. 未决项

1. **hook 层单测**是否引入 `jsdom` + `@testing-library/react`（+2 devDependencies）。
2. **playwright 是否转为正式 devDependency**（+~300MB 浏览器）。
3. `draftStore` 的双 API（10 个具名函数 + `draftStore` 对象）保留哪一个——倾向只留具名函数，但需确认无外部调用方。

## 12. Global Constraints

- 前端：`HashRouter`（禁 `BrowserRouter`）；命名导出（页面组件除外）；`@/` 绝对导入；**禁 `useMemo`/`useCallback`**；尽量避免 `useEffect`；组件单 `props` 参数、内联类型、`props.foo` 访问。
- 图标一律内联 SVG（`currentColor`），禁 emoji、禁 `×`/`✕` 字符图形。
- 敏感信息只进 gitignore 的 `.env`，不进任何入库文件。
- 提交身份：`DMianZhi <DMianZhi@users.noreply.github.com>`。
- 提交前必过：`pnpm run lint && pnpm run check:types && pnpm test`。
- 真实页面数据（截图、inventory、cases）留在本地 `workspace/`，验收证据只用 fixture 或脱敏样本。
