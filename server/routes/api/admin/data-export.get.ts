import type { H3Event } from "h3";
import { fetchAll } from "~~/data/providers/unicloud-db/admin";
import { getDatabase } from "~~/data/providers/unicloud-db/client";
import { COLLECTIONS, LIMITS } from "~~/data/providers/unicloud-db/collections";
import { requireAdminToken } from "~~/utils/admin-auth";

/**
 * GET /api/admin/data-export —— 全库导出（JSON，seed 同构格式）。
 *
 * 用途：与 seed（replace 模式）构成「线上拉回 → 本地改 → 推回」闭环。
 * replace 语义是清空集合再写入，若本地文件是旧快照，会把线上新增的
 * viewCount/评论刷回去——所以编辑数据前先从这里拉最新。
 *
 * 为什么导出原始文档而非领域对象：repository.listArticles 会过滤草稿、
 * 归一化字段，导出的格式必须与 seed 的写入格式（articles.init_data.json）
 * 同构，拉回后才能直接编辑、原样 seed 回去，不丢草稿。
 *
 * 为什么用 requireAdminToken：导出虽是读操作，但内容等同全库备份，
 * 权限面与写端点一致（三通道守卫统一管）。
 */
export default defineEventHandler(async (event: H3Event) => {
  requireAdminToken(event);

  const db = getDatabase();
  const [articles, comments, projects, site_config] = await Promise.all([
    fetchAll(db.collection(COLLECTIONS.articles), {}, LIMITS.articles),
    fetchAll(db.collection(COLLECTIONS.comments), {}, LIMITS.comments),
    fetchAll(db.collection(COLLECTIONS.projects), {}, LIMITS.projects),
    fetchAll(db.collection(COLLECTIONS.siteConfig), {}, LIMITS.siteConfig),
  ]);
  return { articles, comments, projects, site_config };
});
