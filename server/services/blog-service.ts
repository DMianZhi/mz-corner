/**
 * 博客业务逻辑层。
 *
 * 依赖 BlogRepository 抽象而非具体服务商；筛选、排序、字段清洗等业务规则集中在这里，
 * 路由层只负责 HTTP 语义（参数校验、状态码）。
 */
import { getBlogRepository } from "~~/data";
import type { Article, Comment, NewComment, Project, SiteConfig } from "~~/data/types";

export interface ArticleQuery {
  category?: string;
  tag?: string;
  keyword?: string;
}

/** 评论输入长度上限 */
const COMMENT_LIMITS = {
  author: 50,
  email: 100,
  content: 1000,
} as const;

/** 发布状态的文章，按发布时间倒序 */
export async function listPublishedArticles(query: ArticleQuery = {}): Promise<Article[]> {
  const articles = await getBlogRepository().listArticles();
  const category = query.category?.trim() ?? "";
  const tag = query.tag?.trim() ?? "";
  const keyword = query.keyword?.trim() ?? "";

  const filtered = articles.filter((article) => {
    if (category && article.category !== category) return false;
    if (tag && !article.tags.includes(tag)) return false;
    if (keyword && !article.title.includes(keyword) && !article.summary.includes(keyword)) return false;
    return true;
  });

  return filtered.sort((a, b) => toTime(b.publishDate) - toTime(a.publishDate));
}

export async function getArticleById(id: string): Promise<Article | null> {
  return getBlogRepository().getArticle(id);
}

export async function updateArticleContent(id: string, content: string): Promise<boolean> {
  return getBlogRepository().updateArticleContent(id, content);
}

/** 某篇文章的评论，按时间正序 */
export async function listArticleComments(articleId: string): Promise<Comment[]> {
  const comments = await getBlogRepository().listComments(articleId);
  return comments.sort((a, b) => toTime(a.createTime) - toTime(b.createTime));
}

/** 提交评论：清洗输入后写入 */
export async function submitComment(input: NewComment): Promise<Comment | null> {
  const author = input.author.trim().slice(0, COMMENT_LIMITS.author);
  const content = input.content.trim().slice(0, COMMENT_LIMITS.content);
  const email = input.email.trim().slice(0, COMMENT_LIMITS.email);
  if (!author || !content) return null;

  return getBlogRepository().createComment({ articleId: input.articleId, author, email, content });
}

/**
 * 阅读数 +1 并写回。
 * 传入有效的显式 count 时以其为准，否则在当前值上 +1。
 * 返回 null 表示未能确定新的阅读数（文章不存在，或调用方无需关心）。
 */
export async function registerArticleView(id: string, explicitCount?: number): Promise<number | null> {
  const repository = getBlogRepository();
  const article = await repository.getArticle(id);
  if (!article) return null;

  const hasExplicit = Number.isFinite(explicitCount) && (explicitCount as number) > 0;
  const next = hasExplicit ? (explicitCount as number) : article.viewCount + 1;
  if (!next) return null;

  await repository.updateArticleViewCount(id, next);
  return next;
}

export async function listProjects(): Promise<Project[]> {
  return getBlogRepository().listProjects();
}

export async function getSiteConfig(): Promise<SiteConfig> {
  return getBlogRepository().getSiteConfig();
}

/** 日期字符串 → 时间戳（兼容 YYYY/MM/DD 与 YYYY-MM-DD），无法解析时为 0 */
function toTime(value: string): number {
  if (!value) return 0;
  const normalized = value.replace(/-/g, "/");
  return new Date(normalized).getTime() || 0;
}
