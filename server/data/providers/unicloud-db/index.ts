/**
 * uniCloud 云数据库 provider。
 *
 * 这是当前唯一的数据源实现：博客与数据库在同一个服务空间内，
 * 云函数通过运行时注入的全局 `uniCloud` 直接访问，不涉及任何外部凭据或第三方 API。
 */
export { UnicloudDbBlogRepository } from "./repository";
export { clearCollection, countDocuments, fetchAll, insertDocuments } from "./admin";
export {
  getDatabase,
  isDatabaseAvailable,
  resetUniCloudDatabase,
  setUniCloudDatabase,
  type DbCollection,
  type DbDocument,
  type UniCloudDatabase,
} from "./client";
export { ARTICLE_STATUS, COLLECTIONS, LIMITS, PAGE_SIZE, SITE_CONFIG_KEYS } from "./collections";
