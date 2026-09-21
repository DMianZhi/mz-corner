import type { H3Event } from "h3";
import { readSession } from "~~/utils/session-cookie";

/**
 * GET /api/admin/session —— 前端登录态探测。
 *
 * 返回 200 {authenticated:true, expiresAt} 或 401（未登录/过期）。
 * 前端据此决定渲染登录页还是管理面板；不做任何写操作，无需防爆破。
 */
export default defineEventHandler((event: H3Event) => {
  const session = readSession(event);
  if (!session) {
    setResponseStatus(event, 401);
    return { authenticated: false };
  }
  return { authenticated: true, expiresAt: session.exp };
});
