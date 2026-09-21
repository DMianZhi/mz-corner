import { createHash, timingSafeEqual } from "node:crypto";
import { createError, getCookie, getHeader, type H3Event } from "h3";
import { verifySession } from "./session";

/**
 * 管理写端点的统一鉴权。
 *
 * 守卫范围（所有会改动云数据库的服务端接口）：
 * - `POST /api/admin/seed`（批量灌库）
 * - `PATCH /api/blog/posts/:id`（更新文章正文）
 *
 * 令牌约定：环境变量 `SEED_TOKEN`，请求头 `x-seed-token`。
 * —— 名字里带 seed 是历史原因：它最早只为灌库而生，后来 PATCH 也接入同一把令牌。
 * 一把令牌管所有写权限，运维上只记一个值、控制台只配一个变量；
 * 真要细分权限时再拆，别提前拆（个人博客没有「能 seed 但不能改文章」的角色）。
 *
 * 凭据三通道（任一通过即可）：
 * - **会话令牌**（`x-admin-session` 头）：login 签发的 HMAC JWT，7 天有效
 * - **会话 Cookie**（`mz_admin_session`）：同值，作为自定义头被网关剥掉时的备用通道
 * - **旧 seed 令牌**（`x-seed-token` 头）：历史通道，脚本/CURL 用；
 *   仅在管理端环境变量（ADMIN_PASSWORD）未配置时可用——避免长期依赖旧通道
 *
 * 三段语义：
 * - **管理端完全未配置（无 ADMIN_PASSWORD 且无 SEED_TOKEN）→ 404**：
 *   端点整体关闭，且不暴露「这里有个管理接口」的事实。
 * - **已配置但凭据缺失/无效 → 401/403**：401 = 完全没带或会话已过期（该去登录），
 *   403 = 带了但不对（旧令牌通道错值）。
 * - **管理端已配置时（ADMIN_PASSWORD 存在）**：旧 seed 通道退役，会话是唯一正道——
 *   避免双通道长期并存带来的「哪把钥匙都能开门」的审计负担。
 *
 * 为什么直接读 `process.env` 而不走 runtimeConfig：取值会在构建期内联进产物，
 * 令牌一旦内联就只能重新构建才能更换；这是「用完即弃」的运维开关，
 * 必须能在控制台随时改/删（详见 seed.post.ts 的同款说明）。
 *
 * 为什么先 sha256 再 `timingSafeEqual`：timingSafeEqual 要求两侧等长，
 * 否则直接抛异常；哈希成定长（32 字节）既满足要求，也让比较耗时
 * 与输入内容、长度都无关，不泄露令牌的长度或前缀信息。
 */

const SEED_TOKEN_HEADER = "x-seed-token";
const SESSION_HEADER = "x-admin-session";
const SESSION_COOKIE = "mz_admin_session";

export type AdminTokenCheck = "ok" | "disabled" | "invalid";

/** 纯函数：判定令牌状态，不碰 h3 事件对象，方便单测覆盖全部分支 */
export function checkAdminToken(expected: string, provided: string): AdminTokenCheck {
  const expectedValue = expected.trim();
  if (!expectedValue) return "disabled";

  const providedValue = (provided || "").trim();
  if (!providedValue) return "invalid";

  const fingerprint = (value: string): Buffer =>
    createHash("sha256").update(value, "utf8").digest();
  return timingSafeEqual(fingerprint(providedValue), fingerprint(expectedValue)) ? "ok" : "invalid";
}

export type AdminAuthResolution = "ok" | "unauthorized" | "forbidden" | "hidden";

export interface AdminAuthInput {
  /** ADMIN_PASSWORD 已配置（管理后台可登录） */
  adminConfigured: boolean;
  /** SEED_TOKEN 已配置（旧通道可用性） */
  seedConfigured: boolean;
  /** 请求带了会话令牌（头或 Cookie） */
  sessionProvided: boolean;
  /** 会话令牌验签通过 */
  sessionValid: boolean;
  /** 请求带了 seed 令牌头 */
  seedProvided: boolean;
  /** seed 令牌匹配 */
  seedValid: boolean;
}

/**
 * 纯函数真值表：三通道决策，方便单测覆盖全部分支。
 *
 * 优先级：会话（头 > Cookie）> 旧 seed 头（仅管理端未配置时作为兼容通道）。
 * 返回值到 HTTP 的映射：ok→放行；unauthorized→401（去登录）；
 * forbidden→403（带了但不对）；hidden→404（端点不存在）。
 */
export function resolveAdminAuth(input: AdminAuthInput): AdminAuthResolution {
  const { adminConfigured, seedConfigured, sessionProvided, sessionValid, seedProvided, seedValid } = input;

  // 两侧都没配：端点整体关闭（隐藏）。哪怕带了「有效」凭据也不放行——
  // 凭据在未配置时无从校验，「有效」本身是谎言。
  if (!adminConfigured && !seedConfigured) return "hidden";

  // 会话通道：提供了就以它为准（有效与否都不再降级到旧通道，防陈旧凭据混用）。
  if (sessionProvided) return sessionValid ? "ok" : "unauthorized";

  // 管理端已激活：会话是唯一正道，seed 头不再旁路（统一 401 提示去登录）。
  if (adminConfigured) return "unauthorized";

  // 兼容模式：只配了 SEED_TOKEN（管理后台未激活），脚本/deploy 自检继续可用。
  if (seedProvided) return seedValid ? "ok" : "forbidden";
  return "unauthorized";
}

/** 会话签名密钥：显式 SESSION_SECRET 优先，缺省派生自管理口令（换口令 = 全端下线，特性而非缺陷） */
export function sessionSecret(): string {
  return (process.env.SESSION_SECRET || "").trim() || (process.env.ADMIN_PASSWORD || "").trim();
}

/** 事件处理器内的守卫入口：通过则返回，否则抛出对应的 HTTP 错误 */
export function requireAdminToken(event: H3Event): void {
  const adminPassword = (process.env.ADMIN_PASSWORD || "").trim();
  const seedToken = (process.env.SEED_TOKEN || "").trim();
  const secret = sessionSecret();

  // 会话通道：自定义头优先，Cookie 兜底（网关剥自定义头时的备用路径）
  const sessionToken =
    (getHeader(event, SESSION_HEADER) || getCookie(event, SESSION_COOKIE) || "").trim();
  const sessionValid =
    !!sessionToken && !!secret && verifySession(sessionToken, secret) !== null;

  const seedProvidedRaw = (getHeader(event, SEED_TOKEN_HEADER) || "").trim();
  const seedValid = seedProvidedRaw.length > 0 && checkAdminToken(seedToken, seedProvidedRaw) === "ok";

  const resolution = resolveAdminAuth({
    adminConfigured: !!adminPassword,
    seedConfigured: !!seedToken,
    sessionProvided: !!sessionToken,
    sessionValid,
    seedProvided: !!seedProvidedRaw,
    seedValid,
  });

  if (resolution === "ok") return;
  if (resolution === "unauthorized") {
    throw createError({ statusCode: 401, statusMessage: "admin session required" });
  }
  if (resolution === "forbidden") {
    throw createError({ statusCode: 403, statusMessage: "invalid admin token" });
  }
  // hidden：与「路径不存在」不可区分，不暴露端点存在性
  throw createError({ statusCode: 404, statusMessage: "Not Found" });
}
