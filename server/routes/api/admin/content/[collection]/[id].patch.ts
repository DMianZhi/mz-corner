import { createError, type H3Event } from "h3";
import { requireAdminToken } from "~~/utils/admin-auth";
import { readJsonBody } from "~~/utils/body";
import { sanitizeContentFields } from "~~/utils/content-schema";
import {
  assertContentDocumentsExist,
  requireContentId,
  resolveContentCollection,
} from "~~/utils/content-store";

/**
 * PATCH /api/admin/content/:collection/:id —— 局部更新文档。
 *
 * 取代原先只能改 `content` 单字段的 `PATCH /api/blog/posts/:id`：管理端现在要改
 * 四类内容的任意白名单字段，逐字段开端点不现实，通用路由 + 白名单才是可控的做法。
 *
 * 保存前先确认文档存在（404）：`updated` 计数不可信（值未变化时云数据库也回 0），
 * 无法区分「id 不存在」与「值没变」，不查存在性就会对已删除的文档回报成功。
 */
export default defineEventHandler(async (event: H3Event) => {
  requireAdminToken(event);
  const { name, schema, collection } = resolveContentCollection(event);
  const id = requireContentId(event);

  const body = await readJsonBody(event);
  if (!body) throw createError({ statusCode: 400, statusMessage: "缺少请求体" });

  const result = sanitizeContentFields(name, body, { partial: true });
  if (!result.ok) throw createError({ statusCode: 400, statusMessage: result.error });

  const fields = Object.keys(result.data);
  if (fields.length === 0) {
    throw createError({ statusCode: 400, statusMessage: "没有可更新的字段" });
  }

  await assertContentDocumentsExist(collection, [id]);
  await collection.doc(id).update(result.data);
  return { code: 0, data: { collection: schema.name, id, fields } };
});
