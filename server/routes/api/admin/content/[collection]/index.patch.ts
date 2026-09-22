import { createError, type H3Event } from "h3";
import { requireAdminToken } from "~~/utils/admin-auth";
import { readJsonBody } from "~~/utils/body";
import { sanitizeContentFields } from "~~/utils/content-schema";
import {
  assertContentDocumentsExist,
  resolveContentCollection,
} from "~~/utils/content-store";

interface BulkPayload {
  /** 每项必须含 `_id`；其余字段按白名单清洗 */
  items?: unknown;
}

/**
 * PATCH /api/admin/content/:collection —— 批量更新（集合级）。
 *
 * 专为站点设置这类「一组 key-value 文档」设计：10 条设置逐条 PATCH 就是 10 次往返，
 * 而用户在表单里按的是一次「保存」。逐项独立校验，任一项不合法即整体拒绝（不半途落库），
 * 保证「保存」要么全成要么全不成。
 *
 * 只更新、不新建：批量接口若兼做 upsert，一次手滑就能凭空造出文档。
 *
 * 为什么用 PATCH 而不是 PUT：支付宝云 URL 化网关会劫持 OPTIONS 预检并回自己的
 * 方法表，该表**无法配置**。线上已验证可用的是 GET/POST/PATCH，PUT/DELETE 未经验证，
 * 因此新增端点一律避开这两个方法（删除端点也走 POST，见 [id]/delete.post.ts）。
 */
export default defineEventHandler(async (event: H3Event) => {
  requireAdminToken(event);
  const { name, schema, collection } = resolveContentCollection(event);

  const body = await readJsonBody<BulkPayload>(event);
  if (!body || !Array.isArray(body.items)) {
    throw createError({ statusCode: 400, statusMessage: "请求体需形如 { items: [...] }" });
  }
  if (body.items.length === 0) {
    throw createError({ statusCode: 400, statusMessage: "items 不能为空数组" });
  }
  if (body.items.length > 500) {
    throw createError({ statusCode: 400, statusMessage: "单次批量更新不能超过 500 项" });
  }

  // 先整体校验，再统一落库：避免「第 7 项报错时前 6 项已经写进去」
  const patches: Array<{ id: string; data: Record<string, unknown> }> = [];
  for (const [index, item] of body.items.entries()) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw createError({ statusCode: 400, statusMessage: `第 ${index + 1} 项不是对象` });
    }
    const record = item as Record<string, unknown>;
    const id = typeof record._id === "string" ? record._id.trim() : "";
    if (!id) {
      throw createError({ statusCode: 400, statusMessage: `第 ${index + 1} 项缺少 _id` });
    }
    const result = sanitizeContentFields(name, record, { partial: true });
    if (!result.ok) {
      throw createError({ statusCode: 400, statusMessage: `第 ${index + 1} 项：${result.error}` });
    }
    // 与单条 PATCH 保持一致：整项字段都不在白名单里属客户端 bug，静默跳过会让
    // 「保存成功」掩盖「什么都没存」，前端以为改上了其实没有
    if (Object.keys(result.data).length === 0) {
      throw createError({ statusCode: 400, statusMessage: `第 ${index + 1} 项没有可更新的字段` });
    }
    patches.push({ id, data: result.data });
  }

  // 落库前统一确认存在性，避免「前 6 项已写入、第 7 项 id 不存在」的半途状态
  await assertContentDocumentsExist(
    collection,
    patches.map((patch) => patch.id),
  );

  let updated = 0;
  for (const patch of patches) {
    await collection.doc(patch.id).update(patch.data);
    updated += 1;
  }

  return { code: 0, data: { collection: schema.name, updated } };
});
