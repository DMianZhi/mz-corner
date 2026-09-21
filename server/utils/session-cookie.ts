import { createError, getCookie, type H3Event } from "h3";
import { SESSION_COOKIE_NAME, SESSION_TTL_SEC, verifySession } from "./session";

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

/** maxAge 超过浏览器上限（400 天）会被 Chrome 拒绝 —— 7 天远小于上限，直接用 */
export function setSessionCookie(event: H3Event, token: string): void {
  setCookie(event, SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "strict",
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
  const secret = process.env.SESSION_SECRET || "";
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
