import { errorMessage } from "~~/utils/blog-db";
import { defineEventHandler, readBody, createError } from "h3";

/**
 * POST /api/blog/posts/:id/comments
 * 新增评论到 WPS 多维表「评论表」。
 */
export default defineEventHandler(async (event) => {
  try {
    const id = getRouterParam(event, "id");
    const body = await readBody<{
      author?: string;
      email?: string;
      content?: string;
    }>(event);

    if (!id) throw createError({ statusCode: 400, statusMessage: "缺少文章 ID" });
    const author = (body?.author || "").trim();
    const content = (body?.content || "").trim();
    if (!author || !content) {
      throw createError({ statusCode: 400, statusMessage: "昵称和评论内容不能为空" });
    }

    const comment = await addCommentToDb({
      articleId: id,
      author,
      email: (body?.email || "").trim(),
      content,
    });
    if (!comment) throw createError({ statusCode: 500, statusMessage: "评论写入失败" });
    return { code: 0, data: comment };
  } catch (error: unknown) {
    if (error instanceof Error && "statusCode" in error) throw error;
    console.error("[blog] add comment error:", errorMessage(error));
    throw createError({ statusCode: 500, statusMessage: errorMessage(error) || "评论失败" });
  }
});
