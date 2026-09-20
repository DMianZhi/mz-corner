import { createError, defineEventHandler, getRouterParam, readBody } from "h3";
import { registerArticleView } from "~~/services/blog-service";
import { errorMessage } from "~~/utils/errors";

/**
 * POST /api/blog/posts/:id/view
 * 阅读数 +1（写回数据源）。失败时静默，不影响页面浏览。
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Missing post id" });
  }

  try {
    const body = await readBody<{ count?: number }>(event).catch(() => undefined);
    const viewCount = await registerArticleView(id, Number(body?.count));
    if (viewCount === null) {
      return { code: 1, data: { viewCount: null } };
    }
    return { code: 0, data: { viewCount } };
  } catch (error: unknown) {
    console.error("[blog] increment views error:", errorMessage(error));
    return { code: 1, data: { viewCount: null } };
  }
});
