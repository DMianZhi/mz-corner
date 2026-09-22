import type { H3Event } from "h3";
import { fetchAll } from "~~/data/providers/unicloud-db/admin";
import { LIMITS } from "~~/data/providers/unicloud-db/collections";
import { requireAdminToken } from "~~/utils/admin-auth";
import { resolveContentCollection } from "~~/utils/content-store";

/**
 * GET /api/admin/content/:collection —— 列出集合内全部原始文档。
 *
 * 刻意读原始文档而非走 repository 的领域方法：后者会过滤草稿、归一化状态，
 * 那是前台该有的行为；管理端必须看到全部（含草稿、含字段拼写不一致的脏文档），
 * 否则「内容莫名不见」这类问题在后台根本无从排查。
 */
export default defineEventHandler(async (event: H3Event) => {
  requireAdminToken(event);
  const { name, collection } = resolveContentCollection(event);

  const limit = (LIMITS as Record<string, number>)[name] ?? 2000;
  const items = await fetchAll(collection, {}, limit);
  return { code: 0, data: { collection: name, total: items.length, items } };
});
