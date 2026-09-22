// 管理后台 API 客户端。
//
// 与 blog-api.ts 的差异：
// - 会话携带：优先 x-admin-session 头（跨域部署下浏览器拦截第三方 Cookie，
//   Chrome 逐步淘汰 3P cookie，SameSite=None 也救不了）；同时保留 credentials:
//   'include'（同源部署时 HttpOnly Cookie 仍可无感使用，双通道并存）
// - 错误不静默吞掉：管理操作必须让用户看到失败原因，不能像前台那样降级成空数据
//
// 端点清单（对应 server/routes/api/admin/*）：
// - POST /api/admin/login    { password } → { ok, expiresInSec }
// - POST /api/admin/logout   → 200 { ok: true }（204 在 uniCloud 运行时会炸）
// - GET  /api/admin/session  → { authenticated, expiresAt? }
// - GET  /api/admin/data-export → { articles, comments, projects, site_config }
// - PATCH /api/blog/posts/:id { content }（走 blog 前缀，守卫同源）

const API_ORIGIN = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/+$/, '');
const ADMIN_BASE = API_ORIGIN ? `${API_ORIGIN}/api/admin` : './api/admin';
const POSTS_BASE = API_ORIGIN ? `${API_ORIGIN}/api/blog` : './api/blog';

// 会话令牌：内存优先（刷新即失，XSS 面最小），localStorage 兜底（刷新不掉登录）。
// key 不含敏感信息；令牌本身 7 天过期，泄露可换 ADMIN_PASSWORD 全端作废。
const TOKEN_KEY = 'mz_admin_session_token';
let sessionToken: string | null = null;

function authHeaders(): Record<string, string> {
  if (!sessionToken) sessionToken = localStorage.getItem(TOKEN_KEY);
  return sessionToken ? { 'x-admin-session': sessionToken } : {};
}

function persistToken(token: string | null): void {
  sessionToken = token;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export interface SessionInfo {
  authenticated: boolean;
  /** Unix 秒；未登录时缺省 */
  expiresAt?: number;
}

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 404) {
    throw new Error('管理端未开放（服务端未配置管理口令）');
  }
  if (res.status === 401) {
    const err = new Error('UNAUTHORIZED');
    err.name = 'Unauthorized';
    throw err;
  }
  if (res.status === 429) {
    throw new Error('失败次数过多，请 15 分钟后再试');
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const json = (await res.json()) as { code?: number; msg?: string; data?: T };
  // 后端约定：code 0 = 成功；login/session 端点直接回对象（无 code 包装）
  if (json && typeof json === 'object' && 'code' in json && json.code !== 0) {
    throw new Error(json.msg || '请求失败');
  }
  if (json && typeof json === 'object' && 'data' in json && json.data !== undefined) {
    return json.data;
  }
  return json as T;
}

/** 登录态探测：401/其他错误一律返回未登录（页面据此显示登录表单） */
export async function getSession(): Promise<SessionInfo> {
  try {
    const res = await fetch(`${ADMIN_BASE}/session`, { credentials: 'include', headers: authHeaders() });
    return await parse<SessionInfo>(res);
  } catch {
    return { authenticated: false };
  }
}

export async function login(password: string): Promise<SessionInfo> {
  // text/plain：绕开 uniCloud 网关对 OPTIONS 预检的拦截（同 blog-api.ts JSON_AS_TEXT 的原因）
  const res = await fetch(`${ADMIN_BASE}/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify({ password }),
  });
  const info = await parse<SessionInfo & { token?: string }>(res);
  if (info.token) persistToken(info.token);
  return info;
}

export async function logout(): Promise<void> {
  await fetch(`${ADMIN_BASE}/logout`, { method: 'POST', credentials: 'include', headers: authHeaders() }).catch(() => undefined);
  persistToken(null);
}

export interface DataExport {
  articles: Array<Record<string, unknown>>;
  comments: Array<Record<string, unknown>>;
  projects: Array<Record<string, unknown>>;
  site_config: Array<Record<string, unknown>>;
}

/** 全库导出（seed 同构格式）：编辑前先拉最新，防 replace 把线上新数据刷回旧快照 */
export async function exportData(): Promise<DataExport> {
  const res = await fetch(`${ADMIN_BASE}/data-export`, { credentials: 'include', headers: authHeaders() });
  return parse<DataExport>(res);
}

export interface AdminArticle {
  id: string;
  title: string;
  content: string;
  category: string;
  status: string;
  publishDate: string;
  viewCount: number;
}

/** 管理列表直接复用前台分页接口（pageSize 拉大以覆盖全量，博容量级下无压力） */
export async function listAllArticles(): Promise<AdminArticle[]> {
  const res = await fetch(
    `${POSTS_BASE}/posts?page=1&pageSize=500`,
    { credentials: 'include', headers: { Accept: 'application/json', ...authHeaders() } },
  );
  const json = (await res.json()) as { code: number; data?: { items: AdminArticle[] } };
  if (json.code !== 0 || !json.data) throw new Error('文章列表加载失败');
  return json.data.items;
}

export async function getArticleContent(id: string): Promise<AdminArticle> {
  const res = await fetch(`${POSTS_BASE}/posts/${encodeURIComponent(id)}`, {
    credentials: 'include',
    headers: { Accept: 'application/json', ...authHeaders() },
  });
  const json = (await res.json()) as { code: number; data?: AdminArticle; msg?: string };
  if (json.code !== 0 || !json.data) throw new Error(json.msg || '文章加载失败');
  return json.data;
}

export async function saveArticleContent(id: string, content: string): Promise<void> {
  const res = await fetch(`${POSTS_BASE}/posts/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8', ...authHeaders() },
    body: JSON.stringify({ content }),
  });
  if (res.status === 401) throw new Error('登录已过期，请重新登录');
  const json = (await res.json()) as { code: number; msg?: string };
  if (json.code !== 0) throw new Error(json.msg || '保存失败');
}
