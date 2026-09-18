/**
 * GET /api/blog/posts/:id
 * 文章详情：按记录 ID 从多维表获取单篇文章（含正文内容）。front page (list) hides content for perf.
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Missing post id" });
  }
  const post = await getArticleFromDb(id);
  if (!post) {
    throw createError({ statusCode: 404, statusMessage: "Post not found" });
  }
  return { code: 0, data: post };
});
