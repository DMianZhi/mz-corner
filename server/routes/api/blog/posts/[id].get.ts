import { createError, defineEventHandler, getRouterParam } from "h3";
import { getArticleById } from "~~/services/blog-service";

/**
 * GET /api/blog/posts/:id
 * 文章详情（含正文）。
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Missing post id" });
  }

  const post = await getArticleById(id);
  if (!post) {
    throw createError({ statusCode: 404, statusMessage: "Post not found" });
  }
  return { code: 0, data: post };
});
