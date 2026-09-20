#!/usr/bin/env node
/**
 * 本地假 uniCloud 数据库 —— 供本地模拟器（local-unicloud-harness.mjs）使用。
 *
 * 为什么需要：新数据层不再依赖任何外部 API，改为读取云函数运行时注入的全局 `uniCloud`
 * （见 server/data/providers/unicloud-db/client.ts）。本地没有这个全局，
 * 于是整条链路（路由 → service → 仓储 → 数据库）无法离线验证。
 * 这里用内存实现补上该全局，覆盖本项目用到的 API 子集：
 *   collection().where().skip().limit().get() / count() / remove()
 *   collection().doc(id).get() / update() / remove()
 *   collection().add()
 *
 * 注意：这是**测试替身**，不追求与真实云数据库语义完全一致（例如不校验字段类型、
 * 不做权限判定）。它的价值在于让「查询条件写错、翻页丢数据、字段没归一」这类
 * 本地就能发现的问题暴露出来，而不是等上传到云端才发现。
 */

const PAGE_LIMIT = 1000;

function match(document, condition) {
  return Object.entries(condition).every(([field, value]) => document[field] === value);
}

class FakeQuery {
  constructor(store, state) {
    this.store = store;
    this.state = state;
  }

  where(condition) {
    return new FakeQuery(this.store, { ...this.state, condition });
  }

  skip(count) {
    return new FakeQuery(this.store, { ...this.state, offset: Number(count) || 0 });
  }

  limit(count) {
    return new FakeQuery(this.store, { ...this.state, size: Number(count) || PAGE_LIMIT });
  }

  matched() {
    return [...this.store.entries()].filter(([, document]) => match(document, this.state.condition));
  }

  async get() {
    const rows = this.matched()
      .slice(this.state.offset, this.state.offset + this.state.size)
      .map(([id, document]) => ({ _id: id, ...document }));
    return { data: rows };
  }

  async count() {
    return { total: this.matched().length };
  }

  async remove() {
    const rows = this.matched();
    for (const [id] of rows) this.store.delete(id);
    return { deleted: rows.length };
  }
}

class FakeCollection extends FakeQuery {
  constructor(store, sequence) {
    super(store, { condition: {}, offset: 0, size: PAGE_LIMIT });
    this.sequence = sequence;
  }

  doc(id) {
    const store = this.store;
    return {
      get: async () => {
        const document = store.get(id);
        return { data: document ? [{ _id: id, ...document }] : [] };
      },
      update: async (patch) => {
        const document = store.get(id);
        if (!document) return { updated: 0 };
        store.set(id, { ...document, ...patch });
        return { updated: 1 };
      },
      remove: async () => ({ deleted: store.delete(id) ? 1 : 0 }),
    };
  }

  async add(document) {
    const id = `local_${++this.sequence.value}`;
    this.store.set(id, { ...document });
    return { id };
  }
}

export function createFakeUnicloudDatabase(seed = {}) {
  const collections = new Map();
  const sequence = { value: 0 };

  for (const [name, documents] of Object.entries(seed)) {
    const store = new Map();
    documents.forEach((document, index) => store.set(`${name}_${index}`, { ...document }));
    collections.set(name, store);
  }

  return {
    database() {
      return {
        collection(name) {
          if (!collections.has(name)) collections.set(name, new Map());
          return new FakeCollection(collections.get(name), sequence);
        },
      };
    },
    /** 供调试：查看某集合当前条数 */
    count(name) {
      return collections.get(name)?.size ?? 0;
    },
    names() {
      return [...collections.keys()];
    },
  };
}

/** 装上假库（覆盖 globalThis.uniCloud），返回句柄便于打印状态 */
export function installFakeUnicloudDatabase(seed = HARNESS_SEED) {
  const fake = createFakeUnicloudDatabase(seed);
  globalThis.uniCloud = fake;
  return fake;
}

/**
 * 模拟器用的种子数据。
 * 刻意混入两种「容易被忽略」的形态：
 *   - status 为历史中文值「已发布」（验证读取时的状态归一）
 *   - tags 为逗号分隔字符串（验证数组字段归一）
 * 这样本地自检就能覆盖归一逻辑，而不是只在单测里覆盖。
 */
export const HARNESS_SEED = {
  articles: [
    {
      title: "本地自检：已发布文章",
      content: "# 你好\n\n这是模拟器种子数据。",
      category: "技术",
      tags: ["React", "TypeScript"],
      publishDate: "2026-08-01",
      summary: "模拟器种子文章",
      viewCount: 7,
      status: "published",
    },
    {
      title: "本地自检：历史状态值文章",
      content: "状态是历史中文值，应被归一为已发布。",
      category: "随笔",
      tags: "随笔, 记录",
      publishDate: "2026-07-15",
      summary: "验证状态与标签归一",
      viewCount: 3,
      status: "已发布",
    },
    {
      title: "本地自检：草稿文章",
      content: "草稿不应出现在列表里。",
      category: "技术",
      tags: [],
      publishDate: "2026-08-02",
      summary: "草稿",
      viewCount: 0,
      status: "draft",
    },
  ],
  comments: [
    {
      articleId: "articles_0",
      author: "测试者",
      email: "test@example.com",
      content: "评论内容",
      createTime: "2026/08/01",
    },
  ],
  projects: [
    {
      name: "示例项目",
      tagline: "一句话简介",
      description: "项目描述",
      tech: ["Vue", "Node.js"],
      link: "https://example.com",
      color: "#4D6BFE",
      symbol: "★",
      order: 1,
      status: "live",
    },
  ],
  site_config: [
    { key: "name", value: "本地自检" },
    { key: "skills", value: "React, TypeScript" },
  ],
};
