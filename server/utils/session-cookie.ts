import { createError, getCookie, setCookie, deleteCookie, type H3Event } from "h3";
import { SESSION_COOKIE_NAME, SESSION_TTL_SEC, verifySession } from "./session";
import { sessionSecret } from "./admin-auth";

export { SESSION_COOKIE_NAME };

/**
 * 管理端 Cookie 会话（h3 事件层）：读、设、清、验。
 *
 * Cookie 语义（所有管理路由共用，别在路由里各写各的）：
 * - HttpOnly：JS 不可读，XSS 偷不走会话
 * - SameSite=Strict：跨站请求不携带 —— 管理页与 API 同源（云函数 publicAssets
 *   伺服 SPA），Strict 不会误伤站内跳转，同时免疫 CSRF
 * - Secure：仅 HTTPS 传输
 * - Path=/：整个云函数域内有效（管理页 / 与 API /api/admin/* 同域）
 *
 * verify 用到 nowSec 默认时钟；harness 测试可注入室温时钟（见各路由）。
 */

/**
 * maxAge 超过浏览器上限（400 天）会被 Chrome 拒绝 —— 7 天远小于上限，直接用。
 *
 * sameSite 取值说明（跨域部署后必须 None）：
 * - SPA 与 API 同源（云函数域名下）：Strict 最严，免疫 CSRF。
 * - SPA 在静态托管域名、API 在云函数域名（跨站）：Strict/None 之外的值都会导致
 *   浏览器在跨站请求中**不携带 Cookie**（登录 200 但会话探测永远 false）。
 *   必须 SameSite=None + Secure（Chrome 强制 None 必须配 Secure，云函数是 HTTPS 满足）。
 * - CSRF 防护不依赖 SameSite，改由「仅接受 JSON POST + 无表单可自动携带的凭据」承担：
 *   Cookie 虽会被跨站请求携带，但攻击页无法读取响应（CORS），也无法构造出
 *   能通过服务端解析的 JSON body（form 提交只能发 urlencoded/multipart）。
 */
export function setSessionCookie(event: H3Event, token: string): void {
  setCookie(event, SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "none",
    secure: true,
    path: "/",
    maxAge: SESSION_TTL_SEC,
  });
}

export function clearSessionCookie(event: H3Event): void {
  deleteCookie(event, SESSION_COOKIE_NAME, { path: "/" });
}

/** 读取并校验会话 Cookie；有效返回 payload，无效/缺失返回 null（不抛错） */
export function readSession(event: H3Event): { sub: string; iat: number; exp: number } | null {
  // 与 login 签发侧同源：sessionSecret()（SESSION_SECRET 优先，缺省派生自 ADMIN_PASSWORD）。
  // 不能各自读环境变量——签发侧有 fallback、校验侧没有，会导致「登录成功但探测 401」。
  const secret = sessionSecret();
  if (!secret) return null;
  const token = getCookie(event, SESSION_COOKIE_NAME) || "";
  if (!token) return null;
  return verifySession(token, secret);
}

/**
 * 管理路由守卫：先试 Cookie 会话（浏览器后台用），再试旧令牌头（脚本/本地 curl 用）。
 * 双通道语义与 requireAdminToken 保持一致：
 * - 无 SESSION_SECRET 且无 SEED_TOKEN → 404（端点隐藏）
 * - 会话无效且无有效令牌头 → 403
 */
export function requireAdminSession(event: H3Event): void {
  if (readSession(event)) return;
  requireAdminToken(event);
}
