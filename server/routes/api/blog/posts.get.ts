import { createError, defineEventHandler, getQuery } from "h3";
import { listPublishedArticles } from "~~/services/blog-service";
import { errorMessage } from "~~/utils/errors";

/**
 * GET /api/blog/posts
 * 查询参数：category / tag / keyword
 */
export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event);
    const items = await listPublishedArticles({
      category: typeof query.category === "string" ? query.category : "",
      tag: typeof query.tag === "string" ? query.tag : "",
      keyword: typeof query.keyword === "string" ? query.keyword : "",
    });

    return {
      code: 0,
      data: {
        items,
        total: items.length,
        page: 1,
        pageSize: items.length || 1,
        totalPages: 1,
      },
    };
  } catch (error: unknown) {
    console.error("[blog] posts error:", errorMessage(error));
    throw createError({ statusCode: 500, statusMessage: errorMessage(error) || "获取文章失败" });
  }
});
