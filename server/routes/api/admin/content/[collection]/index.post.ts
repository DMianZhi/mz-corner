import { createError, type H3Event } from "h3";
import { requireAdminToken } from "~~/utils/admin-auth";
import { readJsonBody } from "~~/utils/body";
import { sanitizeContentFields } from "~~/utils/content-schema";
import { resolveContentCollection } from "~~/utils/content-store";

/**
 * POST /api/admin/content/:collection —— 新建文档。
 *
 * 必填字段在此校验（partial=false）。不指定 `_id`，交给云数据库生成：
 * 各家 provider 对自定义主键的支持不一致，让平台生成最省事，前台按 id 取文不受影响。
 */
export default defineEventHandler(async (event: H3Event) => {
  requireAdminToken(event);
  const { name, schema, collection } = resolveContentCollection(event);

  const body = await readJsonBody(event);
  if (!body) throw createError({ statusCode: 400, statusMessage: "缺少请求体" });

  const result = sanitizeContentFields(name, body);
  if (!result.ok) throw createError({ statusCode: 400, statusMessage: result.error });

  const { id } = await collection.add(result.data);
  if (!id) throw createError({ statusCode: 500, statusMessage: "创建失败" });

  return { code: 0, data: { collection: schema.name, id } };
});
