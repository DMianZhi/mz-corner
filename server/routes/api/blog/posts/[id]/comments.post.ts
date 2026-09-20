import { createError, defineEventHandler, getRouterParam, readBody } from "h3";
import { submitComment } from "~~/services/blog-service";
import { errorMessage } from "~~/utils/errors";

interface CommentBody {
  author?: string;
  email?: string;
  content?: string;
}

/** POST /api/blog/posts/:id/comments — 新增评论 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "缺少文章 ID" });
  }

  const body = await readBody<CommentBody>(event).catch(() => undefined);
  const author = String(body?.author ?? "").trim();
  const content = String(body?.content ?? "").trim();
  if (!author || !content) {
    throw createError({ statusCode: 400, statusMessage: "昵称和评论内容不能为空" });
  }

  try {
    const comment = await submitComment({
      articleId: id,
      author,
      email: String(body?.email ?? ""),
      content,
    });
    if (!comment) {
      throw createError({ statusCode: 500, statusMessage: "评论写入失败" });
    }
    return { code: 0, data: comment };
  } catch (error: unknown) {
    if (error instanceof Error && "statusCode" in error) throw error;
    console.error("[blog] add comment error:", errorMessage(error));
    throw createError({ statusCode: 502, statusMessage: `添加评论失败: ${errorMessage(error)}` });
  }
});
