/**
 * uniCloud 云数据库仓储单测。
 *
 * 用内存假库替身，验证「查询条件 + 翻页 + 字段归一 + 写回」这些真实会出错的环节，
 * 不需要连云环境。重点覆盖两处容易静默出错的地方：
 *   1. 翻页拉全量（超过单页上限后不能丢数据）
 *   2. 状态归一（非法值不能把草稿当已发布放出去）
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DbCollection, DbDocument, DbListResult, UniCloudDatabase } from "./client";
import { resetUniCloudDatabase, setUniCloudDatabase } from "./client";
import { PAGE_SIZE } from "./collections";
import { UnicloudDbBlogRepository } from "./repository";

/* ------------------------------ 内存假库 ------------------------------ */

interface QueryState {
  condition: Record<string, unknown>;
  offset: number;
  limit: number;
}

class FakeQuery {
  constructor(
    protected readonly store: Map<string, Record<string, unknown>>,
    protected readonly state: QueryState = { condition: {}, offset: 0, limit: Number.MAX_SAFE_INTEGER },
  ) {}

  where(condition: Record<string, unknown>): FakeQuery {
    return new FakeQuery(this.store, { ...this.state, condition });
  }

  skip(count: number): FakeQuery {
    return new FakeQuery(this.store, { ...this.state, offset: count });
  }

  limit(count: number): FakeQuery {
    return new FakeQuery(this.store, { ...this.state, limit: count });
  }

  protected matched(): Array<[string, Record<string, unknown>]> {
    return [...this.store.entries()].filter(([, doc]) =>
      Object.entries(this.state.condition).every(([field, value]) => doc[field] === value),
    );
  }

  async get(): Promise<DbListResult> {
    const rows = this.matched()
      .slice(this.state.offset, this.state.offset + this.state.limit)
      .map(([id, doc]) => ({ _id: id, ...doc }) as DbDocument);
    return { data: rows };
  }

  async count(): Promise<{ total: number }> {
    return { total: this.matched().length };
  }

  async remove(): Promise<{ deleted: number }> {
    const rows = this.matched();
    for (const [id] of rows) this.store.delete(id);
    return { deleted: rows.length };
  }
}

class FakeCollection extends FakeQuery implements DbCollection {
  private sequence = 0;

  doc(id: string) {
    const store = this.store;
    return {
      get: async (): Promise<DbListResult> => {
        const doc = store.get(id);
        return { data: doc ? [{ _id: id, ...doc } as DbDocument] : [] };
      },
      update: async (patch: Record<string, unknown>) => {
        const doc = store.get(id);
        if (!doc) return { updated: 0 };
        store.set(id, { ...doc, ...patch });
        return { updated: 1 };
      },
      remove: async () => {
        const existed = store.delete(id);
        return { deleted: existed ? 1 : 0 };
      },
    };
  }

  async add(document: Record<string, unknown>): Promise<{ id: string }> {
    const id = `doc_${++this.sequence}`;
    this.store.set(id, { ...document });
    return { id };
  }
}

function createFakeDatabase(seed: Record<string, Array<Record<string, unknown>>> = {}) {
  const collections = new Map<string, Map<string, Record<string, unknown>>>();
  for (const [name, documents] of Object.entries(seed)) {
    const store = new Map<string, Record<string, unknown>>();
    documents.forEach((doc, index) => store.set(doc._id ? String(doc._id) : `${name}_${index}`, doc));
    collections.set(name, store);
  }

  const database: UniCloudDatabase = {
    collection(name: string): DbCollection {
      if (!collections.has(name)) collections.set(name, new Map());
      return new FakeCollection(collections.get(name)!);
    },
  };

  return { database, collections };
}

/* ------------------------------ 用例 ------------------------------ */

const repo = new UnicloudDbBlogRepository();

function publishedArticle(overrides?: Record<string, unknown>): Record<string, unknown> {
  const document: Record<string, unknown> = {
    _id: "a1",
    title: "标题",
    content: "正文",
    category: "技术",
    tags: ["React"],
    publishDate: "2026-08-01",
    summary: "摘要",
    viewCount: 3,
    status: "published",
  };
  return overrides ? Object.assign(document, overrides) : document;
}

afterEach(() => {
  resetUniCloudDatabase();
});

describe("UnicloudDbBlogRepository", () => {
  beforeEach(() => {
    resetUniCloudDatabase();
  });

  it("只返回已发布且有标题的文章，并完成字段归一", async () => {
    const { database } = createFakeDatabase({
      articles: [
        publishedArticle(),
        publishedArticle({ _id: "a2", status: "draft" }),
        publishedArticle({ _id: "a3", title: "" }),
        publishedArticle({ _id: "a4", status: "Published", tags: "React, Node.js", viewCount: "7" }),
      ],
    });
    setUniCloudDatabase(database);

    const articles = await repo.listArticles();
    expect(articles.map((a) => a.id)).toEqual(["a1", "a4"]);

    const normalized = articles.find((a) => a.id === "a4")!;
    // 状态大小写归一
    expect(normalized.status).toBe("published");
    // 控制台手填的逗号分隔字符串 → 数组
    expect(normalized.tags).toEqual(["React", "Node.js"]);
    // 字符串数字 → number
    expect(normalized.viewCount).toBe(7);
  });

  it("非法状态值一律归为草稿（不误发）", async () => {
    const { database } = createFakeDatabase({
      articles: [publishedArticle({ _id: "a1", status: "上线了" })],
    });
    setUniCloudDatabase(database);
    expect(await repo.listArticles()).toHaveLength(0);
  });

  it("翻页拉全量：超过单页上限也不丢数据", async () => {
    const total = PAGE_SIZE * 2 + 50;
    const articles = Array.from({ length: total }, (_, index) =>
      publishedArticle({ _id: `a${index}`, title: `标题 ${index}` }),
    );
    const { database } = createFakeDatabase({ articles });
    setUniCloudDatabase(database);

    expect(await repo.listArticles()).toHaveLength(total);
  });

  it("按 id 取单篇；不存在时返回 null", async () => {
    const { database } = createFakeDatabase({ articles: [publishedArticle()] });
    setUniCloudDatabase(database);

    expect((await repo.getArticle("a1"))?.title).toBe("标题");
    expect(await repo.getArticle("nope")).toBeNull();
    expect(await repo.getArticle("")).toBeNull();
  });

  it("写回正文与阅读数", async () => {
    const { database, collections } = createFakeDatabase({ articles: [publishedArticle()] });
    setUniCloudDatabase(database);

    await repo.updateArticleContent("a1", "新正文");
    await repo.updateArticleViewCount("a1", 42);

    const stored = collections.get("articles")!.get("a1")!;
    expect(stored.content).toBe("新正文");
    expect(stored.viewCount).toBe(42);
  });

  it("提交评论：落库并直接返回新评论", async () => {
    const { database, collections } = createFakeDatabase({ articles: [publishedArticle()] });
    setUniCloudDatabase(database);

    const comment = await repo.createComment({
      articleId: "a1",
      author: "小明",
      email: "m@example.com",
      content: "写得好",
    });

    expect(comment?.id).toBeTruthy();
    expect(comment?.articleId).toBe("a1");
    expect(comment?.createTime).toMatch(/^\d{4}\/\d{2}\/\d{2}$/);
    expect(collections.get("comments")!.size).toBe(1);
  });

  it("按文章过滤评论；不传文章 id 时返回全部", async () => {
    const { database } = createFakeDatabase({
      comments: [
        { _id: "c1", articleId: "a1", author: "A", content: "1", createTime: "2026/01/01" },
        { _id: "c2", articleId: "a2", author: "B", content: "2", createTime: "2026/01/02" },
      ],
    });
    setUniCloudDatabase(database);

    expect((await repo.listComments("a1")).map((c) => c.id)).toEqual(["c1"]);
    expect(await repo.listComments()).toHaveLength(2);
  });

  it("项目按 order 升序，并补齐缺省样式", async () => {
    const { database } = createFakeDatabase({
      projects: [
        { _id: "p1", name: "甲", order: 2 },
        { _id: "p2", name: "乙", order: 1, color: "#000", symbol: "★", status: "wip" },
        { _id: "p3", name: "", order: 0 },
      ],
    });
    setUniCloudDatabase(database);

    const projects = await repo.listProjects();
    expect(projects.map((p) => p.id)).toEqual(["p2", "p1"]);
    expect(projects[1]).toMatchObject({ color: "#4D6BFE", symbol: "📦", status: "live" });
  });

  it("站点配置：缺项回退默认值，skills 支持逗号分隔", async () => {
    const { database } = createFakeDatabase({
      site_config: [
        { _id: "s1", key: "name", value: "敏智" },
        { _id: "s2", key: "skills", value: "React, TypeScript" },
        { _id: "s3", key: "", value: "应被忽略" },
      ],
    });
    setUniCloudDatabase(database);

    const config = await repo.getSiteConfig();
    expect(config.name).toBe("敏智");
    expect(config.skills).toEqual(["React", "TypeScript"]);
    expect(config.role).toBe("FULL-STACK DEVELOPER"); // 未配置 → 默认值
  });

  it("数据库不可用时抛出明确错误，而不是返回空数据", async () => {
    expect(() => resetUniCloudDatabase()).not.toThrow();
    await expect(repo.listArticles()).rejects.toThrow(/uniCloud 运行时不可用/);
  });
});
