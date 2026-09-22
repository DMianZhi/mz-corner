import type { H3Event } from "h3";
import { requireAdminToken } from "~~/utils/admin-auth";
import { schemaManifest } from "~~/utils/content-schema";

/**
 * GET /api/admin/content —— 内容字段清单（表单驱动用）。
 *
 * 前端据此渲染「项目 / 评论 / 站点设置」的表单，字段名、标签、类型、枚举、
 * 长度上限全部来自服务端白名单，避免前后端各维护一份清单后逐渐漂移。
 */
export default defineEventHandler((event: H3Event) => {
  requireAdminToken(event);
  return { code: 0, data: { collections: schemaManifest() } };
});
