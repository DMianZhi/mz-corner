import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * 自签 HMAC-SHA256 会话令牌（JWT 紧凑格式，零依赖）。
 *
 * 为什么不用 jsonwebtoken 包：云函数产物要自包含（externals.inline 陷阱，
 * 见 nitro.config.ts 注释），能用 node:crypto 就不引第三方。
 *
 * 令牌结构：b64url(header).b64url(payload).b64url(hmacSha256(header + "." + payload))
 * - header 固定 {"alg":"HS256","typ":"JWT"}，校验时不读请求侧 header——
 *   「alg: none」类攻击的前提是信任请求里的 header，这里根本没有这个入口
 * - payload 只含 sub（管理员标识）/ iat（签发秒）/ exp（过期秒）
 * - 签名比较走「sha256 后常量时间比较」，与 admin-auth.ts 同一模式：
 *   timingSafeEqual 要求等长输入，定长哈希既满足它，也让比较耗时与
 *   输入长度/内容无关，不泄露签名信息
 */

export interface SessionPayload {
  /** 主题：管理员标识（固定 "admin"） */
  sub: string;
  /** 签发时间（秒） */
  iat: number;
  /** 过期时间（秒） */
  exp: number;
}

/** 会话时长（秒）：7 天 */
export const SESSION_TTL_SEC = 7 * 24 * 60 * 60;

/** 管理端会话 Cookie 名（HttpOnly，JS 不可读；session-cookie.ts 按此读写） */
export const SESSION_COOKIE_NAME = "mz_admin_session";

/** 时钟漂移容忍（秒）：过期后该窗口内仍视为有效 */
const CLOCK_SKEW_SEC = 60;

const HEADER_B64 = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" }), "utf8").toString(
  "base64url",
);

function hmac(data: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(data, "utf8").digest();
}

/** 签名定长化：哈希后比较，耗时与输入无关 */
function fingerprint(value: Buffer): Buffer {
  return createHash("sha256").update(value).digest();
}

/**
 * 签发会话令牌。
 * @param sub  管理员标识（空串抛错——调用方契约：无主题的令牌没有意义）
 * @param secret HMAC 密钥（空串抛错——无密钥等于裸奔）
 * @param options.nowSec 签发时间（测试注入）；默认当前时间
 * @param options.ttlSec 有效期秒数；默认 SESSION_TTL_SEC
 */
export function signSession(
  sub: string,
  secret: string,
  options: { nowSec?: number; ttlSec?: number } = {},
): string {
  if (!sub) throw new Error("signSession: sub is required");
  if (!secret) throw new Error("signSession: secret is required");
  const iat = Math.floor(options.nowSec ?? Date.now() / 1000);
  const ttlSec = Math.floor(options.ttlSec ?? SESSION_TTL_SEC);
  const payload: SessionPayload = { sub, iat, exp: iat + ttlSec };
  const body = `${HEADER_B64}.${Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")}`;
  return `${body}.${hmac(body, secret).toString("base64url")}`;
}

/**
 * 校验会话令牌。返回 payload；任何一步不满足（结构、签名、缺字段、过期）→ null。
 * 调用方只区分「有效/无效」，不向客户端泄露失败细节。
 * nowSec 参数仅供测试注入时钟；生产默认当前时间。
 */
export function verifySession(
  token: string,
  secret: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): SessionPayload | null {
  const parts = (token || "").split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, signatureB64] = parts;

  const body = `${headerB64}.${payloadB64}`;
  const expected = fingerprint(hmac(body, secret));
  const providedRaw = Buffer.from(signatureB64, "base64url");
  const provided = fingerprint(providedRaw);
  if (!timingSafeEqual(provided, expected)) return null;

  let payload: Partial<SessionPayload>;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof payload.sub !== "string" || payload.sub.length === 0) return null;
  if (typeof payload.iat !== "number" || !Number.isFinite(payload.iat)) return null;
  if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) return null;
  if (nowSec > payload.exp + CLOCK_SKEW_SEC) return null;
  return { sub: payload.sub, iat: payload.iat, exp: payload.exp };
}
