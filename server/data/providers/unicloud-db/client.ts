/**
 * uniCloud 云数据库访问层。
 *
 * 只做一件事：拿到当前运行时的数据库句柄。
 *
 * 设计要点：
 * - 云函数运行时由平台注入全局 `uniCloud`，**不需要任何 SDK 依赖**（云函数目录不带
 *   node_modules，多一个依赖就多一份内联风险）。
 * - 类型用「结构化最小子集」描述，只声明本层用到的 API，避免为了类型引入 uniCloud SDK。
 * - 本地测试/脚本用 setUniCloudDatabase() 注入假实现，数据层因此可脱离云函数运行。
 */

/** 数据库文档：至少含 _id，其余字段由集合约定 */
export interface DbDocument {
  _id: string;
  [field: string]: unknown;
}

export interface DbListResult {
  data: DbDocument[];
}

/** where 之后的链式查询（get / count / remove） */
export interface DbQuery {
  skip(count: number): DbQuery;
  limit(count: number): DbQuery;
  get(): Promise<DbListResult>;
  count(): Promise<{ total: number }>;
  remove(): Promise<{ deleted?: number }>;
}

/** 单文档引用 */
export interface DbDocumentRef {
  get(): Promise<DbListResult>;
  update(patch: Record<string, unknown>): Promise<{ updated?: number }>;
  remove(): Promise<{ deleted?: number }>;
}

export interface DbCollection extends DbQuery {
  where(condition: Record<string, unknown>): DbQuery;
  doc(id: string): DbDocumentRef;
  add(document: Record<string, unknown>): Promise<{ id?: string; _id?: string }>;
}

export interface UniCloudDatabase {
  collection(name: string): DbCollection;
}

interface UniCloudGlobal {
  database?: () => UniCloudDatabase;
}

let injected: UniCloudDatabase | undefined;
let cached: UniCloudDatabase | undefined;

/**
 * 取当前运行时的数据库句柄。
 *
 * 失败时抛出明确错误而不是返回 undefined——数据层的问题应该在调用点立刻暴露，
 * 而不是退化成「查不到数据」这种难以定位的表现。
 */
export function getDatabase(): UniCloudDatabase {
  if (injected) return injected;
  if (cached) return cached;

  const runtime = (globalThis as { uniCloud?: UniCloudGlobal }).uniCloud;
  if (!runtime || typeof runtime.database !== "function") {
    throw new Error(
      "uniCloud 运行时不可用：本函数只能在 uniCloud 云函数中执行，" +
        "或先调用 setUniCloudDatabase() 注入实现（本地测试/脚本场景）",
    );
  }

  cached = runtime.database();
  return cached;
}

/** 运行时是否具备数据库能力（供健康检查与诊断使用，不抛错） */
export function isDatabaseAvailable(): boolean {
  if (injected) return true;
  try {
    getDatabase();
    return true;
  } catch {
    return false;
  }
}

/** 注入数据库实现（本地测试、独立脚本） */
export function setUniCloudDatabase(database: UniCloudDatabase): void {
  injected = database;
}

/** 清空注入与缓存（测试用） */
export function resetUniCloudDatabase(): void {
  injected = undefined;
  cached = undefined;
}
