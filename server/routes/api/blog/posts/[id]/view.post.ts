import { errorMessage } from "~~/utils/blog-db";
import {
  defineEventHandler,
  getRouterParam,
  readBody,
  createError,
} from "h3";

/**
 * POST /api/blog/posts/:id/view
 * 阅读数 +1（写回 WPS 多维表「阅读数」字段）。失败时静默，不影响页面浏览。
 */

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, statusMessage: "Missing post id" });
  try {
    const body = await readBody<{ count?: number }>(event);
    const count = Number(body?.count);
    const current = (await getArticleFromDb(id))?.viewCount ?? 0;
    const viewCount = Number.isFinite(count) && count > 0 ? count : current + 1;
    if (!viewCount) return { code: 1, data: { viewCount: null } };
    await addViewToDb(id, viewCount);
    return { code: 0, data: { viewCount } };
  } catch (error: unknown) {
    console.error("[blog] increment views error:", errorMessage(error));
    return { code: 1, data: { viewCount: null } };
  }
});
