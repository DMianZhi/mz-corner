import type { H3Event } from "h3";
import { readSession } from "~~/utils/session-cookie";
import { readSessionToken, sessionSecret } from "~~/utils/admin-auth";
import { verifySession } from "~~/utils/session";

/**
 * GET /api/admin/session —— 前端登录态探测。
 *
 * 返回 200 {authenticated:true, expiresAt} 或 401（未登录/过期）。
 * 前端据此决定渲染登录页还是管理面板；不做任何写操作，无需防爆破。
 */
export default defineEventHandler((event: H3Event) => {
  // 双通道：x-admin-session 头（跨域部署主通道，浏览器拦 3P cookie）优先，
  // Cookie（同源部署）兜底 —— 与守卫 resolveAdminAuth 的通道顺序一致
  const token = readSessionToken(event);
  const session = token ? verifySession(token, sessionSecret()) : readSession(event);
  if (!session) {
    setResponseStatus(event, 401);
    return { authenticated: false };
  }
  return { authenticated: true, expiresAt: session.exp };
});
