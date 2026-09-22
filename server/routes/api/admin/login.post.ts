import { createError, setResponseStatus, type H3Event } from "h3";
import { readJsonBody } from "~~/utils/body";
import { timingSafeEqual, createHash } from "node:crypto";
import { signSession, SESSION_TTL_SEC } from "~~/utils/session";
import { setSessionCookie, SESSION_COOKIE_NAME } from "~~/utils/session-cookie";
import { sessionSecret } from "~~/utils/admin-auth";
import { createLoginThrottle } from "~~/utils/login-throttle";

/**
 * POST /api/admin/login —— 口令换会话（HMAC-SHA256 JWT，HttpOnly Cookie）。
 *
 * 安全设计：
 * - 口令恒时比较（sha256 定长摘要 + timingSafeEqual）：耗时与输入无关，
 *   不泄露长度/前缀
 * - 防爆破：createLoginThrottle 同 IP 5 连败锁 15 分钟，成功即清零
 * - 会话 Cookie：HttpOnly（JS 不可读，XSS 偷不走）+ SameSite=Strict
 *   （跨站请求不带 Cookie，CSRF 免疫）+ Secure（仅 HTTPS）
 * - 未配置 ADMIN_PASSWORD → 404：端点隐藏，与守卫 hidden 语义一致
 */
const throttle = createLoginThrottle();

export default defineEventHandler(async (event: H3Event) => {
  const password = (process.env.ADMIN_PASSWORD || "").trim();

  // 未配置管理口令：管理后台整体关闭（隐藏而非 403，不暴露端点存在性）
  if (!password) {
    throw createError({ statusCode: 404, statusMessage: "Not Found" });
  }

  // readJsonBody（非 readBody）：前端为绕开网关 OPTIONS 预检用 text/plain 发 JSON，
  // h3 原生 readBody 对 text/plain 不做 JSON 解析，会拿到字符串导致口令恒为空
  const body = await readJsonBody<{ password?: string }>(event).catch(() => undefined);
  const provided = typeof body?.password === "string" ? body.password : "";
  const ip =
    getRequestIP(event, { xForwardedFor: true }) ||
    getHeader(event, "x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";

  if (throttle.isLocked(ip)) {
    throw createError({ statusCode: 429, statusMessage: "too many failed logins; retry later" });
  }

  const fp = (v: string) => createHash("sha256").update(v, "utf8").digest();
  const ok = timingSafeEqual(fp(provided), fp(password));

  if (!ok) {
    throttle.registerFailure(ip);
    throw createError({ statusCode: 401, statusMessage: "invalid password" });
  }

  throttle.registerSuccess(ip);
  const secret = sessionSecret();
  // 密钥为空 ⇔ ADMIN_PASSWORD 未配置（已在上方 404 拦截），这里仅防御性断言
  if (!secret) {
    throw createError({ statusCode: 500, statusMessage: "session secret unavailable" });
  }

  const token = signSession("admin", secret);
  setSessionCookie(event, token);
  setResponseStatus(event, 200);
  // token 同时随响应体返回：跨域部署下浏览器拦截第三方 Cookie（Chrome 逐步淘汰 3P cookie），
  // 前端改用 x-admin-session 头携带会话（守卫三通道的第一通道，优先级高于 Cookie）。
  // Cookie 保留：同源部署（云函数域名下）仍可无感使用。
  return { ok: true, token, expiresInSec: SESSION_TTL_SEC };
});
