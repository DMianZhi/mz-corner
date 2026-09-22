/**
 * 通用内容路由的共享逻辑：把 URL 参数解析成「已校验的集合句柄」。
 *
 * 单独抽出来是因为 6 个端点（list/create/update/delete/bulk/schema）都要做同一件事：
 * 校验 `:collection` 是白名单里的集合、`:_id` 非空。散落各文件迟早会漏一处校验。
 */
import { createError, getRouterParam, type H3Event } from "h3";
import { getDatabase, type DbCollection } from "~~/data/providers/unicloud-db/client";
import { getContentSchema, type CollectionSchema } from "./content-schema";

export interface ResolvedContentCollection {
  /** 集合名（等于 URL 里的 :collection，已确认在白名单内） */
  name: string;
  schema: CollectionSchema;
  collection: DbCollection;
}

/**
 * 解析并校验 `:collection`。
 *
 * 未在白名单内一律 404：管理端集合清单是固定的四类，把「不存在」和「无权限」
 * 统一成 404 可避免暴露内部集合名。
 */
export function resolveContentCollection(event: H3Event): ResolvedContentCollection {
  const raw = getRouterParam(event, "collection");
  const schema = getContentSchema(raw);
  if (!schema || !raw) {
    throw createError({ statusCode: 404, statusMessage: "未知内容集合" });
  }
  return { name: raw, schema, collection: getDatabase().collection(raw) };
}

/** 解析 `:_id`；缺失即 400（而不是让数据库层抛模糊错误） */
export function requireContentId(event: H3Event): string {
  const id = getRouterParam(event, "id");
  if (!id || !id.trim()) {
    throw createError({ statusCode: 400, statusMessage: "缺少文档 id" });
  }
  return id.trim();
}

/**
 * 确认文档存在，不存在则 404。
 *
 * 不能靠 `update` 的返回计数判断：云数据库在「值未变化」时同样回 `updated: 0`，
 * 与「id 不存在」无法区分。若省掉这一步，前端改一个已在别处删掉的文档会看到
 * 「已保存」——后台静默说谎比报错更糟。多一次读换取确定的结论。
 *
 * 多个 id 并发查（批量保存时顺序查会拖成 N 个串行往返）。
 */
export async function assertContentDocumentsExist(
  collection: DbCollection,
  ids: string[],
): Promise<void> {
  const results = await Promise.all(ids.map((id) => collection.doc(id).get()));
  const missing = ids.filter((_, index) => {
    const found = results[index];
    return !found || !Array.isArray(found.data) || found.data.length === 0;
  });
  if (missing.length > 0) {
    throw createError({
      statusCode: 404,
      statusMessage: `文档不存在：${missing.join(", ")}`,
    });
  }
}
