// 管理后台 API 客户端。
//
// 与 blog-api.ts 的差异：
// - 会话携带：x-admin-session 头（跨域部署下浏览器拦截第三方 Cookie，
//   Chrome 逐步淘汰 3P cookie，SameSite=None 也救不了）。
//   **不带 credentials**：uniCloud 网关劫持 OPTIONS 预检并回 Allow-Headers:*，
//   该通配符仅在无凭据请求中合法（CORS 规范）；带 credentials 会被浏览器拒发。
//   同源部署时 Cookie 通道仍由服务端保留（curl/脚本可用），前端统一走 token 头
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
    // 服务端用 createError 报错，statusMessage 里才是真正有用的中文原因
    // （如「标题不能为空」）；吞掉它只剩 HTTP 400 会让用户无从下手
    const detail = (await res.json().catch(() => null)) as {
      statusMessage?: string;
      message?: string;
      msg?: string;
    } | null;
    throw new Error(detail?.statusMessage || detail?.message || detail?.msg || `HTTP ${res.status}`);
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
    const res = await fetchWithRetry(`${ADMIN_BASE}/session`, { headers: authHeaders() });
    return await parse<SessionInfo>(res);
  } catch {
    return { authenticated: false };
  }
}

export async function login(password: string): Promise<SessionInfo> {
  // text/plain：绕开 uniCloud 网关对 OPTIONS 预检的拦截（同 blog-api.ts JSON_AS_TEXT 的原因）
  const res = await fetch(`${ADMIN_BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify({ password }),
  });
  // 服务端契约是 { ok, token, expiresInSec }，**没有** code/data 包装，
  // 也没有 authenticated 字段。这里统一归一化成 SessionInfo，
  // 否则调用方按 info.authenticated 判断会永远为假（登录成功却报「口令不正确」）。
  const raw = await parse<{ token?: string; expiresInSec?: number; authenticated?: boolean }>(res);
  if (raw.token) persistToken(raw.token);
  return {
    authenticated: Boolean(raw.token) || Boolean(raw.authenticated),
    expiresAt: raw.expiresInSec ? Math.floor(Date.now() / 1000) + raw.expiresInSec : undefined,
  };
}

export async function logout(): Promise<void> {
  await fetch(`${ADMIN_BASE}/logout`, { method: 'POST', headers: authHeaders() }).catch(() => undefined);
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
  const res = await fetchWithRetry(`${ADMIN_BASE}/data-export`, { headers: authHeaders() });
  return parse<DataExport>(res);
}


// ── 通用内容 API ─────────────────────────────────────────────
// 四类内容（文章 / 项目 / 评论 / 站点设置）共用一套端点，字段白名单在服务端
// （server/utils/content-schema.ts）。前端表单由 GET /content 返回的元数据驱动，
// 这里因此不硬编码字段清单——服务端加了字段，后台表单自动出现。

export type FieldType = 'string' | 'text' | 'number' | 'string[]' | 'enum';

export interface ContentField {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  max?: number;
  itemMax?: number;
  enumValues?: string[];
  hint?: string;
}

export interface ContentCollectionMeta {
  name: string;
  label: string;
  fields: ContentField[];
}

/** 集合内的原始文档（含 _id；其余字段随集合而异，故用索引签名） */
export interface ContentDocument {
  _id: string;
  [field: string]: unknown;
}

/**
 * 冷启动/网关抖动兜底：首屏并发打四五个请求，线上实测偶发其中一个回 404
 * （服务端「管理端未配置」的 404 刻意与「路径不存在」不可区分，无从按报文甄别）。
 * GET 幂等，故统一重试一次；写操作不重试，避免重复提交。
 */
async function fetchWithRetry(url: string, init?: RequestInit): Promise<Response> {
  const method = String((init && init.method) || 'GET').toUpperCase();
  const send = () => fetch(url, init);
  const res = await send();
  if (method !== 'GET' || (res.status !== 404 && res.status < 500)) return res;
  await new Promise((resolve) => setTimeout(resolve, 400));
  return send();
}

async function adminRequest(path: string, init: RequestInit = {}): Promise<Response> {
  return fetchWithRetry(`${ADMIN_BASE}${path}`, {
    ...init,
    headers: { ...(init.headers as Record<string, string> | undefined), ...authHeaders() },
  });
}

// 写操作统一用 text/plain 发 JSON：绕开网关对 OPTIONS 预检的劫持（原因见文件头注释）
const JSON_TEXT_HEADERS = { 'Content-Type': 'text/plain;charset=UTF-8' };

export async function fetchContentSchema(): Promise<ContentCollectionMeta[]> {
  const data = await parse<{ collections: ContentCollectionMeta[] }>(await adminRequest('/content'));
  return data.collections;
}

export async function listContent(collection: string): Promise<ContentDocument[]> {
  const path = `/content/${encodeURIComponent(collection)}`;
  const data = await parse<{ items: ContentDocument[] }>(await adminRequest(path));
  return data.items;
}

export async function createContent(
  collection: string,
  fields: Record<string, unknown>,
): Promise<string> {
  const res = await adminRequest(`/content/${encodeURIComponent(collection)}`, {
    method: 'POST',
    headers: JSON_TEXT_HEADERS,
    body: JSON.stringify(fields),
  });
  const data = await parse<{ id: string }>(res);
  return data.id;
}

export async function updateContent(
  collection: string,
  id: string,
  fields: Record<string, unknown>,
): Promise<void> {
  const path = `/content/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`;
  await parse(
    await adminRequest(path, {
      method: 'PATCH',
      headers: JSON_TEXT_HEADERS,
      body: JSON.stringify(fields),
    }),
  );
}

export async function deleteContent(collection: string, id: string): Promise<number> {
  // 走 POST 而非 DELETE：网关 CORS 方法表固定，DELETE 未经验证（见 admin-api 文件头）
  const path = `/content/${encodeURIComponent(collection)}/${encodeURIComponent(id)}/delete`;
  const data = await parse<{ deleted: number }>(await adminRequest(path, { method: 'POST' }));
  return data.deleted ?? 0;
}

/** 集合级批量更新：站点设置这类「一组 key-value 文档」一次请求存完 */
export async function bulkUpdateContent(
  collection: string,
  items: Array<Record<string, unknown> & { _id: string }>,
): Promise<number> {
  const res = await adminRequest(`/content/${encodeURIComponent(collection)}`, {
    method: 'PATCH',
    headers: JSON_TEXT_HEADERS,
    body: JSON.stringify({ items }),
  });
  const data = await parse<{ updated: number }>(res);
  return data.updated ?? 0;
}
