/**
 * 领域模型与仓储契约（与具体服务商无关）。
 *
 * 这一层是整个数据访问的边界：上层（service / route）只认这里的类型和接口，
 * 不认识 WPS 多维表、字段中文名、CLI 或任何具体实现。
 * 更换数据源 = 新写一个实现 BlogRepository 的 provider，无需改动上层。
 */

/**
 * 文章发布状态。
 *
 * 领域语义值即存库值（published / draft），不再沿用多维表时代的「已发布 / 草稿」——
 * 读取时会做一次兼容归一（见 providers/unicloud-db/mappers.ts），因此历史数据不会丢。
 */
export type ArticleStatus = "published" | "draft";

export interface Article {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  publishDate: string;
  summary: string;
  viewCount: number;
  status: ArticleStatus;
}

export interface Comment {
  id: string;
  articleId: string;
  author: string;
  email: string;
  content: string;
  createTime: string;
}

export interface Project {
  id: string;
  name: string;
  tagline: string;
  description: string;
  tech: string[];
  link: string;
  color: string;
  symbol: string;
  order: number;
  status: string;
}

export interface SiteConfig {
  name: string;
  nameEn: string;
  role: string;
  location: string;
  email: string;
  bio: string;
  skills: string[];
  github: string;
  twitter: string;
  footerNote: string;
}

export interface NewComment {
  articleId: string;
  author: string;
  email: string;
  content: string;
}

/**
 * 博客数据仓储契约。
 *
 * 所有方法都应返回领域模型（不含服务商字段），失败时抛错由上层决定降级策略。
 */
export interface BlogRepository {
  /** provider 标识，用于日志与诊断 */
  readonly name: string;

  listArticles(): Promise<Article[]>;
  getArticle(id: string): Promise<Article | null>;
  updateArticleContent(id: string, content: string): Promise<boolean>;
  updateArticleViewCount(id: string, count: number): Promise<boolean>;

  listComments(articleId?: string): Promise<Comment[]>;
  createComment(input: NewComment): Promise<Comment | null>;

  listProjects(): Promise<Project[]>;

  getSiteConfig(): Promise<SiteConfig>;
}

/** 站点配置缺项时的兜底值（与具体服务商无关，放在领域层） */
export const DEFAULT_SITE_CONFIG: SiteConfig = {
  name: "敏智",
  nameEn: "MIN ZHI",
  role: "FULL-STACK DEVELOPER",
  location: "31.23°N, 121.47°E — SHANGHAI",
  email: "minzhi@example.com",
  bio: "我是敏智，一名全栈开发者。喜欢把想法变成能跑的产品，关注前端体验与工程效率。这个网站既是我的项目陈列室，也是我写字的地方。",
  skills: ["React", "TypeScript", "Node.js", "Nitro", "Tailwind", "Go"],
  github: "",
  twitter: "",
  footerNote: "DESIGNED & BUILT BY MIN ZHI",
};
