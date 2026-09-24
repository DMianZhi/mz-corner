// 后台草稿暂存层。
//
// 解决审计 P0-1：有未保存改动时切文档 / 切标签 / 刷新页面 / 关标签页，草稿全部静默蒸发。
// 这里提供两层保障：
//   1. 模块级内存单例 —— 面板组件卸载（切标签）后数据仍在
//   2. sessionStorage 镜像 —— 刷新 / 关闭标签页后可恢复（会话结束才清掉，符合"草稿"语义）
//
// 设计取舍：
// - 只存「整份 values 快照」而不是 diff：恢复时直接覆盖，逻辑零分支
// - key = `${collection}:${docId}`，四个面板共用同一份代码
// - 另存「本地新建文档」列表：新建不再立即写库（审计 P0-2，线上那条空「未命名文章」就是它造成的），
//   首次保存才落库，期间只活在这里

const DRAFT_KEY = 'mz-admin-drafts';
const PENDING_KEY = 'mz-admin-pending';

type DraftMap = Record<string, { values: Record<string, unknown>; savedAt: number }>;

// 内存镜像：sessionStorage 不可写时（Safari 无痕 / 配额满）草稿仍能活过切标签。
//
// 之前这里**没有**内存层，文件头却声称有 —— 于是降级环境下草稿被静默丢弃，
// 而注释说它没丢（用只读 sessionStorage 探针实测：setDraft 之后 getDraft 返回 null）。
// 现在让行为与注释一致：内存是主副本，sessionStorage 是持久化镜像。
let memoryMap: DraftMap | null = null;

function readMap(): DraftMap {
  if (memoryMap) return memoryMap;
  try {
    memoryMap = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? '{}') as DraftMap;
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

/** 读取某篇文档的未保存草稿；没有则返回 null */
export function getDraft(collection: string, docId: string): { values: Record<string, unknown>; savedAt: number } | null {
  return readMap()[`${collection}:${docId}`] ?? null;
}

/** 写入草稿快照（整份 values） */
export function setDraft(collection: string, docId: string, values: Record<string, unknown>): void {
  const map = readMap();
  map[`${collection}:${docId}`] = { values, savedAt: Date.now() };
  writeMap(map);
  notify();
}

/** 保存成功 / 删除文档后清掉草稿 */
export function clearDraft(collection: string, docId: string): void {
  const map = readMap();
  delete map[`${collection}:${docId}`];
  writeMap(map);
  notify();
}

/** 全库还有几处未保存草稿（beforeunload 兜底与状态展示用） */
export function draftTotal(): number {
  return Object.keys(readMap()).length;
}

/* ── 变更通知 ─────────────────────────────────────────── */

const listeners = new Set<(count: number) => void>();
const notify = () => {
  const count = draftTotal() + totalPendingCount();
  for (const listener of listeners) listener(count);
};

/** 订阅草稿数量变化（顶栏「未保存」计数与 beforeunload 守卫的数据源），返回退订函数 */
export function subscribeDrafts(listener: (count: number) => void): () => void {
  listeners.add(listener);
  listener(draftTotal() + totalPendingCount());
  return () => listeners.delete(listener);
}

function totalPendingCount(): number {
  return readPending().length;
}

/* ── 本地新建（未落库的草稿文档）────────────────────────── */

type PendingDoc = { collection: string; doc: Record<string, unknown> & { _id: string } };

// 与草稿同一套降级策略：内存镜像 + sessionStorage 持久化
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

export function listPending(collection: string): Array<Record<string, unknown> & { _id: string }> {
  return readPending()
    .filter((item) => item.collection === collection)
    .map((item) => item.doc);
}

export function addPending(collection: string, doc: Record<string, unknown> & { _id: string }): void {
  const list = readPending();
  list.push({ collection, doc });
  writePending(list);
  notify();
}

export function removePending(collection: string, docId: string): void {
  writePending(readPending().filter((item) => !(item.collection === collection && item.doc._id === docId)));
  notify();
}

/** 本地新建的文档 id 有固定前缀，编辑器据此走 create 而不是 update */
export function isLocalId(docId: string): boolean {
  return docId.startsWith('local:');
}

export function newLocalId(): string {
  return `local:${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now())}`;
}
