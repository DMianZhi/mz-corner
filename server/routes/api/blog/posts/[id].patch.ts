// PATCH /api/blog/posts/:id — 更新文章正文（用于内容维护）
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  const body = await readBody(event).catch(() => undefined);
  const content = String(body?.content ?? "").trim();
  if (!id || !content) {
    return { code: 1, msg: "缺少 id 或 content" };
  }
  const ok = await updateArticleContent(id, content);
  return ok ? { code: 0, msg: "ok" } : { code: 1, msg: "更新失败" };
});
