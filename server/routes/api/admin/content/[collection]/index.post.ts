import { createError, type H3Event } from "h3";
import { requireAdminToken } from "~~/utils/admin-auth";
import { readJsonBody } from "~~/utils/body";
import { sanitizeContentFields } from "~~/utils/content-schema";
import { resolveContentCollection } from "~~/utils/content-store";

/**
 * POST /api/admin/content/:collection —— 新建文档。
 *
 * 必填字段在此校验（partial=false）。默认不指定 `_id`，交给云数据库生成。
 *
 * 可选显式 `_id`：仅用于「恢复误删文档」与「跨环境迁移」——评论的 articleId、
 * 站点外链都按 id 引用，换 id 会让引用断掉。已存在则 409：静默覆盖既有文档
 * 比报错危险得多（这是唯一一条能让 create 改到既有文档的路径）。
 */
export default defineEventHandler(async (event: H3Event) => {
  requireAdminToken(event);
  const { name, schema, collection } = resolveContentCollection(event);

  const body = await readJsonBody(event);
  if (!body) throw createError({ statusCode: 400, statusMessage: "缺少请求体" });

  const result = sanitizeContentFields(name, body);
  if (!result.ok) throw createError({ statusCode: 400, statusMessage: result.error });

  const explicitId = typeof body._id === "string" ? body._id.trim() : "";
  if (explicitId) {
    const existing = await collection.doc(explicitId).get();
    if (existing.data.length > 0) {
      throw createError({ statusCode: 409, statusMessage: `文档已存在：${explicitId}` });
    }
  }

  const payload = explicitId ? { ...result.data, _id: explicitId } : result.data;
  const { id } = await collection.add(payload);
  if (!id) throw createError({ statusCode: 500, statusMessage: "创建失败" });

  return { code: 0, data: { collection: schema.name, id } };
});
