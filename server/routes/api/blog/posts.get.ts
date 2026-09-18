import {
  defineEventHandler,
  getQuery,
  createError,
} from "h3";
/**
 * GET /api/blog/posts
 *
 * 博客文章列表接口：读取 WPS 多维表「文章表」，返回发布状态的文章。
 * listArticlesFromDb 来自 server/utils/blog-db.ts（Nitro 自动导入）。
 */
/**
 * GET /api/blog/posts
 * 查询参数：category / tag / keyword
 */
export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event);
    const all = await listArticlesFromDb();

    const category = typeof query.category === "string" ? query.category : "";
    const tag = typeof query.tag === "string" ? query.tag : "";
    const keyword = typeof query.keyword === "string" ? query.keyword : "";

    const filtered = all.filter((post) => {
      if (category && post.category !== category) return false;
      if (tag && !post.tags.includes(tag)) return false;
      if (
        keyword &&
        !post.title.includes(keyword) &&
        !post.summary.includes(keyword)
      ) {
        return false;
      }
      return true;
    });

    filtered.sort(
      (a, b) => new Date(b.publishDate).getTime() - new Date(a.publishDate).getTime()
    );

    return {
      code: 0,
      data: {
        items: filtered,
        total: filtered.length,
        page: 1,
        pageSize: filtered.length || 1,
        totalPages: 1,
      },
    };
  } catch (error: any) {
    console.error("[blog] posts error:", error?.message || error);
    throw createError({ statusCode: 500, statusMessage: error?.message || "获取文章失败" });
  }
});
