import { defineEventHandler, getRouterParam, readBody } from "h3";
import { updateArticleContent } from "~~/services/blog-service";

/** PATCH /api/blog/posts/:id — 更新文章正文（内容维护用） */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  const body = await readBody<{ content?: string }>(event).catch(() => undefined);
  const content = String(body?.content ?? "").trim();
  if (!id || !content) {
    return { code: 1, msg: "缺少 id 或 content" };
  }

  const ok = await updateArticleContent(id, content);
  return ok ? { code: 0, msg: "ok" } : { code: 1, msg: "更新失败" };
});
