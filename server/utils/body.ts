import { createError, getHeader, readRawBody, type H3Event } from "h3";

/**
 * 读 JSON 请求体，且**不要求** content-type 是 `application/json`。
 *
 * 为什么不能直接用 h3 的 readBody：支付宝云 URL 化网关会**直接应答 OPTIONS 预检**
 * （实测：对不存在的路径发 OPTIONS 也回 200 空体、不进云函数），因此浏览器发出的
 * 「带 `application/json` 的跨域 POST」会在预检阶段被拦下，请求根本到不了函数。
 * 前端于是改用 `text/plain` 发 JSON —— 这是 CORS 的「简单请求」，不触发预检。
 * 本函数让服务端两种 content-type 都能吃下：
 *
 * - `application/json`：常规客户端（curl / 脚本 / 其他前端）照旧
 * - `text/plain`：浏览器端为规避网关预检而使用
 *
 * 其他 content-type（表单、multipart）不支持，返回 undefined，由调用方按「缺参」处理。
 */
export async function readJsonBody<T = Record<string, unknown>>(
  event: H3Event,
): Promise<T | undefined> {
  const raw = await readRawBody(event).catch(() => undefined);
  if (!raw) return undefined;

  const contentType = (getHeader(event, "content-type") || "").toLowerCase();
  const acceptable =
    !contentType || contentType.includes("application/json") || contentType.includes("text/plain");
  if (!acceptable) return undefined;

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw createError({ statusCode: 400, statusMessage: "请求体不是合法 JSON" });
  }
}
