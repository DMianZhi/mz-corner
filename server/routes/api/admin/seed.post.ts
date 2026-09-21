import { createError, defineEventHandler } from "h3";
import { clearCollection, COLLECTIONS, countDocuments, insertDocuments } from "~~/data";
import { readJsonBody } from "~~/utils/body";
import { requireAdminToken } from "~~/utils/admin-auth";
import { errorMessage } from "~~/utils/errors";

/**
 * POST /api/admin/seed — 把一批领域文档批量写入云数据库。
 *
 * 为什么需要这个端点：云数据库只能在云函数内访问，本地脚本没有直连路径。
 * 所以本地把数据转成领域文档，再 POST 上来由云函数落库——
 * **数据本身因此不进 git**（评论含读者邮箱，不能进公开仓库）。
 *
 * 鉴权：请求头 x-seed-token 必须与环境变量 SEED_TOKEN 一致——
 * 与 PATCH /api/blog/posts/:id 共用 `requireAdminToken()`（语义与实现细节见该工具）。
 * 一把令牌管所有写端点：未配置 → 404 关闭，不匹配 → 403。
 *
 * 请求体：
 *   {
 *     "mode": "replace" | "append",   // 默认 replace：先清空该集合再写入
 *     "articles": [ { title, content, ... } ],
 *     "comments": [ ... ], "projects": [ ... ], "siteConfig": [ ... ]
 *   }
 * 未出现在请求体里的集合一律不动——避免「只补评论却清空了文章」这类误伤。
 * 未知键直接报 400：拼错键名（如 article）若被静默忽略，会表现为「写入成功但数据没变」。
 */
const SEEDABLE = [
  { key: "articles", collection: COLLECTIONS.articles },
  { key: "comments", collection: COLLECTIONS.comments },
  { key: "projects", collection: COLLECTIONS.projects },
  { key: "siteConfig", collection: COLLECTIONS.siteConfig },
];

export default defineEventHandler(async (event) => {
  requireAdminToken(event);

  const body = await readJsonBody<Record<string, unknown>>(event);
  if (!body || typeof body !== "object") {
    throw createError({ statusCode: 400, statusMessage: "empty request body" });
  }

  const mode = body.mode === "append" ? "append" : "replace";
  const known = new Set(SEEDABLE.map((entry) => entry.key));
  const unknown = Object.keys(body).filter((key) => key !== "mode" && !known.has(key));
  if (unknown.length) {
    throw createError({
      statusCode: 400,
      statusMessage: `未知键：${unknown.join(", ")}（可用键：${[...known].join(", ")}）`,
    });
  }

  const report: Record<string, { cleared: number; inserted: number; total: number }> = {};

  try {
    for (const { key, collection } of SEEDABLE) {
      if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
      const raw = body[key];
      if (!Array.isArray(raw)) {
        throw createError({ statusCode: 400, statusMessage: `${key} 必须是数组` });
      }
      const cleared = mode === "replace" ? await clearCollection(collection) : 0;
      const inserted = await insertDocuments(collection, raw as Array<Record<string, unknown>>);
      // 带上写入后的实际条数：回执本身就是一次校验，不用再单独查一遍
      report[key] = { cleared, inserted, total: await countDocuments(collection) };
    }
  } catch (error: unknown) {
    console.error("[admin/seed]", errorMessage(error));
    // 带上已完成的进度：写入是幂等的（replace 模式可重跑），重试时能知道断在哪
    throw createError({
      statusCode: 500,
      statusMessage: `seed failed: ${errorMessage(error)} (progress: ${JSON.stringify(report)})`,
    });
  }

  return { code: 0, data: { mode, report } };
});
