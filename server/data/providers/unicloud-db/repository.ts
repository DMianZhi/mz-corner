/**
 * uniCloud 云数据库仓储：BlogRepository 的云数据库实现。
 *
 * 只负责「查数据 + 映射成领域模型 + 写回」，不含筛选/排序等业务规则（那些在 service 层）。
 */
import type {
  Article,
  BlogRepository,
  Comment,
  NewComment,
  Project,
  SiteConfig,
} from "~~/data/types";
import { DEFAULT_SITE_CONFIG } from "~~/data/types";
import { getDatabase } from "./client";
import { fetchAll } from "./admin";
import { ARTICLE_STATUS, COLLECTIONS, LIMITS, SITE_CONFIG_KEYS } from "./collections";
import { toArticle, toComment, toConfigMap, toProject } from "./mappers";

export class UnicloudDbBlogRepository implements BlogRepository {
  readonly name = "unicloud-db";

  async listArticles(): Promise<Article[]> {
    // 刻意不在查询条件里写 status：状态归一（大小写、非法值兜底）发生在 mappers，
    // 若把过滤放在 DB 层，库里写法稍有出入的文档会因条件不匹配而整批消失。
    // 博客量级下多读几篇草稿的代价可以忽略，换的是「内容不会莫名不见」。
    const documents = await fetchAll(
      getDatabase().collection(COLLECTIONS.articles),
      {},
      LIMITS.articles,
    );
    return documents
      .map(toArticle)
      .filter((article) => article.title && article.status === ARTICLE_STATUS.published);
  }

  async getArticle(id: string): Promise<Article | null> {
    if (!id) return null;
    const { data } = await getDatabase().collection(COLLECTIONS.articles).doc(id).get();
    const document = Array.isArray(data) ? data[0] : undefined;
    return document ? toArticle(document) : null;
  }

  /**
   * 写回正文。
   * 返回 true 表示「请求已发出且未报错」——云数据库的 updated 计数在「值未变化」时
   * 也可能为 0，用它判断成功会产生假失败，因此这里不据其判定。
   */
  async updateArticleContent(id: string, content: string): Promise<boolean> {
    await getDatabase().collection(COLLECTIONS.articles).doc(id).update({ content });
    return true;
  }

  async updateArticleViewCount(id: string, count: number): Promise<boolean> {
    await getDatabase().collection(COLLECTIONS.articles).doc(id).update({ viewCount: count });
    return true;
  }

  async listComments(articleId?: string): Promise<Comment[]> {
    const condition = articleId ? { articleId } : {};
    const documents = await fetchAll(
      getDatabase().collection(COLLECTIONS.comments),
      condition,
      LIMITS.comments,
    );
    return documents.map(toComment);
  }

  async createComment(input: NewComment): Promise<Comment | null> {
    const createTime = today();
    const payload = {
      articleId: input.articleId,
      author: input.author,
      email: input.email,
      content: input.content,
      createTime,
    };
    const { id } = await getDatabase().collection(COLLECTIONS.comments).add(payload);
    if (!id) return null;
    // 直接回构造结果，不回头再查一次：省一次往返，也避开读己之写的一致性问题
    return { id, ...payload };
  }

  async listProjects(): Promise<Project[]> {
    const documents = await fetchAll(
      getDatabase().collection(COLLECTIONS.projects),
      {},
      LIMITS.projects,
    );
    return documents
      .map(toProject)
      .filter((project) => project.name)
      .sort((a, b) => a.order - b.order);
  }

  async getSiteConfig(): Promise<SiteConfig> {
    const documents = await fetchAll(
      getDatabase().collection(COLLECTIONS.siteConfig),
      {},
      LIMITS.siteConfig,
    );
    const kv = toConfigMap(documents);
    const skills = (kv.get(SITE_CONFIG_KEYS.skills) || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    return {
      name: kv.get(SITE_CONFIG_KEYS.name) || DEFAULT_SITE_CONFIG.name,
      nameEn: kv.get(SITE_CONFIG_KEYS.nameEn) || DEFAULT_SITE_CONFIG.nameEn,
      role: kv.get(SITE_CONFIG_KEYS.role) || DEFAULT_SITE_CONFIG.role,
      location: kv.get(SITE_CONFIG_KEYS.location) || DEFAULT_SITE_CONFIG.location,
      email: kv.get(SITE_CONFIG_KEYS.email) || DEFAULT_SITE_CONFIG.email,
      bio: kv.get(SITE_CONFIG_KEYS.bio) || DEFAULT_SITE_CONFIG.bio,
      skills: skills.length ? skills : DEFAULT_SITE_CONFIG.skills,
      github: kv.get(SITE_CONFIG_KEYS.github) || "",
      twitter: kv.get(SITE_CONFIG_KEYS.twitter) || "",
      footerNote: kv.get(SITE_CONFIG_KEYS.footerNote) || DEFAULT_SITE_CONFIG.footerNote,
    };
  }
}

/** 今天日期，格式 YYYY/MM/DD（与历史数据保持一致，前端解析用 / 分隔更稳） */
function today(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}/${pad(now.getMonth() + 1)}/${pad(now.getDate())}`;
}
