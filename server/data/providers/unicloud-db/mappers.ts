/**
 * 云数据库文档 → 领域模型的映射。
 *
 * 字段名一一对应，这里只做「类型归一 + 缺省值兜底」，不含业务规则（业务规则在 service 层）。
 * 归一必须做：数据库是 schemaless 的，控制台手改、历史导入都可能塞进非预期类型。
 */
import type { Article, ArticleStatus, Comment, Project } from "~~/data/types";
import { ARTICLE_STATUS, LEGACY_ARTICLE_STATUS, PROJECT_DEFAULTS } from "./collections";
import type { DbDocument } from "./client";

function str(value: unknown): string {
  return value === undefined || value === null ? "" : String(value);
}

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** 数组字段：兼容「真数组」与「逗号分隔字符串」两种历史形态 */
function list(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => str(item).trim()).filter(Boolean);
  return str(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/** 状态归一：非法值一律归为草稿（宁可不上线，也不误发） */
export function toArticleStatus(value: unknown): ArticleStatus {
  const raw = str(value).trim();
  const mapped = LEGACY_ARTICLE_STATUS[raw] ?? raw.toLowerCase();
  return mapped === ARTICLE_STATUS.published ? "published" : "draft";
}

export function toArticle(document: DbDocument): Article {
  return {
    id: document._id,
    title: str(document.title),
    content: str(document.content),
    category: str(document.category) || "未分类",
    tags: list(document.tags),
    publishDate: str(document.publishDate),
    summary: str(document.summary),
    viewCount: num(document.viewCount),
    status: toArticleStatus(document.status),
  };
}

export function toComment(document: DbDocument): Comment {
  return {
    id: document._id,
    articleId: str(document.articleId),
    author: str(document.author) || "匿名",
    email: str(document.email),
    content: str(document.content),
    createTime: str(document.createTime),
  };
}

export function toProject(document: DbDocument): Project {
  return {
    id: document._id,
    name: str(document.name),
    tagline: str(document.tagline),
    description: str(document.description),
    tech: list(document.tech),
    link: str(document.link),
    color: str(document.color) || PROJECT_DEFAULTS.color,
    symbol: str(document.symbol) || PROJECT_DEFAULTS.symbol,
    order: num(document.order),
    status: str(document.status) || PROJECT_DEFAULTS.status,
  };
}

/** site_config 集合（key-value 文档）→ Map */
export function toConfigMap(documents: DbDocument[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const document of documents) {
    const key = str(document.key).trim();
    if (!key) continue;
    map.set(key, str(document.value).trim());
  }
  return map;
}
