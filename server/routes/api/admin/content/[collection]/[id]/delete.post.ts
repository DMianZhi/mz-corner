import type { H3Event } from "h3";
import { requireAdminToken } from "~~/utils/admin-auth";
import { requireContentId, resolveContentCollection } from "~~/utils/content-store";

/**
 * POST /api/admin/content/:collection/:id/delete —— 删除文档。
 *
 * 不可逆，前端负责二次确认；服务端只做「确实删了」的回报。`deleted` 为 0
 * 说明 id 不存在（或已被别处删掉），如实回给前端而不是假装成功。
 *
 * 为什么用 POST 而不是 DELETE：网关的 CORS 方法表固定且不可配置，DELETE 未经验证；
 * POST 是线上已跑通的通道。语义靠路径 `/delete` 显式表达，比隐藏的动词重载更清楚。
 */
export default defineEventHandler(async (event: H3Event) => {
  requireAdminToken(event);
  const { schema, collection } = resolveContentCollection(event);
  const id = requireContentId(event);

  const { deleted } = await collection.doc(id).remove();
  return { code: 0, data: { collection: schema.name, id, deleted: deleted ?? 0 } };
});
