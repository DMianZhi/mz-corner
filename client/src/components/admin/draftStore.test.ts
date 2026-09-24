import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Store = typeof import('./draftStore');
let store: Store;

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

// draftStore 有模块级内存镜像 —— 那正是本次修复补上的兜底，但也意味着
// 上一个用例的草稿会漏到下一个用例（vi.stubGlobal 换了存储，模块级变量还在）。
// 所以每个用例都重置模块再重新导入，拿到干净的内存镜像。
async function loadStore(storage: MemoryStorage): Promise<Store> {
  vi.resetModules();
  vi.stubGlobal('sessionStorage', storage);
  return import('./draftStore');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('draftStore 草稿层', () => {
  beforeEach(async () => {
    store = await loadStore(new MemoryStorage());
  });

  it('写入后可读回 values 与 savedAt', () => {
    store.setDraft('articles', 'a1', { title: '改了一半' });
    const draft = store.getDraft('articles', 'a1');
    expect(draft?.values).toEqual({ title: '改了一半' });
    expect(typeof draft?.savedAt).toBe('number');
  });

  it('没有草稿时返回 null', () => {
    expect(store.getDraft('articles', 'nope')).toBeNull();
  });

  it('清除后返回 null', () => {
    store.setDraft('articles', 'a1', { title: 'x' });
    store.clearDraft('articles', 'a1');
    expect(store.getDraft('articles', 'a1')).toBeNull();
  });

  it('不同集合 / 不同文档互不干扰', () => {
    store.setDraft('articles', 'a1', { title: 'A' });
    store.setDraft('projects', 'a1', { name: 'P' });
    expect(store.getDraft('articles', 'a1')?.values).toEqual({ title: 'A' });
    expect(store.getDraft('projects', 'a1')?.values).toEqual({ name: 'P' });
    store.clearDraft('articles', 'a1');
    expect(store.getDraft('projects', 'a1')?.values).toEqual({ name: 'P' });
  });

  it('draftTotal 只数草稿，不含本地新建', () => {
    expect(store.draftTotal()).toBe(0);
    store.setDraft('articles', 'a1', { title: 'x' });
    expect(store.draftTotal()).toBe(1);
    store.addPending('articles', { _id: 'local:1', title: '新' });
    // draftTotal() = Object.keys(readMap()).length，pending 不在其中
    expect(store.draftTotal()).toBe(1);
  });

  it('订阅回调收到的是「草稿 + 本地新建」的总数', () => {
    const seen: number[] = [];
    const off = store.subscribeDrafts((count) => seen.push(count));
    // 订阅时会立即回调一次当前值
    expect(seen).toEqual([0]);
    store.setDraft('articles', 'a1', { title: 'x' });
    expect(seen).toEqual([0, 1]);
    // 订阅计数含 pending（notify 里是 draftTotal() + totalPendingCount()）
    store.addPending('articles', { _id: 'local:1', title: '新' });
    expect(seen).toEqual([0, 1, 2]);
    off();
  });

  it('退订后不再收到通知', () => {
    const seen: number[] = [];
    const off = store.subscribeDrafts((count) => seen.push(count));
    off();
    store.setDraft('articles', 'a2', { title: 'y' });
    expect(seen).toEqual([0]);
  });

  it('isLocalId 只认 local: 前缀', () => {
    expect(store.isLocalId('local:abc')).toBe(true);
    expect(store.isLocalId('art-01')).toBe(false);
  });

  it('newLocalId 带 local: 前缀且两次不同', () => {
    const a = store.newLocalId();
    const b = store.newLocalId();
    expect(a.startsWith('local:')).toBe(true);
    expect(a).not.toBe(b);
  });

  it('pending：add/list/remove 按集合隔离', () => {
    store.addPending('articles', { _id: 'local:1', title: 'A' });
    store.addPending('projects', { _id: 'local:2', name: 'P' });
    expect(store.listPending('articles')).toHaveLength(1);
    expect(store.listPending('projects')).toHaveLength(1);
    store.removePending('articles', 'local:1');
    expect(store.listPending('articles')).toHaveLength(0);
    expect(store.listPending('projects')).toHaveLength(1);
  });
});

describe('draftStore 降级（sessionStorage 不可写）', () => {
  beforeEach(async () => {
    store = await loadStore(new ReadOnlyStorage());
  });

  it('写不进 sessionStorage 时，草稿仍在内存里可读回（切标签不丢）', () => {
    store.setDraft('articles', 'a1', { title: '改了一半' });
    expect(store.getDraft('articles', 'a1')?.values).toEqual({ title: '改了一半' });
  });

  it('降级下清除草稿依然生效', () => {
    store.setDraft('articles', 'a1', { title: 'x' });
    store.clearDraft('articles', 'a1');
    expect(store.getDraft('articles', 'a1')).toBeNull();
  });

  it('降级下订阅通知照常触发', () => {
    const seen: number[] = [];
    const off = store.subscribeDrafts((count) => seen.push(count));
    store.setDraft('articles', 'a1', { title: 'x' });
    expect(seen).toEqual([0, 1]);
    off();
  });

  it('降级下本地新建同样可用', () => {
    store.addPending('articles', { _id: 'local:9', title: '新' });
    expect(store.listPending('articles')).toHaveLength(1);
  });
});
