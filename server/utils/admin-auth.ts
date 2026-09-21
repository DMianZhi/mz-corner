import { createHash, timingSafeEqual } from "node:crypto";
import { createError, getHeader, type H3Event } from "h3";

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
 * 两段语义，与 seed 端点的既有行为保持一致：
 * - **未配置令牌 → 404**：端点整体关闭，且不暴露「这里有个管理接口」的事实
 *   （404 与「路径不存在」无法区分，扫端点的脚本拿不到任何信号）。
 * - **令牌不匹配 → 403**：端点存在但没权限。
 *
 * 为什么直接读 `process.env` 而不走 runtimeConfig：取值会在构建期内联进产物，
 * 令牌一旦内联就只能重新构建才能更换；这是「用完即弃」的运维开关，
 * 必须能在控制台随时改/删（详见 seed.post.ts 的同款说明）。
 *
 * 为什么先 sha256 再 `timingSafeEqual`：timingSafeEqual 要求两侧等长，
 * 否则直接抛异常；哈希成定长（32 字节）既满足要求，也让比较耗时
 * 与输入内容、长度都无关，不泄露令牌的长度或前缀信息。
 */

const ADMIN_TOKEN_HEADER = "x-seed-token";

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

/** 事件处理器内的守卫入口：通过则返回，否则抛出对应的 HTTP 错误 */
export function requireAdminToken(event: H3Event): void {
  const check = checkAdminToken(process.env.SEED_TOKEN || "", getHeader(event, ADMIN_TOKEN_HEADER) || "");
  if (check === "ok") return;
  if (check === "disabled") {
    throw createError({ statusCode: 404, statusMessage: "Not Found" });
  }
  throw createError({ statusCode: 403, statusMessage: "invalid admin token" });
}
