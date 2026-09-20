import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getBlogRepository, registerBlogProvider, resetBlogRepository } from "~~/data";
import type { Article, BlogRepository, Comment, Project, SiteConfig } from "~~/data/types";
import {
  getSiteConfig,
  listArticleComments,
  listPublishedArticles,
  registerArticleView,
  submitComment,
} from "./blog-service";

function makeArticle(partial: Partial<Article> & { id: string }): Article {
  return {
    title: "标题",
    content: "正文",
    category: "技术",
    tags: [],
    publishDate: "2026-01-01",
    summary: "摘要",
    viewCount: 0,
    status: "published",
    ...partial,
  };
}

/** 内存假仓储：证明业务层只依赖接口，可脱离 WPS 测试 */
class FakeRepository implements BlogRepository {
  readonly name = "fake";

  constructor(
    private readonly articles: Article[],
    private readonly comments: Comment[] = [],
    private readonly projects: Project[] = [],
  ) {}

  viewWrites: Array<{ id: string; count: number }> = [];
  commentWrites: Comment[] = [];

  async listArticles(): Promise<Article[]> {
    return this.articles;
  }
  async getArticle(id: string): Promise<Article | null> {
    return this.articles.find((a) => a.id === id) ?? null;
  }
  async updateArticleContent(): Promise<boolean> {
    return true;
  }
  async updateArticleViewCount(id: string, count: number): Promise<boolean> {
    this.viewWrites.push({ id, count });
    return true;
  }
  async listComments(articleId?: string): Promise<Comment[]> {
    return articleId ? this.comments.filter((c) => c.articleId === articleId) : this.comments;
  }
  async createComment(input: {
    articleId: string;
    author: string;
    email: string;
    content: string;
  }): Promise<Comment | null> {
    const comment: Comment = { id: `new-${this.commentWrites.length}`, ...input, createTime: "2026-01-01 00:00" };
    this.commentWrites.push(comment);
    return comment;
  }
  async listProjects(): Promise<Project[]> {
    return this.projects;
  }
  async getSiteConfig(): Promise<SiteConfig> {
    return { name: "敏智", email: "<email>" } as SiteConfig;
  }
}

let fake: FakeRepository;

beforeEach(() => {
  fake = new FakeRepository(
    [
      makeArticle({ id: "1", title: "React 19 新特性", category: "技术", tags: ["React"], publishDate: "2026-01-10" }),
      makeArticle({ id: "2", title: "年终总结", category: "生活", tags: ["随笔"], publishDate: "2026-03-05" }),
      makeArticle({ id: "3", title: "TypeScript 实践", category: "技术", tags: ["TypeScript"], publishDate: "2025-12-01" }),
    ],
    [
      { id: "c2", articleId: "1", author: "b", email: "", content: "后发", createTime: "2026-02-02 10:00" },
      { id: "c1", articleId: "1", author: "a", email: "", content: "先发", createTime: "2026-01-01 10:00" },
    ],
  );
  registerBlogProvider("fake", () => fake);
  process.env.BLOG_DATA_PROVIDER = "fake";
  resetBlogRepository();
});

afterEach(() => {
  delete process.env.BLOG_DATA_PROVIDER;
  resetBlogRepository();
});

describe("provider 注册表", () => {
  it("按 BLOG_DATA_PROVIDER 选择实现", () => {
    expect(getBlogRepository()).toBe(fake);
  });

  it("未知数据源给出可用值提示", () => {
    process.env.BLOG_DATA_PROVIDER = "not-exist";
    resetBlogRepository();
    expect(() => getBlogRepository()).toThrow(/未知的数据源.*not-exist/);
  });
});

describe("listPublishedArticles", () => {
  it("按发布时间倒序", async () => {
    const items = await listPublishedArticles();
    expect(items.map((a) => a.id)).toEqual(["2", "1", "3"]);
  });

  it("支持分类 / 标签 / 关键词筛选", async () => {
    expect((await listPublishedArticles({ category: "技术" })).map((a) => a.id)).toEqual(["1", "3"]);
    expect((await listPublishedArticles({ tag: "React" })).map((a) => a.id)).toEqual(["1"]);
    expect((await listPublishedArticles({ keyword: "总结" })).map((a) => a.id)).toEqual(["2"]);
  });

  it("空白筛选参数视为不筛选", async () => {
    expect(await listPublishedArticles({ category: "  ", tag: "", keyword: "   " })).toHaveLength(3);
  });
});

describe("listArticleComments", () => {
  it("按时间正序并只取指定文章", async () => {
    expect((await listArticleComments("1")).map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(await listArticleComments("999")).toEqual([]);
  });
});

describe("submitComment", () => {
  it("清洗首尾空白后写入", async () => {
    const comment = await submitComment({ articleId: "1", author: "  访客 ", email: " a@b.c ", content: "  你好  " });
    expect(comment).toMatchObject({ author: "访客", email: "a@b.c", content: "你好" });
  });

  it("昵称或内容为空时拒绝写入", async () => {
    expect(await submitComment({ articleId: "1", author: "   ", email: "", content: "你好" })).toBeNull();
    expect(await submitComment({ articleId: "1", author: "访客", email: "", content: "  " })).toBeNull();
    expect(fake.commentWrites).toHaveLength(0);
  });

  it("超长内容按上限截断", async () => {
    const comment = await submitComment({ articleId: "1", author: "a", email: "", content: "x".repeat(1200) });
    expect(comment?.content).toHaveLength(1000);
  });
});

describe("registerArticleView", () => {
  it("未传 count 时在当前值上 +1", async () => {
    fake = new FakeRepository([makeArticle({ id: "9", viewCount: 41 })]);
    registerBlogProvider("fake", () => fake);
    resetBlogRepository();

    expect(await registerArticleView("9")).toBe(42);
    expect(fake.viewWrites).toEqual([{ id: "9", count: 42 }]);
  });

  it("传入有效 count 时以其为准", async () => {
    fake = new FakeRepository([makeArticle({ id: "9", viewCount: 41 })]);
    registerBlogProvider("fake", () => fake);
    resetBlogRepository();

    expect(await registerArticleView("9", 100)).toBe(100);
  });

  it("文章不存在且无 count 时返回 null", async () => {
    expect(await registerArticleView("missing")).toBeNull();
  });
});

describe("getSiteConfig", () => {
  it("透传仓储配置", async () => {
    expect(await getSiteConfig()).toMatchObject({ name: "敏智" });
  });
});
