# 管理后台代码质量重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 消除管理后台四个面板中同一套机制的**四份复制实现**，为逻辑层补上单元测试安全网，并按职责拆分两个超长文件。

**Architecture:** 组合式抽象——纯函数决策层（`savePlan.ts` / `selection.ts`）+ 三个 hook + 一个 dock 展示件（`SaveDock`）。四个面板保留各自独有的 JSX。保存的**写入策略由调用方以回调注入**，因此「逐文档 PATCH」「首次 POST」「集合级 bulk」三种策略共用同一套校验 / 错误映射 / 401 处理。**测试前置**：先给纯逻辑建网，再逐面板迁移。

**Tech Stack:** React 19（编译器，禁 `useMemo`/`useCallback`）+ TypeScript strict + vitest（node 环境，零新依赖）+ Playwright e2e。

**Spec:** [`docs/superpowers/specs/2026-09-23-admin-refactor-design.md`](../specs/2026-09-23-admin-refactor-design.md) —— 本计划实现该 spec；执行者需同时阅读两者。

## Global Constraints

- 前端路由必须 `HashRouter`，**禁 `BrowserRouter`**。
- 仅命名导出（页面组件除外，可用默认导出）。
- 使用 `@/` 绝对路径导入；同目录内可用相对路径。
- **禁 `useMemo` / `useCallback`**（React 编译器自动处理）；尽量避免 `useEffect`。
- 组件使用**单个 `props` 参数**并内联类型定义；通过 `props.foo` 访问，不解构。
- 3 个以上参数、可选标志或含义不明确的参数，**使用 options 对象**。
- 图标一律内联 SVG（`currentColor` 继承），**禁 emoji、禁 `×`/`✕` 字符图形**。
- 提交前必过：`pnpm run lint && pnpm run check:types && pnpm test`。
- 提交身份：`DMianZhi <DMianZhi@users.noreply.github.com>`。
- 敏感信息只进 gitignore 的 `.env`，不进任何入库文件。
- 真实页面数据（截图、inventory、cases）留在本地 `workspace/`；验收证据只用 fixture 或脱敏样本。
- **不新增运行时依赖**；本计划不引入 `jsdom` / `@testing-library/react`。

### 本计划用到的既有命令

| 用途 | 命令 |
|---|---|
| 类型检查 | `pnpm run check:types` |
| lint | `pnpm run lint` |
| 单测（前后端） | `pnpm test` |
| 仅客户端单测 | `pnpm --filter @mz-corner/client test` |
| 本地 e2e 前置（内存假库 + ADMIN_PASSWORD） | `node scripts/local-unicloud-harness.mjs full 8900` |
| 本地 e2e 前置（前端 dev） | `DEV_PORT=5199 API_DEV_TARGET=http://127.0.0.1:8900/mz-api pnpm --filter @mz-corner/client dev` |
| 本地 e2e 主套件 | `ADMIN_PASSWORD=mz-local-e2e node scripts/e2e-admin-audit-local.cjs` |
| 本地 e2e 其余三套 | `node scripts/e2e-admin-content.mjs` / `e2e-admin-scroll.cjs` / `e2e-admin-ui.cjs` |

---

## File Structure

### 新增

| 文件 | 职责 |
|---|---|
| `client/src/components/admin/savePlan.ts` | **纯函数**：保存决策（校验 / 失败归类 / 计数）。零 React 依赖 |
| `client/src/components/admin/savePlan.test.ts` | 上述纯函数的单测 |
| `client/src/components/admin/selection.ts` | **纯函数**：左栏选中回退（审计 P3-7 的唯一来源） |
| `client/src/components/admin/selection.test.ts` | 上述纯函数的单测 |
| `client/src/components/admin/draftStore.test.ts` | 草稿层单测（含 sessionStorage 降级） |
| `client/src/components/admin/useDocumentDraft.ts` | hook：`values/update/dirty/errors` + `pickValues` |
| `client/src/components/admin/useSaveAction.ts` | hook：`saving` + `run`（调 savePlan，执行副作用） |
| `client/src/components/admin/useCtrlS.ts` | hook：Ctrl/Cmd+S（ref 持最新回调，只注册一次） |
| `client/src/components/admin/SaveDock.tsx` | 浮动 dock 展示件 |
| `client/src/components/admin/ui/icon.tsx` | 图标 + `SrOnly` |
| `client/src/components/admin/ui/form.tsx` | 表单控件 + 字段元信息通道 + `fitTextarea` |
| `client/src/components/admin/ui/nav.tsx` | `Tabs` / `Rail` / `RailItem` / `Kicker` |
| `client/src/components/admin/ui/feedback.tsx` | `Badge` / `EmptyState` / `DangerConfirm` / `LinkButton` |
| `client/src/components/admin/ui/index.ts` | barrel 重导出（保持 `from './ui'` 不变） |
| `scripts/e2e/lib/harness.cjs` | e2e 共享基建（check / visualDiff / login / launch / report） |
| `scripts/e2e/lib/playwright.cjs` | playwright 解析（解除对无关 skill 目录的耦合） |

> **规划期修订**：spec §4.1 的 `DocumentDetail.tsx` **已从本计划移除**（hooks 落地后它是净亏，见文末 Self-Review 的「偏离」1）；`useRailSelection` 收敛为纯函数 `selection.ts`（偏离 2）；`admin.css` 文件拆分未单列任务（偏离 3）。

### 修改

`client/src/components/admin/{ProjectsPanel,CommentsPanel,SiteConfigPanel,ArticlesPanel,ArticleEditor}.tsx`、`draftStore.ts`、`client/src/styles/admin.css`、`client/src/styles/admin.css` 的调用方、6 个 e2e 脚本。

### 删除

`client/src/components/admin/ui.tsx`（内容全部搬进 `ui/`，Task 7）。

---

## Task 1: `savePlan` 纯函数（TDD）

把「校验 → 归类 → 计数」从组件里抽成纯函数。这是本重构的测试主战场，也是后面所有任务的地基。

**Files:**
- Create: `client/src/components/admin/savePlan.ts`
- Create: `client/src/components/admin/savePlan.test.ts`

**Interfaces:**
- Consumes: `validateValues` / `mapLabelErrorsToFields` / `FieldErrors`（来自 `./SchemaForm`）；`ContentField`（来自 `@/services/admin-api`）
- Produces:
  - `type SavePlan = { kind: 'invalid'; errors: FieldErrors; message: string } | { kind: 'proceed' }`
  - `type FailurePlan = { kind: 'auth-lost' } | { kind: 'field-errors'; errors: FieldErrors; message: string } | { kind: 'retry'; message: string }`
  - `function planSave(options: { fields: ContentField[]; values: Record<string, unknown> }): SavePlan`
  - `function planFailure(options: { fields: ContentField[]; error: unknown }): FailurePlan`
  - `function errorCount(errors: FieldErrors): number`
  - re-export `type FieldErrors`

- [ ] **Step 1: 写失败的测试**

创建 `client/src/components/admin/savePlan.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import type { ContentField } from '@/services/admin-api';
import { errorCount, planFailure, planSave } from './savePlan';

const FIELDS: ContentField[] = [
  { name: 'title', label: '标题', type: 'string', required: true, max: 5 },
  { name: 'order', label: '排序', type: 'number' },
  { name: 'publishDate', label: '发布日期', type: 'string' },
  { name: 'tags', label: '标签', type: 'string[]', itemMax: 3 },
];

const OK = { title: '短文', order: '3', publishDate: '2026-09-23', tags: ['a'] };

describe('planSave 客户端预检', () => {
  it('全部合法 → 放行', () => {
    expect(planSave({ fields: FIELDS, values: OK })).toEqual({ kind: 'proceed' });
  });

  it('必填为空 → 拦截，且文案带处数', () => {
    expect(planSave({ fields: FIELDS, values: { ...OK, title: '' } })).toEqual({
      kind: 'invalid',
      errors: { title: '标题不能为空' },
      message: '保存失败，有 1 处需要修正',
    });
  });

  it('超长 → 拦截', () => {
    expect(planSave({ fields: FIELDS, values: { ...OK, title: '一二三四五六' } })).toMatchObject({
      kind: 'invalid',
      errors: { title: '标题不能超过 5 字' },
    });
  });

  it('数字字段不可解析 → 拦截', () => {
    expect(planSave({ fields: FIELDS, values: { ...OK, order: 'abc' } })).toMatchObject({
      kind: 'invalid',
      errors: { order: '排序必须是数字' },
    });
  });

  it('日期格式非法 → 拦截', () => {
    expect(planSave({ fields: FIELDS, values: { ...OK, publishDate: '2026/9/3' } })).toMatchObject({
      kind: 'invalid',
      errors: { publishDate: '日期格式应为 YYYY-MM-DD' },
    });
  });

  it('单个标签超长 → 拦截', () => {
    expect(planSave({ fields: FIELDS, values: { ...OK, tags: ['abcd'] } })).toMatchObject({
      kind: 'invalid',
      errors: { tags: '单个标签不能超过 3 字' },
    });
  });

  it('非必填留空 → 放行（空值不触发 max / 格式规则）', () => {
    expect(
      planSave({ fields: FIELDS, values: { title: '短文', order: '', publishDate: '', tags: [] } }),
    ).toEqual({ kind: 'proceed' });
  });
});

describe('planFailure 服务端错误归类', () => {
  it('401 → 退回登录门', () => {
    const error = new Error('UNAUTHORIZED');
    error.name = 'Unauthorized';
    expect(planFailure({ fields: FIELDS, error })).toEqual({ kind: 'auth-lost' });
  });

  it('401 优先于 label 匹配（消息恰以 label 开头也不误判）', () => {
    const error = new Error('标题不能为空');
    error.name = 'Unauthorized';
    expect(planFailure({ fields: FIELDS, error })).toEqual({ kind: 'auth-lost' });
  });

  it('中文句子以 label 开头 → 落到字段', () => {
    expect(planFailure({ fields: FIELDS, error: new Error('标题不能为空') })).toEqual({
      kind: 'field-errors',
      errors: { title: '标题不能为空' },
      message: '保存失败，有 1 处需要修正',
    });
  });

  it('匹配不到 label → 兜底 toast + 重试', () => {
    expect(planFailure({ fields: FIELDS, error: new Error('网关超时') })).toEqual({
      kind: 'retry',
      message: '网关超时',
    });
  });

  it('非 Error 抛出 → 兜底文案', () => {
    expect(planFailure({ fields: FIELDS, error: 'boom' })).toEqual({
      kind: 'retry',
      message: '保存失败',
    });
  });
});

describe('errorCount', () => {
  it('统计字段数', () => {
    expect(errorCount({ a: 'x', b: 'y' })).toBe(2);
    expect(errorCount({})).toBe(0);
  });
});
```

- [ ] **Step 2: 跑测试，确认它失败**

Run: `pnpm --filter @mz-corner/client test src/components/admin/savePlan.test.ts`
Expected: FAIL —— `Failed to resolve import "./savePlan"`（模块还不存在）

- [ ] **Step 3: 写最小实现**

创建 `client/src/components/admin/savePlan.ts`：

```ts
// 保存决策层：把「校验 → 归类 → 计数」从组件里抽成纯函数。
//
// 抽它的原因很具体：这三件事原先在四个面板里各写一遍 ——
// 「N 处需要修正」的计数散在 3 个文件共 9 处，401 判定散在 6 个文件共 11 处，
// 任何一处漏改就是行为不一致。收敛到这里后只剩一份，且有单测兜住。
//
// 纯函数只做决策，副作用（toast / 聚焦 / setSaving）留给 useSaveAction。
import type { ContentField } from '@/services/admin-api';
import { mapLabelErrorsToFields, validateValues, type FieldErrors } from './SchemaForm';

export type { FieldErrors };

/** 客户端预检结果：不过则一个请求都不发 */
export type SavePlan =
  | { kind: 'invalid'; errors: FieldErrors; message: string }
  | { kind: 'proceed' };

/** 服务端失败的三种结局 */
export type FailurePlan =
  | { kind: 'auth-lost' }
  | { kind: 'field-errors'; errors: FieldErrors; message: string }
  | { kind: 'retry'; message: string };

export function errorCount(errors: FieldErrors): number {
  return Object.keys(errors).length;
}

/** 保存前的客户端校验（用服务端下发的同一份 schema 预检，审计 P2-5） */
export function planSave(options: {
  fields: ContentField[];
  values: Record<string, unknown>;
}): SavePlan {
  const errors = validateValues(options.fields, options.values);
  if (errorCount(errors) > 0) {
    return { kind: 'invalid', errors, message: `保存失败，有 ${errorCount(errors)} 处需要修正` };
  }
  return { kind: 'proceed' };
}

/**
 * 服务端失败的归类（审计 P2-4）：
 * 401 优先判定 —— 会话过期时该看到重新登录，而不是一堆红色报错；
 * 其余按「服务端中文句子以字段 label 开头」映射回字段；
 * 映射不到才退回顶部 toast（带重试入口）。
 */
export function planFailure(options: { fields: ContentField[]; error: unknown }): FailurePlan {
  const { error } = options;
  if (error instanceof Error && error.name === 'Unauthorized') return { kind: 'auth-lost' };

  const message = error instanceof Error ? error.message : '保存失败';
  const errors = mapLabelErrorsToFields(options.fields, message);
  if (errors) {
    return { kind: 'field-errors', errors, message: `保存失败，有 ${errorCount(errors)} 处需要修正` };
  }
  return { kind: 'retry', message };
}
```

- [ ] **Step 4: 跑测试，确认通过**

Run: `pnpm --filter @mz-corner/client test src/components/admin/savePlan.test.ts`
Expected: PASS，13 个用例全绿

- [ ] **Step 5: 类型检查 + lint**

Run: `pnpm run check:types && pnpm run lint`
Expected: 零错误

- [ ] **Step 6: 提交**

```bash
git add client/src/components/admin/savePlan.ts client/src/components/admin/savePlan.test.ts
git commit -m "refactor(admin): 抽出 savePlan 纯函数决策层（校验/归类/计数）并补单测"
```

---

## Task 2: 修复 `draftStore` 的内存兜底缺失 + 补单测

> **规划期新发现（探针实测）**：`draftStore.ts` 文件头声称「模块级内存单例 —— 面板组件卸载（切标签）后数据仍在」，`writeMap` 的 catch 也写着「内存单例仍在」。但代码里**根本不存在内存缓存**——模块级声明只有 `DRAFT_KEY` / `PENDING_KEY` / `listeners`，`readMap()` 的唯一数据源是 `sessionStorage`。
>
> 实测（用会抛异常的假 sessionStorage 跑）：`setDraft` 之后 `getDraft` 返回 `null` —— **草稿被静默丢弃**。也就是说 P0-1 的保证在 `sessionStorage` 不可写时（Safari 无痕、配额满）会失效，而注释声称它没失效。
>
> 本任务**补上那个被承诺的内存兜底**，让注释与行为一致。这是行为变更：降级环境下草稿现在能在内存里活过切标签（正常浏览器零变化）。

**Files:**
- Modify: `client/src/components/admin/draftStore.ts`
- Create: `client/src/components/admin/draftStore.test.ts`

**Interfaces:**
- Consumes: 无
- Produces: `draftStore` 现有 10 个具名导出保持**签名不变**（`getDraft` / `setDraft` / `clearDraft` / `draftTotal` / `subscribeDrafts` / `listPending` / `addPending` / `removePending` / `isLocalId` / `newLocalId`）；**删除** `draftStore` 别名对象导出

- [ ] **Step 1: 写失败的测试**

创建 `client/src/components/admin/draftStore.test.ts`：

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addPending,
  clearDraft,
  draftTotal,
  getDraft,
  isLocalId,
  listPending,
  newLocalId,
  removePending,
  setDraft,
  subscribeDrafts,
} from './draftStore';

/** 最小 sessionStorage 替身：够 draftStore 用 */
class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
}

/** 只读不可写的 sessionStorage：模拟 Safari 无痕 / 配额满 */
class ReadOnlyStorage extends MemoryStorage {
  override setItem(): void {
    throw new Error('QuotaExceededError');
  }
}

describe('draftStore 草稿层', () => {
  beforeEach(() => {
    vi.stubGlobal('sessionStorage', new MemoryStorage());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('写入后可读回 values 与 savedAt', () => {
    setDraft('articles', 'a1', { title: '改了一半' });
    const draft = getDraft('articles', 'a1');
    expect(draft?.values).toEqual({ title: '改了一半' });
    expect(typeof draft?.savedAt).toBe('number');
  });

  it('没有草稿时返回 null', () => {
    expect(getDraft('articles', 'nope')).toBeNull();
  });

  it('清除后返回 null', () => {
    setDraft('articles', 'a1', { title: 'x' });
    clearDraft('articles', 'a1');
    expect(getDraft('articles', 'a1')).toBeNull();
  });

  it('不同集合 / 不同文档互不干扰', () => {
    setDraft('articles', 'a1', { title: 'A' });
    setDraft('projects', 'a1', { name: 'P' });
    expect(getDraft('articles', 'a1')?.values).toEqual({ title: 'A' });
    expect(getDraft('projects', 'a1')?.values).toEqual({ name: 'P' });
    clearDraft('articles', 'a1');
    expect(getDraft('projects', 'a1')?.values).toEqual({ name: 'P' });
  });

  it('草稿总数 = 草稿数 + 本地新建数', () => {
    expect(draftTotal()).toBe(0);
    setDraft('articles', 'a1', { title: 'x' });
    expect(draftTotal()).toBe(1);
    addPending('articles', { _id: 'local:1', title: '新' });
    expect(draftTotal()).toBe(2);
  });

  it('订阅：变更触发通知，回调收到最新计数', () => {
    const seen: number[] = [];
    const off = subscribeDrafts((count) => seen.push(count));
    // 订阅时会立即回调一次当前值
    expect(seen).toEqual([0]);
    setDraft('articles', 'a1', { title: 'x' });
    expect(seen).toEqual([0, 1]);
    off();
  });

  it('退订后不再收到通知', () => {
    const seen: number[] = [];
    const off = subscribeDrafts((count) => seen.push(count));
    off();
    setDraft('articles', 'a2', { title: 'y' });
    expect(seen).toEqual([0]);
  });

  it('isLocalId 只认 local: 前缀', () => {
    expect(isLocalId('local:abc')).toBe(true);
    expect(isLocalId('art-01')).toBe(false);
  });

  it('newLocalId 带 local: 前缀且两次不同', () => {
    const a = newLocalId();
    const b = newLocalId();
    expect(a.startsWith('local:')).toBe(true);
    expect(a).not.toBe(b);
  });

  it('pending：add/list/remove 按集合隔离', () => {
    addPending('articles', { _id: 'local:1', title: 'A' });
    addPending('projects', { _id: 'local:2', name: 'P' });
    expect(listPending('articles')).toHaveLength(1);
    expect(listPending('projects')).toHaveLength(1);
    removePending('articles', 'local:1');
    expect(listPending('articles')).toHaveLength(0);
    expect(listPending('projects')).toHaveLength(1);
  });
});

describe('draftStore 降级（sessionStorage 不可写）', () => {
  beforeEach(() => {
    vi.stubGlobal('sessionStorage', new ReadOnlyStorage());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('写不进 sessionStorage 时，草稿仍在内存里可读回（切标签不丢）', () => {
    setDraft('articles', 'a1', { title: '改了一半' });
    expect(getDraft('articles', 'a1')?.values).toEqual({ title: '改了一半' });
  });

  it('降级下清除草稿依然生效', () => {
    setDraft('articles', 'a1', { title: 'x' });
    clearDraft('articles', 'a1');
    expect(getDraft('articles', 'a1')).toBeNull();
  });

  it('降级下订阅通知照常触发', () => {
    const seen: number[] = [];
    const off = subscribeDrafts((count) => seen.push(count));
    setDraft('articles', 'a1', { title: 'x' });
    expect(seen).toEqual([0, 1]);
    off();
  });
});
```

- [ ] **Step 2: 跑测试，确认降级那三条失败**

Run: `pnpm --filter @mz-corner/client test src/components/admin/draftStore.test.ts`
Expected: FAIL 3 条 —— 三条降级用例的 `getDraft` 返回 `null`（内存兜底不存在）。其余用例应通过。

- [ ] **Step 3: 补上内存兜底，并删掉名不副实的别名导出**

修改 `client/src/components/admin/draftStore.ts`：

把 `readMap` / `writeMap` 改成「内存镜像为主、sessionStorage 为持久化镜像」：

```ts
// 内存镜像：sessionStorage 不可写时（Safari 无痕 / 配额满）草稿仍能活过切标签。
// 之前这里没有内存层，文件头却声称有 —— 于是降级环境下草稿被静默丢弃，
// 而注释说它没丢。现在让行为与注释一致。
let memoryMap: DraftMap | null = null;

function readMap(): DraftMap {
  if (memoryMap) return memoryMap;
  try {
    memoryMap = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? '') as DraftMap;
  } catch {
    memoryMap = {};
  }
  return memoryMap;
}

function writeMap(map: DraftMap): void {
  memoryMap = map;
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(map));
  } catch {
    // sessionStorage 满 / 隐私模式：内存镜像已更新，只是掉不到刷新之后
  }
}
```

对 pending 列表做同样的处理：

```ts
let memoryPending: PendingDoc[] | null = null;

function readPending(): PendingDoc[] {
  if (memoryPending) return memoryPending;
  try {
    memoryPending = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? '[]') as PendingDoc[];
  } catch {
    memoryPending = [];
  }
  return memoryPending;
}

function writePending(list: PendingDoc[]): void {
  memoryPending = list;
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(list));
  } catch {
    /* 同上 */
  }
}
```

同时**删除**文件末尾的别名导出（两套 API 只留一套，spec §11.3）：

```ts
/** 兼容别名：防止误用命名空间式调用（真正 API 是 getDraft/setDraft/clearDraft） */
export const draftStore = { get: getDraft, set: setDraft, clear: clearDraft };
```

删除后必须同步改掉唯一的使用方 `ArticleEditor.tsx`（它用 `draftStore.get/set/clear`）：把 `draftStore.get('articles', key)` → `getDraft('articles', key)`、`draftStore.set(...)` → `setDraft(...)`、`draftStore.clear(...)` → `clearDraft(...)`，并把 import 从 `import { draftStore } from './draftStore'` 改为具名导入。

- [ ] **Step 4: 跑测试，确认全绿**

Run: `pnpm --filter @mz-corner/client test src/components/admin/draftStore.test.ts`
Expected: PASS，14 个用例全绿

- [ ] **Step 5: 确认没有残留的别名调用**

Run: `grep -rn "draftStore\." client/src/`
Expected: 无输出（除文件名/注释外没有 `draftStore.` 的调用）

- [ ] **Step 6: 类型检查 + lint + 全量单测**

Run: `pnpm run check:types && pnpm run lint && pnpm test`
Expected: 零错误

- [ ] **Step 7: 跑本地 e2e 确认草稿行为未回归**

前置：另开两个终端跑 harness 与 dev server（见 Global Constraints 的命令表），然后：
Run: `ADMIN_PASSWORD=mz-local-e2e node scripts/e2e-admin-audit-local.cjs`
Expected: 78 项全绿（草稿相关断言尤其要看）

- [ ] **Step 8: 提交**

```bash
git add client/src/components/admin/draftStore.ts client/src/components/admin/draftStore.test.ts client/src/components/admin/ArticleEditor.tsx
git commit -m "fix(admin): 补上 draftStore 承诺却缺失的内存兜底，并删除双份 API 别名"
```

---

## Task 3: 抽出共享 hook 与 dock，迁移 `ProjectsPanel`（首个消费者）

本任务落共享单元，并用最简单的面板验证抽象够用。**hooks 本身没有单测**（无 jsdom），它们的验证靠本任务末尾的 e2e —— 这也是把它们和首个消费者放在同一个任务里的原因。

**Files:**
- Create: `client/src/components/admin/selection.ts`
- Create: `client/src/components/admin/selection.test.ts`
- Create: `client/src/components/admin/useDocumentDraft.ts`
- Create: `client/src/components/admin/useSaveAction.ts`
- Create: `client/src/components/admin/useCtrlS.ts`
- Create: `client/src/components/admin/SaveDock.tsx`
- Modify: `client/src/components/admin/ProjectsPanel.tsx`（整文件重写）
- Modify: `client/src/components/admin/savePlan.ts`（补 `isAuthLost`）

**Interfaces:**
- Consumes: `savePlan` 的 `planSave` / `planFailure` / `errorCount` / `isAuthLost`；`draftStore` 的 `getDraft` / `setDraft` / `clearDraft` / `subscribeDrafts` / `draftTotal`；`SchemaForm` 的 `focusFirstError`；`ui` 的 `Button` / `Icon`
- Produces:
  - `function resolveSelection<T extends { _id: string }>(options: { documents: T[]; selectedId: string | null }): { selected: T | null; effectiveId: string | null }`
  - `function pickValues(fields: ContentField[], document: ContentDocument): Record<string, unknown>`
  - `function useDocumentDraft(options: { collection: string; document: ContentDocument; fields: ContentField[]; isNew?: boolean }): { values: Record<string, unknown>; update: (name: string, value: unknown) => void; dirty: boolean; errors: FieldErrors; setErrors: (next: FieldErrors) => void; discard: () => void }`
  - `function useSaveAction(options: { fields: ContentField[]; values: Record<string, unknown>; setErrors: (next: FieldErrors) => void; save: () => Promise<void>; onAuthLost: () => void; onSuccess?: () => Promise<void> | void; successMessage?: string }): { saving: boolean; run: () => Promise<void> }`
  - `function useCtrlS(options: { onSave: () => void; disabled?: boolean }): void`
  - `<SaveDock>` 组件（props 见下）

- [ ] **Step 1: 写 `selection` 的失败测试**

创建 `client/src/components/admin/selection.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { resolveSelection } from './selection';

const DOCS = [{ _id: 'a' }, { _id: 'b' }, { _id: 'c' }];

describe('resolveSelection 左栏选中回退', () => {
  it('未选中（null）→ 落到第一条，且 effectiveId 是回退后的 id', () => {
    // 审计 P3-7：判定高亮必须用 effectiveId，用 selectedId 会导致首屏一行都不亮
    expect(resolveSelection({ documents: DOCS, selectedId: null })).toEqual({
      selected: DOCS[0],
      effectiveId: 'a',
    });
  });

  it('选中项存在 → 原样返回', () => {
    expect(resolveSelection({ documents: DOCS, selectedId: 'b' })).toEqual({
      selected: DOCS[1],
      effectiveId: 'b',
    });
  });

  it('选中项已被删 → 回退到第一条', () => {
    expect(resolveSelection({ documents: DOCS, selectedId: 'gone' })).toEqual({
      selected: DOCS[0],
      effectiveId: 'a',
    });
  });

  it('列表为空 → 两者都是 null', () => {
    expect(resolveSelection({ documents: [], selectedId: 'a' })).toEqual({
      selected: null,
      effectiveId: null,
    });
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @mz-corner/client test src/components/admin/selection.test.ts`
Expected: FAIL —— `Failed to resolve import "./selection"`

- [ ] **Step 3: 实现 `selection.ts`**

```ts
// 左栏选中项解析：未选中（selectedId 为 null）或选中项已被删时落到第一条。
//
// 抽成纯函数的原因很具体：审计 P3-7 的 bug 就出在这条规则上 ——
// 判定高亮必须用**回退后**的 id，否则首屏 selectedId 还是 null，左栏一行都不亮。
// 原先四个面板各写一遍，改一处漏三处。
export function resolveSelection<T extends { _id: string }>(options: {
  documents: T[];
  selectedId: string | null;
}): { selected: T | null; effectiveId: string | null } {
  const selected =
    options.documents.find((doc) => doc._id === options.selectedId) ??
    options.documents[0] ??
    null;
  return { selected, effectiveId: selected?._id ?? null };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @mz-corner/client test src/components/admin/selection.test.ts`
Expected: PASS，4 个用例全绿

- [ ] **Step 5: 给 `savePlan.ts` 补 `isAuthLost`**

把 401 判定从散落的 11 处收敛到一处。在 `savePlan.ts` 末尾追加：

```ts
/**
 * 会话过期判定（401）。原先这个判断散在 6 个文件共 11 处 ——
 * 删文档、建文档、批量保存各处都抄了一遍，漏一处就是「会话过期时弹红字」而不是退回登录门。
 */
export function isAuthLost(error: unknown): boolean {
  return error instanceof Error && error.name === 'Unauthorized';
}
```

并把 `planFailure` 里的内联判断改用它：

```ts
export function planFailure(options: { fields: ContentField[]; error: unknown }): FailurePlan {
  const { error } = options;
  if (isAuthLost(error)) return { kind: 'auth-lost' };
  // ...其余不变
}
```

在 `savePlan.test.ts` 追加：

```ts
describe('isAuthLost', () => {
  it('只认 name === Unauthorized 的 Error', () => {
    const unauthorized = new Error('x');
    unauthorized.name = 'Unauthorized';
    expect(isAuthLost(unauthorized)).toBe(true);
    expect(isAuthLost(new Error('x'))).toBe(false);
    expect(isAuthLost('Unauthorized')).toBe(false);
    expect(isAuthLost(null)).toBe(false);
  });
});
```

（记得把 `isAuthLost` 加进该测试文件的 import。）

- [ ] **Step 6: 实现三个 hook**

创建 `client/src/components/admin/useDocumentDraft.ts`：

```ts
// 草稿优先的文档编辑状态（审计 P0-1）。
//
// 初始化顺序：草稿 > 文档当前值 —— 草稿存在说明上次编辑没保存就离开了，恢复它。
//
// 副作用（写草稿）必须留在 updater 之外：updater 在 React 渲染期执行，
// 在里面写草稿会同步通知订阅方（顶栏「N 未保存」徽标）改状态，
// React 会报「Cannot update a component while rendering a different component」。
import { useState, useSyncExternalStore } from 'react';
import type { ContentDocument, ContentField } from '@/services/admin-api';
import { clearDraft, draftTotal, getDraft, setDraft, subscribeDrafts } from './draftStore';
import type { FieldErrors } from './savePlan';

/** 从文档抽出可编辑字段的当前值（viewCount 这类系统字段不参与编辑） */
export function pickValues(
  fields: ContentField[],
  document: ContentDocument,
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const field of fields) values[field.name] = document[field.name];
  return values;
}

export function useDocumentDraft(options: {
  collection: string;
  document: ContentDocument;
  fields: ContentField[];
  /** 本地新建的虚拟文档：没有已保存值可比，dirty 恒为 true */
  isNew?: boolean;
}): {
  values: Record<string, unknown>;
  update: (name: string, value: unknown) => void;
  dirty: boolean;
  errors: FieldErrors;
  setErrors: (next: FieldErrors) => void;
  discard: () => void;
} {
  // 注意：不解构 options.document —— 它会遮蔽全局 document
  const { collection, fields } = options;
  const docId = options.document._id;

  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const draft = getDraft(collection, docId);
    if (draft) return draft.values;
    return pickValues(fields, options.document);
  });
  const [errors, setErrors] = useState<FieldErrors>({});

  // draftStore 变更时重渲：dirty 与左栏草稿点都由它推导（审计 P3）
  useSyncExternalStore(subscribeDrafts, draftTotal);

  const dirty = options.isNew ? true : getDraft(collection, docId) !== null;

  const update = (name: string, value: unknown) => {
    const next = { ...values, [name]: value };
    setValues(next);
    setDraft(collection, docId, next);
    // 就地清掉该字段的错误：错误只在保存时校验，编辑期间保持安静
    if (name in errors) {
      const cleared: FieldErrors = { ...errors };
      delete cleared[name];
      setErrors(cleared);
    }
  };

  const discard = () => clearDraft(collection, docId);

  return { values, update, dirty, errors, setErrors, discard };
}
```

创建 `client/src/components/admin/useSaveAction.ts`：

```ts
// 保存动作编排：校验 → 字段定位 → 错误归类 → 重试 toast → 401 退登录门。
//
// 写入策略由调用方以 save 回调注入 —— 逐文档 PATCH、首次 POST、集合级 bulk
// 三种策略因此共用同一套错误处理（原先四份 save 各写一遍）。
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { ContentField } from '@/services/admin-api';
import { focusFirstError } from './SchemaForm';
import { planFailure, planSave, type FieldErrors } from './savePlan';

export function useSaveAction(options: {
  fields: ContentField[];
  values: Record<string, unknown>;
  setErrors: (next: FieldErrors) => void;
  /** 只负责写入 + 清草稿；成功后由 run 统一收尾 */
  save: () => Promise<void>;
  onAuthLost: () => void;
  /** 成功后的收尾（如重新拉列表）。时机在成功 toast 之后，与重构前一致 */
  onSuccess?: () => Promise<void> | void;
  successMessage?: string;
}): { saving: boolean; run: () => Promise<void> } {
  const [saving, setSaving] = useState(false);

  const run = async () => {
    const plan = planSave({ fields: options.fields, values: options.values });
    if (plan.kind === 'invalid') {
      options.setErrors(plan.errors);
      focusFirstError(options.fields, plan.errors);
      toast.error(plan.message);
      return;
    }

    setSaving(true);
    try {
      await options.save();
      options.setErrors({});
      toast.success(options.successMessage ?? '已保存');
      await options.onSuccess?.();
    } catch (error) {
      const failure = planFailure({ fields: options.fields, error });
      if (failure.kind === 'auth-lost') {
        options.onAuthLost();
        return;
      }
      if (failure.kind === 'field-errors') {
        options.setErrors(failure.errors);
        focusFirstError(options.fields, failure.errors);
        toast.error(failure.message);
        return;
      }
      // 兜底：重试入口指向最新一次 run —— 失败后用户可能又改了值，
      // 若用「失败那一刻的 values」重试，会拿旧数据覆盖新改动
      toast.error(failure.message, { action: { label: '重试', onClick: () => void latestRun.current() } });
    } finally {
      setSaving(false);
    }
  };

  const latestRun = useRef(run);
  useEffect(() => {
    latestRun.current = run;
  });

  return { saving, run };
}
```

创建 `client/src/components/admin/useCtrlS.ts`：

```ts
import { useEffect, useRef } from 'react';

/**
 * Ctrl/Cmd+S 保存（审计 P4）。
 *
 * 用 ref 指向最新一次的回调：否则必须把 onSave 放进依赖数组，而它每次渲染
 * 都是新函数 —— 监听会被反复注销重注册（原先四处都写成无依赖数组）。
 * 回调只在事件处理器里读取，不在渲染期读写 ref。
 */
export function useCtrlS(options: { onSave: () => void; disabled?: boolean }): void {
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's') return;
      event.preventDefault();
      const { onSave, disabled } = latest.current;
      if (!disabled) onSave();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
```

- [ ] **Step 7: 实现 `SaveDock.tsx`**

创建 `client/src/components/admin/SaveDock.tsx`：

```tsx
import type { ReactNode } from 'react';
import { Button, Icon } from './ui';

/**
 * 浮动保存条（审计 P4 一致性）：四个面板的「保存在哪」不再需要分别记忆。
 *
 * 槽位按真实的 DOM 顺序给，保证重构前后 DOM 结构完全一致：
 *   文章编辑器的三态切换在最前（leading）
 *   站点设置的「放弃改动」在保存之前（before）
 *   项目 / 评论的「删除」在保存之后（after）
 */
export function SaveDock(props: {
  /** 文章编辑器的三态切换按钮组（含其后的分隔线） */
  leading?: ReactNode;
  status: string;
  /** 状态文案是否固定宽度居中：避免「有改动 / 已同步」切换时按钮左右跳动 */
  statusFixed?: boolean;
  /** 状态之后、保存按钮之前 */
  before?: ReactNode;
  /** 保存按钮之后 */
  after?: ReactNode;
  saving: boolean;
  disabled?: boolean;
  saveLabel?: string;
  onSave: () => void;
}) {
  const statusStyle =
    props.statusFixed === false
      ? undefined
      : { padding: '0 8px', minWidth: 62, textAlign: 'center' as const };

  return (
    <div className="adm-dock">
      {props.leading}
      <span className="label-site" style={statusStyle}>
        {props.status}
      </span>
      {props.before}
      <Button
        variant="primary"
        size="sm"
        icon={<Icon.Save size={14} />}
        loading={props.saving}
        disabled={props.disabled ?? false}
        onClick={props.onSave}
      >
        {props.saveLabel ?? '保存'}
      </Button>
      {props.after}
    </div>
  );
}
```

- [ ] **Step 8: 迁移 `ProjectsPanel.tsx`（整文件替换）**

```tsx
// 项目面板：左索引 + 右详情表单。
//
// 表单用 `key={doc._id}` 强制重挂载来重置内部状态 —— 比在 useEffect 里手动
// 同步「选中项变了 → 重填表单」更不容易出错（AGENTS.md 也要求少用 effect）。
//
// 本轮重构：草稿 / 保存 / Ctrl+S / 选中回退 / dock 改用共享单元
//（useDocumentDraft / useSaveAction / useCtrlS / resolveSelection / SaveDock），
// 与评论、站点设置、文章走同一套实现 —— 原先这五件事各写了一遍。
import { useState } from 'react';
import { toast } from 'sonner';
import {
  createContent,
  deleteContent,
  updateContent,
  type ContentDocument,
  type ContentField,
} from '@/services/admin-api';
import { asText, emptyValues, SchemaForm } from './SchemaForm';
import { statusTone, StatusText } from './status';
import { getDraft } from './draftStore';
import { isAuthLost } from './savePlan';
import { resolveSelection } from './selection';
import { useCtrlS } from './useCtrlS';
import { useDocumentDraft } from './useDocumentDraft';
import { useSaveAction } from './useSaveAction';
import { SaveDock } from './SaveDock';
import {
  Badge,
  DangerConfirm,
  EmptyState,
  FieldValue,
  Icon,
  Kicker,
  LinkButton,
  Rail,
  RailItem,
  TextInput,
} from './ui';

const COLLECTION = 'projects';

function ProjectDetail(props: {
  document: ContentDocument;
  fields: ContentField[];
  onSaved: () => Promise<void>;
  onDeleted: () => Promise<void>;
  onAuthLost: () => void;
}) {
  const draft = useDocumentDraft({
    collection: COLLECTION,
    document: props.document,
    fields: props.fields,
  });

  const action = useSaveAction({
    fields: props.fields,
    values: draft.values,
    setErrors: draft.setErrors,
    onAuthLost: props.onAuthLost,
    save: async () => {
      await updateContent(COLLECTION, props.document._id, draft.values);
      draft.discard();
    },
    onSuccess: props.onSaved,
  });

  useCtrlS({ onSave: () => void action.run(), disabled: action.saving });

  const remove = async () => {
    try {
      await deleteContent(COLLECTION, props.document._id);
      toast.success('已删除');
      await props.onDeleted();
    } catch (error) {
      if (isAuthLost(error)) {
        props.onAuthLost();
        return;
      }
      toast.error(error instanceof Error ? error.message : '删除失败');
    }
  };

  const color = asText(draft.values.color) || 'var(--brand)';

  return (
    <div className="adm-detail">
      <Kicker num="06" label="PROJECTS" />

      <TextInput
        value={asText(draft.values.name)}
        big
        placeholder="项目名称"
        onChange={(next) => draft.update('name', next)}
      />

      <div className="adm-dmeta">
        <span
          style={{
            width: 9,
            height: 9,
            borderRadius: 3,
            background: color,
            display: 'inline-block',
          }}
        />
        <span>{asText(draft.values.tagline) || '未填简介'}</span>
        <span>排序 {asText(draft.values.order) || '0'}</span>
        <StatusText value={asText(draft.values.status)} />
      </div>

      <div className="adm-sec">
        <span className="label-site">字段</span>
        <hr className="adm-divider" style={{ flex: 1 }} />
        {draft.dirty ? <Badge tone="brand">未保存</Badge> : null}
      </div>

      <SchemaForm
        fields={props.fields}
        values={draft.values}
        onChange={draft.update}
        errors={draft.errors}
        exclude={['name']}
      />

      <FieldValue label="ID">
        <span className="font-mono-site" style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
          {props.document._id}
        </span>
      </FieldValue>

      <SaveDock
        status={draft.dirty ? '有改动' : '已同步'}
        saving={action.saving}
        disabled={!draft.dirty}
        onSave={() => void action.run()}
        after={
          <>
            <span className="adm-dock-sep" />
            <DangerConfirm size="sm" label="删除" confirmLabel="确认删除" onConfirm={remove} />
          </>
        }
      />
    </div>
  );
}

export function ProjectsPanel(props: {
  fields: ContentField[];
  documents: ContentDocument[];
  onReload: () => Promise<void>;
  onAuthLost: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // 未选中时默认落到第一条：切标签后右栏不该是一片空白（demo B 的行为）
  const { selected } = resolveSelection({ documents: props.documents, selectedId });

  const create = async () => {
    setCreating(true);
    try {
      const id = await createContent(COLLECTION, {
        ...emptyValues(props.fields),
        name: '新项目',
        status: 'wip',
      });
      await props.onReload();
      setSelectedId(id);
      toast.success('已创建，记得补全信息');
    } catch (error) {
      if (isAuthLost(error)) {
        props.onAuthLost();
        return;
      }
      toast.error(error instanceof Error ? error.message : '创建失败');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="adm-workbench">
      <Rail
        title="项目"
        count={props.documents.length}
        action={
          <LinkButton tone="brand" loading={creating} onClick={create}>
            ＋ 新建项目
          </LinkButton>
        }
      >
        {props.documents.map((doc, index) => (
          <RailItem
            key={doc._id}
            index={index + 1}
            title={asText(doc.name) || '(未命名)'}
            // 用回退后的 id 判定高亮，否则首屏 selectedId 还是 null，左栏一行都不亮（审计 P3-7）
            selected={doc._id === selected?._id}
            tone={statusTone(asText(doc.status))}
            pending={getDraft(COLLECTION, doc._id) !== null}
            onSelect={() => setSelectedId(doc._id)}
          />
        ))}
      </Rail>

      <section className="adm-pane">
        {selected ? (
          <ProjectDetail
            key={selected._id}
            document={selected}
            fields={props.fields}
            onSaved={props.onReload}
            onAuthLost={props.onAuthLost}
            onDeleted={async () => {
              setSelectedId(null);
              await props.onReload();
            }}
          />
        ) : (
          <EmptyState
            icon={<Icon.Folder size={18} />}
            title="还没有项目"
            hint="点左上角「＋ 新建项目」；颜色、符号、排序都会立刻反映在首页项目墙。"
          />
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 9: 类型检查 + lint + 单测**

Run: `pnpm run check:types && pnpm run lint && pnpm test`
Expected: 零错误（`isAuthLost` 与 `resolveSelection` 的新测试也在内）

- [ ] **Step 10: 跑本地 e2e 四套**

前置同 Task 2 Step 7。依次跑：

```bash
ADMIN_PASSWORD=mz-local-e2e node scripts/e2e-admin-audit-local.cjs
ADMIN_PASSWORD=mz-local-e2e node scripts/e2e-admin-content.mjs
ADMIN_PASSWORD=mz-local-e2e node scripts/e2e-admin-scroll.cjs
ADMIN_PASSWORD=mz-local-e2e node scripts/e2e-admin-ui.cjs
```

Expected: 分别 78 / 44 / 38 / 37 全绿。**特别注意**：草稿点、Ctrl+S、删除两步确认、未保存徽标这几组断言。

- [ ] **Step 11: 截图对比（确认项目面板像素级不变）**

用与重构前相同的视口与数据截项目面板，与重构前截图逐像素比对（`visualDiff` 手法同 e2e 脚本）。若有差异，必须能解释为「无」——有差异就是行为回归，回退本任务。

- [ ] **Step 12: 提交**

```bash
git add client/src/components/admin/selection.ts client/src/components/admin/selection.test.ts \
  client/src/components/admin/useDocumentDraft.ts client/src/components/admin/useSaveAction.ts \
  client/src/components/admin/useCtrlS.ts client/src/components/admin/SaveDock.tsx \
  client/src/components/admin/savePlan.ts client/src/components/admin/savePlan.test.ts \
  client/src/components/admin/ProjectsPanel.tsx
git commit -m "refactor(admin): 抽出草稿/保存/Ctrl+S/选中/dock 共享单元并迁移项目面板"
```

---

## Task 4: 迁移 `CommentsPanel`

同一套替换，验证共享单元在第二个面板上成立（含 `articleTitle` 这种面板独有的额外 props）。

**Files:**
- Modify: `client/src/components/admin/CommentsPanel.tsx`

**Interfaces:**
- Consumes: Task 3 的全部产出（签名不变）
- Produces: 无新增导出

- [ ] **Step 1: 迁移 `CommentsPanel.tsx`**

按 Task 3 Step 8 的同构方式改（保留评论面板独有的 `articleTitle` 元信息行与 `exclude`）：

- 顶部 `COLLECTION = 'comments'`
- `CommentDetail` 里把 `values/setValues`、`errors/setErrors`、`dirty`、`useSyncExternalStore(subscribeDrafts, draftTotal)` 四件事换成一次 `useDocumentDraft({ collection: COLLECTION, document: props.document, fields: props.fields })`
- `save` 的写入策略保留原样（`updateContent('comments', …)` + `clearDraft`），交给 `useSaveAction` 的 `save` 回调；`onSuccess` 传 `props.onSaved`
- 删掉手写的 Ctrl+S effect，改用 `useCtrlS`
- dock 换成 `<SaveDock>`（`after` 传分隔线 + `DangerConfirm`，与项目面板一致）
- `remove` 的 401 判断改用 `isAuthLost`
- 面板层 `selected` 改用 `resolveSelection`，`RailItem` 的 `selected` 用回退后的 id
- **`articleTitle` 的元信息行原样保留**（含 `#/post/<id>` 外链与 `font-mono-site` 兜底）

- [ ] **Step 2: 类型检查 + lint + 单测**

Run: `pnpm run check:types && pnpm run lint && pnpm test`
Expected: 零错误

- [ ] **Step 3: 跑本地 e2e 四套**

命令同 Task 3 Step 10。Expected: 78 / 44 / 38 / 37 全绿。

- [ ] **Step 4: 截图对比评论面板**

与重构前逐像素比对。Expected: 无差异。

- [ ] **Step 5: 提交**

```bash
git add client/src/components/admin/CommentsPanel.tsx
git commit -m "refactor(admin): 评论面板迁移到共享草稿/保存/dock 单元"
```

---

## Task 5: 迁移 `SiteConfigPanel`（批量保存 → 验证策略注入）

站点设置的保存是**集合级批量**（多个 key-value 文档一起提交），且它的详情字段是自渲染的（不经过 `SchemaForm`，因为「值」字段要按 key 名切换单行/多行）。本任务验证「写入策略注入」对 bulk 也成立。

> **⚠️ 本任务含一处已知行为变更，必须知悉后再执行**
>
> `site_config` 的 schema 里 `key` 是 `required: true, max: 60`（见 `server/utils/content-schema.ts` 的 `SITE_CONFIG_FIELDS`）。改用共享保存后会先跑客户端校验，于是：
> - **改前**：清空「键名」→ 整批保存被服务端打回 → 顶部 toast 报错（这一批全都白改）
> - **改后**：清空「键名」→ 本地拦下 → 键名字段红框 + 自动聚焦 + toast，不发请求
>
> 这是设计里明确要的「三种策略共用同一套校验/错误映射」（spec §4.2、§5），对用户是改善；但它确实是可见行为变化，**不属于「唯一例外是圆角」那条**。执行时若本地 e2e 因此报红，**停下来报告，不要改测试去迁就**。

**Files:**
- Modify: `client/src/components/admin/SiteConfigPanel.tsx`

**Interfaces:**
- Consumes: `useDocumentDraft` / `useSaveAction` / `useCtrlS` / `resolveSelection` / `SaveDock` / `isAuthLost`（签名同 Task 3）
- Produces: 无新增导出

- [ ] **Step 1: 迁移 `SiteConfigPanel.tsx`**

关键改动（其余结构保持）：

1. 顶部 `const COLLECTION = 'site_config';`
2. 选中与排序：
   ```tsx
   const ordered = [...props.documents].sort((a, b) => { /* 原样保留分组+键名排序 */ });
   const { selected } = resolveSelection({ documents: ordered, selectedId });
   ```
3. **必须先把详情抽成子组件 `SiteConfigDetail`，并用 `key={selected._id}` 挂载**。这是硬性要求，不是风格问题：
   `useDocumentDraft` 的 `values` 是 `useState` 初始化的，**只在挂载时读一次草稿/文档**。而站点设置的详情原本是**内联渲染**的（没有 `key`），切配置项时不会重挂载。若把 hook 直接放进 `SiteConfigPanel` 本体，切换选中项会得到：
   - `values` 仍是上一条配置的值（表单显示错内容）
   - `update` 里 `{ ...values, [name]: value }` 会把**上一条的值整份写进当前条的草稿** —— 静默数据损坏

   所以照项目/评论/文章的成例做（它们的详情都是带 `key` 的子组件，文件注释里写明了这个取舍）：

   ```tsx
   function SiteConfigDetail(props: {
     document: ContentDocument;
     fields: ContentField[];
     onReload: () => Promise<void>;
     onAuthLost: () => void;
     changedCount: number;
     onDiscardAll: () => void;
   }) {
     const draft = useDocumentDraft({
       collection: COLLECTION,
       document: props.document,
       fields: props.fields,
     });
     // ...详情 JSX 与保存编排
   }
   ```

   面板层：
   ```tsx
   {selected ? (
     <SiteConfigDetail
       key={selected._id}
       document={selected}
       fields={props.fields}
       onReload={props.onReload}
       onAuthLost={props.onAuthLost}
       changedCount={changedIds.length}
       onDiscardAll={discardAll}
     />
   ) : (
     <EmptyState /* 原样保留 */ />
   )}
   ```

   这样 hook 里就不再需要 `selected ?? { _id: '' }` 这种占位（`selected` 为 null 时不渲染该组件）。
4. 列表级的草稿读取（跨文档，hook 管不到）保持用 `getDraft`：
   ```tsx
   const changedIds = ordered.filter((doc) => getDraft(COLLECTION, doc._id) !== null).map((doc) => doc._id);
   const valueOf = (doc: ContentDocument): string =>
     asText(getDraft(COLLECTION, doc._id)?.values.value ?? doc.value);
   ```
5. 保存改用共享编排（bulk 写进 `save` 回调）：
   ```tsx
   const action = useSaveAction({
     fields: props.fields,
     values: draft.values,
     setErrors: draft.setErrors,
     onAuthLost: props.onAuthLost,
     save: async () => {
       await bulkUpdateContent(
         COLLECTION,
         changedIds.map((id) => ({ _id: id, ...(getDraft(COLLECTION, id)?.values ?? {}) })),
       );
       for (const id of changedIds) clearDraft(COLLECTION, id);
     },
     successMessage: `已保存 ${changedIds.length} 项设置`,
     onSuccess: props.onReload,
   });
   useCtrlS({ onSave: () => void action.run(), disabled: action.saving });
   ```
   > `changedIds` 在 `SiteConfigDetail` 里拿不到（它是跨文档的列表级状态）—— 从 props 传 `changedCount`，或把它作为一个参数传进组件；**不要**在子组件里重新扫一遍全列表。
6. dock 换成 `<SaveDock>`：站点设置的顺序是「状态 → 弹性占位 → 放弃改动 → 保存全部」，且状态文案**不带固定宽度**：
   ```tsx
   <SaveDock
     status={changedIds.length > 0 ? `${changedIds.length} 项待保存` : '没有改动'}
     statusFixed={false}
     saving={action.saving}
     disabled={changedIds.length === 0}
     saveLabel="保存全部"
     onSave={() => void action.run()}
     before={
       <>
         <span style={{ flex: 1 }} />
         <LinkButton disabled={changedIds.length === 0} onClick={discardAll}>
           放弃改动
         </LinkButton>
       </>
     }
   />
   ```
7. `discardAll` 保留（跨文档，hook 的 `discard` 只管选中那条）：
   ```tsx
   const discardAll = () => {
     for (const id of changedIds) clearDraft(COLLECTION, id);
   };
   ```
8. 自渲染的 `FieldRow`（值 / 键名 / 分组）改用 `draft.values` 与 `draft.update`，**保留**「值」字段按 `LONG_KEYS` 切单行/多行、以及键名的 hint 文案（审计 P0-3）
9. 元信息行与「未保存」Badge 用 `draft.dirty`；`RailItem` 的 `tone` 用第 4 步的 `valueOf(doc) ? 'on' : 'off'`

- [ ] **Step 2: 类型检查 + lint + 单测**

Run: `pnpm run check:types && pnpm run lint && pnpm test`
Expected: 零错误

- [ ] **Step 3: 跑本地 e2e 四套（重点看键名 hint 与批量保存）**

命令同 Task 3 Step 10。Expected: 78 / 44 / 38 / 37 全绿。

> 若报红且与「客户端校验提前拦截」有关：这是 Step 1 里预告的行为变更，**停下来向用户报告**，不要改断言。

- [ ] **Step 4: 截图对比站点设置面板**

与重构前逐像素比对。注意 `statusFixed={false}` 就是为了让状态文案不变成居中固定宽度。

- [ ] **Step 5: 提交**

```bash
git add client/src/components/admin/SiteConfigPanel.tsx
git commit -m "refactor(admin): 站点设置迁移到共享保存编排（bulk 策略注入）"
```

---

## Task 6: 迁移 `ArticlesPanel` + `ArticleEditor`（最复杂：三态编辑器 + 本地新建）

文章面板有两个别处没有的机制：**三态模式切换**（编辑/分屏/预览）与**本地新建**（`local:` 前缀虚拟文档，首次保存才 POST）。本任务把它们接到共享单元上。

**Files:**
- Modify: `client/src/components/admin/ArticlesPanel.tsx`
- Modify: `client/src/components/admin/ArticleEditor.tsx`

**Interfaces:**
- Consumes: `useDocumentDraft`（`isNew` 传 true 时 dirty 恒真）/ `useSaveAction` / `useCtrlS` / `resolveSelection` / `SaveDock` / `pickValues` / `isAuthLost`
- Produces: `ArticleEditor` 的对外 props **签名不变**（`ArticlesPanel` 是唯一调用方）

- [ ] **Step 1: 迁移 `ArticleEditor.tsx`**

1. 删掉文件内自有的 `pickValues`，改从 `useDocumentDraft` 导入（避免两份实现）
2. 编辑状态改用 hook，**`isNew` 透传**：
   ```tsx
   const draft = useDocumentDraft({
     collection: 'articles',
     document: props.article,
     fields: props.fields,
     isNew: props.isNew,
   });
   ```
3. 保存改用共享编排，**两条分支都保留**：
   ```tsx
   const action = useSaveAction({
     fields: props.fields,
     values: draft.values,
     setErrors: draft.setErrors,
     onAuthLost: props.onAuthLost,
     save: async () => {
       if (props.isNew) {
         if (!props.onSaveNew) throw new Error('本地新建缺少落库回调');
         await props.onSaveNew(draft.values);
         return;
       }
       await updateContent('articles', draftKey, draft.values);
       draft.discard();
       await props.onSaved();
     },
   });
   useCtrlS({ onSave: () => void action.run(), disabled: action.saving });
   ```
   > 注意与项目面板的差别：文章的 `onSaved` 在 `save` 内（改前就是这个顺序），不要挪到 `onSuccess`。
4. dock 换成 `<SaveDock>`，**三态按钮组走 `leading`**（含其后的分隔线），**放弃与删除走 `before`**（改前它们在保存按钮之前）：
   ```tsx
   <SaveDock
     leading={
       <>
         {MODES.map((item) => (
           <button
             key={item.value}
             type="button"
             className="adm-dock-btn"
             aria-pressed={mode === item.value}
             onClick={() => setMode(item.value)}
           >
             {item.icon}
             {item.label}
           </button>
         ))}
         <span className="adm-dock-sep" />
       </>
     }
     status={draft.dirty ? '有改动' : '已同步'}
     saving={action.saving}
     onSave={() => void action.run()}
     before={
       props.isNew ? (
         <LinkButton onClick={props.onDiscard}>放弃</LinkButton>
       ) : (
         <>
           <LinkButton onClick={props.onDiscard} disabled={!draft.dirty}>
             放弃
           </LinkButton>
           {props.onDelete ? (
             <DangerConfirm size="sm" label="删除" confirmLabel="确认删除" onConfirm={props.onDelete} />
           ) : null}
         </>
       )
     }
   />
   ```
   > 文章的保存按钮**改前就没有 `disabled={!dirty}`**（本地新建时 dirty 恒真、已落库文章允许重复保存）——`SaveDock` 的 `disabled` 缺省 `false`，正好一致，**不要**补上 `disabled`。
5. 标题与正文的自定义渲染、`fitTextarea` 自动增高、`ResizeObserver` 宽度重算、切模式滚动到正文顶部 —— **全部原样保留**（这些是文章独有逻辑）
6. 标题错误态（`adm-fv--error` 那条）保留

- [ ] **Step 2: 迁移 `ArticlesPanel.tsx`**

1. `selected` 改用共享回退，**注意它排除了本地草稿**（本地草稿排在真实文档之后）：
   ```tsx
   const allDocs: ContentDocument[] = [...ordered, ...pendingList];
   const { selected, effectiveId } = resolveSelection({ documents: allDocs, selectedId });
   ```
   `RailItem` 的 `selected` 用 `effectiveId`（`allDocs` 里既有真实文档也有 `local:` 虚拟文档，`effectiveId` 两者都能命中）
2. `create` / `discardNew` / `saveNew` / `removeArticle` 的 401 判断统一改用 `isAuthLost`
3. **本地新建的虚拟文档 id 前缀判定、`addPending` / `removePending` / `listPending` 的调用时机全部原样保留**（审计 P0-2 的核心）

- [ ] **Step 3: 类型检查 + lint + 单测**

Run: `pnpm run check:types && pnpm run lint && pnpm test`
Expected: 零错误

- [ ] **Step 4: 跑本地 e2e 四套（重点：新建不落库、Ctrl+S、三态切换）**

命令同 Task 3 Step 10。Expected: 78 / 44 / 38 / 37 全绿。

- [ ] **Step 5: 截图对比文章面板三态**

编辑 / 分屏 / 预览三态各截一张，与重构前逐像素比对。

- [ ] **Step 6: 提交**

```bash
git add client/src/components/admin/ArticlesPanel.tsx client/src/components/admin/ArticleEditor.tsx
git commit -m "refactor(admin): 文章面板与三态编辑器迁移到共享单元"
```

---

## Task 7: 拆分 `ui.tsx`（808 行 → `ui/` 5 文件）

纯搬家。barrel 保证所有 `from './ui'` 的导入一行不改。

**Files:**
- Create: `client/src/components/admin/ui/{icon,form,nav,feedback,index}.ts(x)`
- Delete: `client/src/components/admin/ui.tsx`

**Interfaces:**
- Consumes: 无
- Produces: `ui/index.ts` barrel，导出集与拆分前的 `ui.tsx` **完全相同**

- [ ] **Step 1: 记录拆分前的导出清单与消费方**

```bash
grep -o "^export \(function\|const\|type\|interface\) [A-Za-z]*" \
  client/src/components/admin/ui.tsx | sort > /tmp/ui-exports-before.txt
wc -l /tmp/ui-exports-before.txt
grep -rln "from './ui'" client/src/ > /tmp/ui-consumers-before.txt
cat /tmp/ui-consumers-before.txt
```

Expected: 导出清单与消费方文件清单落盘，供 Step 5 比对。

- [ ] **Step 2: 按分区注释搬运**

`ui.tsx` 已有分区注释，按它切（用注释行定位，不要按行号猜）：

| 目标文件 | 搬入的分区 |
|---|---|
| `ui/icon.tsx` | `── 图标 ──` 段（`Icon` + `SrOnly`） |
| `ui/form.tsx` | `── 字段元信息 ──`、`── 按钮 ──`、`── 表单字段 ──` 三段（含 `fitTextarea`） |
| `ui/nav.tsx` | `── 标签（下划线式）──`、`── 左索引栏 ──` 两段 |
| `ui/feedback.tsx` | `── 详情页零件 ──`、`── 展示件 ──` 两段 |

规则：
- 每个新文件顶部放**它自己用到的** import（React、`@/` 路径等），不要照抄整份 import
- **函数体一字不改**（这是纯搬家）
- 跨文件依赖（如 `form.tsx` 用到 `icon.tsx` 的 `Icon`）用 `import { Icon } from './icon'`
- 保留原有的中文注释

- [ ] **Step 3: 写 barrel**

创建 `client/src/components/admin/ui/index.ts`：

```ts
// 管理后台 UI 零件桶文件。
//
// 拆分自原 ui.tsx（808 行），按职责分成四份；这里统一重导出，
// 使所有 `from './ui'` 的调用方一行都不用改。
export * from './feedback';
export * from './form';
export * from './icon';
export * from './nav';
```

- [ ] **Step 4: 删除原文件**

```bash
git rm client/src/components/admin/ui.tsx
```

- [ ] **Step 5: 校验导出集与消费方都没变**

```bash
grep -rho "^export \(function\|const\|type\|interface\) [A-Za-z]*" \
  client/src/components/admin/ui/ | sort > /tmp/ui-exports-after.txt
diff /tmp/ui-exports-before.txt /tmp/ui-exports-after.txt && echo "导出集一致"
grep -rln "from './ui'" client/src/ > /tmp/ui-consumers-after.txt
diff /tmp/ui-consumers-before.txt /tmp/ui-consumers-after.txt && echo "消费方一致"
```

Expected: 两条都打印「一致」，`diff` 无输出。

- [ ] **Step 6: 类型检查 + lint + 单测**

Run: `pnpm run check:types && pnpm run lint && pnpm test`
Expected: 零错误。**`check:types` 是本步骤的关键闸门**——漏搬任何导出都会在这里暴露。

- [ ] **Step 7: 顺带合并重复 import**

`ProjectsPanel.tsx` / `CommentsPanel.tsx` 里若仍有从 `./SchemaForm` 的两行 import（`asText, emptyValues, SchemaForm` 与 `mapLabelErrorsToFields as mapErrors`），合并成一行：

```ts
import { asText, emptyValues, SchemaForm } from './SchemaForm';
```

（`mapErrors` 的用法已在 Task 3/4 被 `useSaveAction` 取代，应当已经消失；若仍存在说明前面漏改，回头补齐。）

- [ ] **Step 8: 跑本地 e2e 四套**

命令同 Task 3 Step 10。Expected: 78 / 44 / 38 / 37 全绿。

- [ ] **Step 9: 提交**

```bash
git add -A client/src/components/admin/
git commit -m "refactor(admin): ui.tsx 按职责拆成 ui/ 四文件 + barrel，导入不变"
```

---

## Task 8: `admin.css` 令牌化（零视觉变化）

只把**已经重复出现**的间距/尺寸值收敛为 admin 局部令牌。**不做全量间距重排**（那是视觉重设计）。

**Files:**
- Modify: `client/src/styles/admin.css`

**Interfaces:**
- Consumes: 无
- Produces: admin 局部 CSS 变量（`:root` 或 `.adm-shell` 作用域）

- [ ] **Step 1: 记录改动前的视觉基线**

对四个面板 + dock + 表单各截一张（明暗两套），存到本地 `workspace/`（不入 git），供 Step 4 比对。

- [ ] **Step 2: 定义令牌**

在 `admin.css` 的 `── 外壳 ──` 段之前插入：

```css
/* ── 局部令牌 ─────────────────────────────────────────
   圆角引用站点令牌（--radius-sm/md/lg，与前台同源）；
   这里只补 admin 自己重复出现、站点令牌里没有的量。 */
:root {
  --dock-r: 14px;      /* 浮动工具条容器圆角 */
  --dock-pad: 5px;     /* 工具条内边距（子元素圆角 = 容器圆角 − 它） */
  --dock-btn-r: calc(var(--dock-r) - var(--dock-pad));  /* 同心圆角 */
  --dock-btn-h: 30px;  /* 工具条内按钮统一高度 */
}
```

> `--dock-r` / `--dock-pad` / `--dock-btn-r` / `--dock-btn-h` 在前一轮修 dock 圆角时已经就地定义在 `.adm-dock` 上，本步骤把它们**上移到 `:root`** 并补齐注释，行为不变。

- [ ] **Step 3: 收敛重复的间距值**

只替换**同一取值出现 3 次以上**的间距（如 `padding: 10px` 出现在 4 处）。对每处：先确认语义相同（都是卡片内边距 / 都是行间距），语义不同的**不要**合并。

**每改一处，改完立刻对照 Step 1 的截图确认无视觉变化。**

- [ ] **Step 4: 视觉回归比对**

重新截图，与 Step 1 的基线逐像素比对。Expected: 无差异（令牌化只改写法）。

- [ ] **Step 5: 跑本地 e2e 四套**

命令同 Task 3 Step 10。Expected: 78 / 44 / 38 / 37 全绿（滚动与布局断言对间距最敏感）。

- [ ] **Step 6: 提交**

```bash
git add client/src/styles/admin.css
git commit -m "refactor(admin): admin.css 局部令牌化（零视觉变化）"
```

---

## Task 9: 圆角统一到站点令牌（唯一可见变更）

> **执行前必须拿到用户对前后对比截图的确认。** 这是整个重构里唯一改可见外观的一步。

**Files:**
- Modify: `client/src/styles/admin.css`

**Interfaces:**
- Consumes: 站点令牌 `--radius-sm`(7.2px) / `--radius-md`(9.6px) / `--radius-lg`(12px)，`--radius-pill`（新增）
- Produces: 无

- [ ] **Step 1: 出前后对比截图（明暗两套）**

对以下元素各截特写：primary 按钮（登录门 / 保存）、badge、brand-mark、chip、sm 按钮、empty-icon、dock。**先把这批截图交给用户确认，确认后才动 CSS。**

- [ ] **Step 2: 逐个替换圆角**

按这张表改（左列是当前值，去 `admin.css` 里 grep 定位）：

| 选择器 | 现值 | 改为 |
|---|---|---|
| `.adm-brand-mark` | 7px | `var(--radius-sm)` |
| `.adm-tab:focus-visible` | 3px | **保留**（语义一次性：下划线式标签的内环） |
| `.adm-link:focus-visible` | 3px | **保留** |
| `.adm-btn` | 9px | `var(--radius-md)` |
| `.adm-btn--primary` | 999px | `var(--radius-md)` |
| `.adm-btn--sm` | 8px | `var(--radius-sm)` |
| `.adm-btn--sm.adm-btn--primary` | 999px | `var(--radius-md)` |
| `.adm-select` | 9px | `var(--radius-md)` |
| `.adm-reveal-btn` | 7px | `var(--radius-sm)` |
| `.adm-input--title` | 0 | **保留**（标题靠底线，无框） |
| `.adm-taginput` | 9px | `var(--radius-md)` |
| `.adm-chip` | 7px | `var(--radius-sm)` |
| `.adm-chip-x` | 4px | **保留** |
| `.adm-chip-x::after` | 8px | `var(--radius-sm)` |
| `.adm-badge` | 6px | `var(--radius-sm)` |
| `.adm-card` | `var(--radius)` | **保留**（已是站点令牌） |
| `.adm-ritem-d` | 50% | **保留**（圆点） |
| `.adm-dock` | `var(--dock-r)` | **保留**（14px，前台令牌无近邻，见 spec §8.2b 注） |
| `.adm-dock-btn` | 9px | `var(--radius-md)` |
| `.adm-dock .adm-btn` | `var(--dock-btn-r)` | **保留**（同心关系，优先于上面的 `.adm-btn`） |
| `.adm-split .adm-textarea` | 0 | **保留** |
| `.adm-empty-icon` | 12px | `var(--radius-lg)` |
| 滚动条 `::-webkit-scrollbar-thumb` | 999px | **保留** |
| `.adm-ritem-p` | 50% | **保留** |

- [ ] **Step 3: 变体不再改几何**

把 `.adm-btn--primary` 的 `padding: 8px 15px` 改为与 `.adm-btn` 一致，`.adm-btn--sm.adm-btn--primary` 的 `padding: 7px 13px` 同上处理 —— **几何交给 size，variant 只改配色**。

注意：**`.adm-dock .adm-btn` 的圆角/高度覆盖必须保持在文件里排在 `.adm-btn--sm.adm-btn--primary` 之后**（特异性相同，靠源序取胜）。改完用 `grep -n` 确认这两条的相对行号没被调换。

- [ ] **Step 4: 出改后截图，与 Step 1 的基线并排比对**

逐像素确认差异只出现在预期元素上，且幅度符合 spec（最大 1.2px）。

- [ ] **Step 5: 跑本地 e2e 四套**

命令同 Task 3 Step 10。Expected: 78 / 44 / 38 / 37 全绿。

> dock 圆角统一那条断言（「去重后必须只剩 1 个值」）在这一步尤其关键——它当初就是为这类回归加的。

- [ ] **Step 6: 提交**

```bash
git add client/src/styles/admin.css
git commit -m "style(admin): 圆角统一到站点令牌，primary 不再是胶囊（含前后对比）"
```

---

## Task 10: e2e 基建去重 + 解除 playwright 的隐藏耦合

**Files:**
- Create: `scripts/e2e/lib/harness.cjs`
- Create: `scripts/e2e/lib/playwright.cjs`
- Modify: `scripts/e2e-admin-audit-local.cjs`、`scripts/e2e-admin-content.mjs`、`scripts/e2e-admin-scroll.cjs`、`scripts/e2e-admin-ui.cjs`、`scripts/smoke-admin-audit-live.cjs`、`scripts/smoke-admin-live.cjs`、`scripts/shots-admin-demos.cjs`、`scripts/shots-scroll.cjs`

**Interfaces:**
- Consumes: 无
- Produces: `harness.cjs` 导出 `check` / `visualDiff` / `launch` / `login` / `report` / `OUT`；`playwright.cjs` 导出 `chromium`

- [ ] **Step 1: 写 playwright 解析器**

创建 `scripts/e2e/lib/playwright.cjs`：

```js
// playwright 解析：原先 7 个脚本都硬编码了
// C:/Users/admin/.wpscomate/agent/skills/custom/career-ops/node_modules/playwright
// —— 项目测试基建耦合在一个无关 skill 的安装目录上，那个 skill 一升级或卸载，
// 全部浏览器测试立刻失效。这里按优先级解析，全部失败时报明确错误。
const path = require('node:path');

const CANDIDATES = [
  process.env.PLAYWRIGHT_PATH,
  path.join(__dirname, '../../../node_modules/playwright'),
  'C:/Users/admin/.wpscomate/agent/skills/custom/career-ops/node_modules/playwright',
].filter(Boolean);

let chromium = null;
const tried = [];
for (const candidate of CANDIDATES) {
  try {
    ({ chromium } = require(candidate));
    break;
  } catch (error) {
    tried.push(`  ${candidate} → ${error.code || error.message}`);
  }
}

if (!chromium) {
  console.error('找不到 playwright。已尝试：');
  console.error(tried.join('\n'));
  console.error('设置 PLAYWRIGHT_PATH 环境变量指向 playwright 的安装目录，或在项目里安装它。');
  process.exit(2);
}

module.exports = { chromium };
```

- [ ] **Step 2: 写共享 harness**

创建 `scripts/e2e/lib/harness.cjs`（把 6 个脚本里各自抄了一份的样板集中到这里；`check` 与 `visualDiff` 的实现**逐字搬运**自 `e2e-admin-audit-local.cjs`，不要重写）：

```js
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('./playwright');

const BASE = process.env.E2E_BASE || 'http://localhost:5199';
const PW = process.env.ADMIN_PASSWORD || 'mz-local-e2e';
const OUT = 'C:/Users/admin/data/work/blog/mz-corner/.wpscomate/e2e-shots';

let pass = 0;
let fail = 0;
const failures = [];

function check(name, expected, actual) {
  // 逐字搬运自 e2e-admin-audit-local.cjs
}

/** 「选中态真的渲染出来了吗」——比较选中元素与未选中元素的计算样式（逐字搬运） */
async function visualDiff(page, onSel, offSel, keys) {
  // ...
}

async function launch() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  return { browser, page };
}

/** 登录门 → 进入工作台 */
async function login(page) {
  await page.goto(`${BASE}/#/admin`);
  // ...填口令、提交、等待工作台出现
}

function report(title) {
  console.log(`\n══ ${title}：${pass} 通过 / ${fail} 失败`);
  if (failures.length) console.log(`失败项：\n  · ${failures.join('\n  · ')}`);
  process.exitCode = fail ? 1 : 0;
}

module.exports = { BASE, PW, OUT, check, visualDiff, launch, login, report };
```

> `check` / `visualDiff` / `login` 的具体实现**从现有脚本里搬**（`e2e-admin-audit-local.cjs` 的 `check` 与 `visualDiff` 有完整注释，`smoke-admin-audit-live.cjs` 的登录段最完整）。搬完先让 `e2e-admin-audit-local.cjs` 跑通，再改其余脚本。

- [ ] **Step 3: 逐个脚本改用 harness（每改一个立刻跑一遍）**

顺序：`e2e-admin-audit-local.cjs` → `e2e-admin-ui.cjs` → `e2e-admin-scroll.cjs` → `e2e-admin-content.mjs` → `smoke-admin-audit-live.cjs` → `smoke-admin-live.cjs` → 两个 `shots-*.cjs`。

每个脚本：删掉自己的 `check` / `pass` / `fail` / `failures` / `visualDiff` / 浏览器启动 / `BASE` / `PW` / `OUT` 定义，改为从 `./e2e/lib/harness.cjs` 引入；**场景代码与断言标签一字不改**。

> `e2e-admin-content.mjs` 是 API 层（不启浏览器），只需引入 `check` / `report`。

- [ ] **Step 4: 每改完一个脚本就跑一遍，确认断言条数不变**

Expected 条数（必须一条不少）：audit-local 78、content 44、scroll 38、ui 37、smoke-audit-live 49、smoke-live 16。

- [ ] **Step 5: 验证 playwright 解析器的降级路径**

```bash
PLAYWRIGHT_PATH=/nonexistent node -e "require('./scripts/e2e/lib/playwright.cjs')"
```
Expected: 打印尝试列表并 `exit 2`（不是崩溃堆栈）。

- [ ] **Step 6: 全量跑一遍六套**

命令见 Global Constraints。Expected: 全部全绿且条数不变。

- [ ] **Step 7: 提交**

```bash
git add scripts/
git commit -m "test(e2e): 抽出共享 harness，解除 playwright 对无关 skill 目录的硬编码耦合"
```

---

## Self-Review（对照 spec 逐项）

**Spec 覆盖检查：**

| Spec 章节 | 对应任务 |
|---|---|
| §4.1 `savePlan.ts` | Task 1 |
| §4.1 `useDocumentDraft` / `useSaveAction` / `useCtrlS` | Task 3 |
| §4.1 `SaveDock` | Task 3 |
| §4.1 `useRailSelection`（收敛为纯函数 `selection.ts`，见下「偏离」） | Task 3 |
| §4.1 `DocumentDetail`（**已移除**，见下「偏离」） | —— |
| §4.3 面板体量下降 | Task 3~6 |
| §5 保存编排纯函数 | Task 1 + Task 3 Step 5（`isAuthLost`） |
| §6 迁移顺序 1~9 | Task 1~10 |
| §7 测试计划 | Task 1 / 2 / 3 |
| §8.1 `ui.tsx` 拆分 | Task 7 |
| §8.2a 令牌化 | Task 8 |
| §8.2b 圆角统一 | Task 9 |
| §8.2c 文件拆分 | **已并入 Task 8/9 的前置**，见下「偏离」 |
| §9 e2e 基建 | Task 10 |
| §10 风险与回滚 | 各任务的 e2e + 截图闸门 |
| §11 未决项 | 见下 |

**对 spec 的三处偏离（均为规划期发现，需用户知悉）：**

1. **移除 `DocumentDetail`**（spec §4.1）。原因：hooks 落地后，`ProjectDetail` / `CommentDetail` 剩下的重复只是 ~35 行 JSX（差异 4 处）。组件化后：2 个调用点各 ~20 行 + 组件本体 ~45 行 = 85 行，**反而比内联的 70 行多 15 行**，还多一层 10 个 props 的间接。原先 122 行的重复里，主体是 hooks 现在吸收的逻辑。按 YAGNI 去掉。

2. **`useRailSelection` 改为纯函数 `resolveSelection`**（spec §4.1）。理由：它是纯计算，没有 hook 的必要；做成纯函数**可以单测**（Task 3 有 4 个用例），而 hook 形式在本项目无 jsdom 的前提下测不了。收益更好。

3. **`admin.css` 文件拆分（spec §8.2c）未单列任务**。理由：拆分是纯搬家但有一个硬风险——末尾审计覆盖段依赖**源序**取胜（`.adm-dock .adm-btn` 必须排在 `.adm-btn--sm.adm-btn--primary` 之后）。在 Task 8/9 已经要动这些规则的情况下，先拆再改等于把「搬家错序」和「改值错序」两种风险叠在一起，红了难归因。建议**等 Task 9 稳定后单独立项**，或确认要做我补一个 Task 11。

**占位符扫描：** 无 TBD / TODO / 「类似上文」。Task 10 Step 2 的 `check` / `visualDiff` / `login` 标注为「逐字搬运自现有脚本并指明来源文件」，属**搬家指令**而非占位符（现有实现就在仓库里，且这是避免重写引入差异的刻意选择）。

**类型一致性检查：** `planSave` / `planFailure` / `errorCount` / `isAuthLost` / `resolveSelection` / `pickValues` / `useDocumentDraft` / `useSaveAction` / `useCtrlS` / `SaveDock` 的签名在 Task 1/3 定义一次，Task 4/5/6 只按名引用，未出现别名。

**规划期发现的实施陷阱（已写进任务里）：**

- **`useDocumentDraft` 要求消费者是带 `key` 的子组件。** 它的 `values` 只在挂载时初始化一次；而站点设置的详情原本是内联渲染的，切配置项不会重挂载 —— 直接把 hook 放进面板本体，会把**上一条的值整份写进当前条的草稿**（静默数据损坏）。Task 5 Step 1 第 3 条已强制要求先抽 `SiteConfigDetail` 并加 `key`。项目 / 评论 / 文章三处原本就是带 `key` 的子组件，不受影响。
- **`draftStore` 的“内存兜底”不存在**（Task 2 已单列修复），实测证明降级环境下草稿被静默丢弃。

**未决项（spec §11）落实：**
1. hook 层单测是否引入 jsdom —— 本计划**不引入**（Task 3 的 hooks 靠 e2e 验证），保持零新依赖。
2. playwright 是否转正式 devDependency —— 本计划**不引入**，改为 `PLAYWRIGHT_PATH` 可配置解析（Task 10）。
3. `draftStore` 双 API —— 本计划**删除别名对象**，只留具名函数（Task 2 Step 3）。

---

## Execution Handoff

计划已落盘。两种执行方式：

1. **Subagent-Driven（推荐）** —— 每个任务派一个全新 subagent，任务间我来审查，迭代快、上下文干净
2. **Inline Execution** —— 在当前会话里按 executing-plans 分批执行，带检查点

**另需注意**：Task 5 含一处已预告的行为变更（站点设置引入客户端校验），Task 9 需要你先看前后对比截图才能动手。
