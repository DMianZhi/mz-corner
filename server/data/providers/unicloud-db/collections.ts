/**
 * 云数据库集合约定与语义常量。
 *
 * 集合里存的是**领域文档**（字段名与 BlogRepository 的领域模型一一对应），
 * 不再有「表头中文名 → 领域字段」的映射层——那是多维表时代的产物。
 * 这带来一个直接好处：控制台里看到的数据就是领域模型，排障不用二次翻译。
 */

/** 集合名（与 uniCloud-alipay/database/*.schema.json 一一对应） */
export const COLLECTIONS = {
  articles: "articles",
  comments: "comments",
  projects: "projects",
  siteConfig: "site_config",
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];

/**
 * 单页拉取条数。
 *
 * uniCloud 各家对单次 get 的返回条数上限不一致（100 / 1000 不等），
 * 因此一律用 skip+limit 翻页拉全量，不依赖「一次拉完」。
 */
export const PAGE_SIZE = 100;

/** 各集合一次拉取的硬上限（防跑飞；博客数据量远小于此） */
export const LIMITS = {
  articles: 2000,
  comments: 5000,
  projects: 200,
  siteConfig: 500,
} as const;

/** 文章发布状态（领域语义值，存库即为该值） */
export const ARTICLE_STATUS = {
  published: "published",
  draft: "draft",
} as const;

/** 历史数据兼容：多维表时代的中文状态值 → 领域语义值 */
export const LEGACY_ARTICLE_STATUS: Record<string, string> = {
  已发布: ARTICLE_STATUS.published,
  草稿: ARTICLE_STATUS.draft,
};

/** 项目缺省值（字段留空时的兜底，与具体数据源无关） */
export const PROJECT_DEFAULTS = {
  color: "#4D6BFE",
  symbol: "📦",
  status: "live",
} as const;

/** 站点配置的键名（site_config 集合以 key-value 文档存储） */
export const SITE_CONFIG_KEYS = {
  name: "name",
  nameEn: "name_en",
  role: "role",
  location: "location",
  email: "email",
  bio: "bio",
  skills: "skills",
  github: "github",
  twitter: "twitter",
  footerNote: "footer_note",
} as const;
