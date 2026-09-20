import { createError, defineEventHandler, getRouterParam } from "h3";
import { listArticleComments } from "~~/services/blog-service";
import { errorMessage } from "~~/utils/errors";

/** GET /api/blog/posts/:id/comments — 某篇文章的评论列表（时间正序） */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Missing post id" });
  }

  try {
    return { code: 0, data: await listArticleComments(id) };
  } catch (error: unknown) {
    throw createError({ statusCode: 502, statusMessage: `获取评论失败: ${errorMessage(error)}` });
  }
});
