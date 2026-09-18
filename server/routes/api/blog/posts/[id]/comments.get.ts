import { errorMessage } from "~~/utils/blog-db";
/**
 * GET  /api/blog/posts/:id/comments  — 某篇文章的评论列表
 * POST /api/blog/posts/:id/comments  — 新增评论（写入多维表评论表）
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Missing post id" });
  }

  if (event.method === "GET") {
    try {
      const comments = await listCommentsFromDb(id);
      comments.sort((a, b) => {
        const ta = new Date(a.createTime.replace(/-/g, "/")).getTime() || 0;
        const tb = new Date(b.createTime.replace(/-/g, "/")).getTime() || 0;
        return ta - tb;
      });
      return { code: 0, data: comments };
    } catch (error: unknown) {
      throw createError({ statusCode: 502, statusMessage: `获取评论失败: ${errorMessage(error)}` });
    }
  }

  if (event.method === "POST") {
    try {
      const body = await readBody(event);
      const author = String(body?.author ?? "").trim().slice(0, 50);
      const email = String(body?.email ?? "").trim().slice(0, 100);
      const content = String(body?.content ?? "").trim().slice(0, 1000);
      if (!author || !content) {
        throw createError({ statusCode: 400, statusMessage: "姓名和评论内容不能为空" });
      }
      const comment = await addCommentToDb({ articleId: id, author, email, content });
      return { code: 0, data: comment };
    } catch (error: unknown) {
      if (error instanceof Error && "statusCode" in error && (error as { statusCode: number }).statusCode === 400) throw error;
      throw createError({ statusCode: 502, statusMessage: `添加评论失败: ${errorMessage(error)}` });
    }
  }

  throw createError({ statusCode: 405, statusMessage: "Method not allowed" });
});
