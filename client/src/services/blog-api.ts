import type { Article, Comment, ArticleListItem, PaginatedData, ArchiveData, Project, SiteConfig } from '@/types/blog';

// 通过 Nitro 后端 /api/blog/* 访问博客数据（后端查 uniCloud 云数据库）
// 同源部署（单进程 / Nginx 反代）留空即可；静态托管 + 云函数分离时用 VITE_API_BASE 指向函数地址
const API_ORIGIN = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/+$/, '');
const BASE = API_ORIGIN ? `${API_ORIGIN}/api/blog` : './api/blog';

async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.code !== 0) throw new Error(json.message || '请求失败');
  return json.data as T;
}

const toTs = (d: string): number => {
  const t = new Date(d.replace(/-/g, '/')).getTime();
  return Number.isNaN(t) ? 0 : t;
};

// 获取文章列表（后端已完成解析、筛选、排序、分页）
export async function getArticles(options?: {
  category?: string;
  tag?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}): Promise<PaginatedData<ArticleListItem>> {
  const { category, tag, keyword, page = 1, pageSize = 10 } = options || {};
  const qs = new URLSearchParams();
  if (category) qs.set('category', category);
  if (tag) qs.set('tag', tag);
  if (keyword) qs.set('keyword', keyword);
  qs.set('page', String(page));
  qs.set('pageSize', String(pageSize));
  try {
    return await apiGet<PaginatedData<ArticleListItem>>(`${BASE}/posts?${qs.toString()}`);
  } catch (e) {
    console.error('获取文章列表失败:', e);
    return { items: [], total: 0, page, pageSize, totalPages: 0 };
  }
}

// 获取文章详情
export async function getArticle(id: string): Promise<Article | null> {
  try {
    return await apiGet<Article>(`${BASE}/posts/${encodeURIComponent(id)}`);
  } catch (e) {
    console.error('获取文章详情失败:', e);
    return null;
  }
}

// 获取文章评论
export async function getComments(articleId: string): Promise<Comment[]> {
  try {
    return await apiGet<Comment[]>(`${BASE}/posts/${encodeURIComponent(articleId)}/comments`);
  } catch (e) {
    console.error('获取评论失败:', e);
    return [];
  }
}

// 获取归档数据（按年 → 月分组）
export async function getArchiveData(): Promise<ArchiveData[]> {
  const { items } = await getArticles({ page: 1, pageSize: 1000 });
  const yearMap = new Map<number, Map<number, ArticleListItem[]>>();
  for (const a of items) {
    const d = new Date(a.publishDate);
    if (Number.isNaN(d.getTime())) continue;
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    if (!yearMap.has(y)) yearMap.set(y, new Map());
    const months = yearMap.get(y)!;
    if (!months.has(m)) months.set(m, []);
    months.get(m)!.push(a);
  }
  return [...yearMap.entries()]
    .sort((x, y) => y[0] - x[0])
    .map(([year, months]) => ({
      year,
      months: [...months.entries()]
        .sort((x, y) => y[0] - x[0])
        .map(([month, articles]) => ({ month, articles })),
    }));
}

// 增加阅读数（尽力而为，失败不影响页面）
export async function incrementViewCount(id: string, currentCount: number): Promise<void> {
  try {
    await fetch(`${BASE}/posts/${encodeURIComponent(id)}/view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count: currentCount + 1 }),
    });
  } catch {
    /* 静默失败 */
  }
}

// 提交新评论
export async function addComment(input: {
  articleId: string;
  author: string;
  email: string;
  content: string;
}): Promise<Comment | null> {
  try {
    const res = await fetch(
      `${BASE}/posts/${encodeURIComponent(input.articleId)}/comments`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author: input.author,
          email: input.email,
          content: input.content,
        }),
      },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.code !== 0) throw new Error(json.message || '提交失败');
    return json.data as Comment;
  } catch (e) {
    console.error('提交评论失败:', e);
    return null;
  }
}

// 获取分类统计（基于全量文章聚合）
export async function getCategoryStats(): Promise<{ name: string; count: number }[]> {
  const { items } = await getArticles({ page: 1, pageSize: 1000 });
  const map = new Map<string, number>();
  for (const a of items) map.set(a.category, (map.get(a.category) || 0) + 1);
  return [...map.entries()].map(([name, count]) => ({ name, count })).sort((x, y) => y.count - x.count);
}

// 获取标签统计（基于全量文章聚合）
export async function getTagStats(): Promise<{ name: string; count: number }[]> {
  const { items } = await getArticles({ page: 1, pageSize: 1000 });
  const map = new Map<string, number>();
  for (const a of items) for (const t of a.tags) map.set(t, (map.get(t) || 0) + 1);
  return [...map.entries()].map(([name, count]) => ({ name, count })).sort((x, y) => y.count - x.count);
}

// 获取项目列表（项目导向首页的核心数据）
export async function getProjects(): Promise<Project[]> {
  try {
    const data = await apiGet<{ items: Project[] }>(`${BASE}/projects`);
    return data.items || [];
  } catch (e) {
    console.error('获取项目列表失败:', e);
    return [];
  }
}

export { toTs };

/** 站点配置（site_config 集合动态管理） */
export async function getSiteConfig(): Promise<SiteConfig> {
  return apiGet<SiteConfig>(`${BASE}/config`);
}
