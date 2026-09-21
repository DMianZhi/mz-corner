import { defineEventHandler, getRouterParam } from "h3";
import { updateArticleContent } from "~~/services/blog-service";
import { requireAdminToken } from "~~/utils/admin-auth";
import { readJsonBody } from "~~/utils/body";

/** PATCH /api/blog/posts/:id — 更新文章正文（内容维护用，需管理员令牌） */
export default defineEventHandler(async (event) => {
  // 先鉴权再读参：改库的端点不能在鉴权前消耗请求体
  requireAdminToken(event);

  const id = getRouterParam(event, "id");
  const body = await readJsonBody<{ content?: string }>(event);
  const content = String(body?.content ?? "").trim();
  if (!id || !content) {
    return { code: 1, msg: "缺少 id 或 content" };
  }

  const ok = await updateArticleContent(id, content);
  return ok ? { code: 0, msg: "ok" } : { code: 1, msg: "更新失败" };
});
