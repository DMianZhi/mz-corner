import type { H3Event } from "h3";
import { clearSessionCookie } from "~~/utils/session-cookie";

/**
 * POST /api/admin/logout —— 注销：清会话 Cookie。
 *
 * 无状态 JWT 的固有限制：服务端无法让一个未过期的令牌「作废」（令牌在自己
 * 有效期内仍可被持有者使用——前提是能把令牌塞进请求；浏览器端 Cookie 已随
 * 本响应清除，HttpOnly 又让 XSS 读不到，实际风险面可忽略）。
 * 真要全局吊销：换 SESSION_SECRET 或改 ADMIN_PASSWORD，全端立即下线。
 */
export default defineEventHandler((event: H3Event) => {
  clearSessionCookie(event);
  setResponseStatus(event, 204);
  return null;
});
