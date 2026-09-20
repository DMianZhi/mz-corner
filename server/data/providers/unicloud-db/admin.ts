/**
 * 云数据库管理操作：清空 / 批量写入 / 计数。
 *
 * 与仓储（repository.ts）分开的理由：仓储服务于「博客读写」这条线上路径，
 * 这里是「数据迁移与自检」的一次性工具，权限更高、调用频率极低，混在一起
 * 容易让人误以为业务代码也能随便清表。
 */
import { getDatabase, type DbCollection, type DbDocument } from "./client";
import { PAGE_SIZE } from "./collections";

/**
 * 翻页拉全量。
 *
 * 不用「一次 get 拉完」：各云商对单次返回条数的上限不一致（100/1000），
 * 依赖它会在数据变多后静默截断。max 是硬上限，防死循环。
 */
export async function fetchAll(
  collection: DbCollection,
  condition: Record<string, unknown>,
  max: number,
): Promise<DbDocument[]> {
  const documents: DbDocument[] = [];
  for (let offset = 0; offset < max; offset += PAGE_SIZE) {
    const size = Math.min(PAGE_SIZE, max - offset);
    const { data } = await collection.where(condition).skip(offset).limit(size).get();
    const batch = Array.isArray(data) ? data : [];
    documents.push(...batch);
    if (batch.length < size) break;
  }
  return documents;
}

/** 清空集合。逐条删，避免依赖各云商对「无条件下删除」的不同限制。 */
export async function clearCollection(name: string, max = 10000): Promise<number> {
  const collection = getDatabase().collection(name);
  const documents = await fetchAll(collection, {}, max);
  for (const document of documents) {
    await collection.doc(document._id).remove();
  }
  return documents.length;
}

/** 批量写入。串行写入以便失败时定位到具体文档。 */
export async function insertDocuments(
  name: string,
  documents: Array<Record<string, unknown>>,
): Promise<number> {
  const collection = getDatabase().collection(name);
  let inserted = 0;
  for (const document of documents) {
    await collection.add(document);
    inserted += 1;
  }
  return inserted;
}

/** 统计集合条数 */
export async function countDocuments(name: string): Promise<number> {
  const { total } = await getDatabase().collection(name).count();
  return Number.isFinite(total) ? total : 0;
}
