/**
 * 数据仓储入口：provider 注册表 + 工厂。
 *
 * 上层只调用 getBlogRepository()，具体用哪个服务商由 BLOG_DATA_PROVIDER 决定。
 * 接入新服务商只需两步：
 *   1. 在 data/providers/<name>/ 实现 BlogRepository 接口
 *   2. registerBlogProvider('<name>', () => new XxxRepository())
 * 无需改动 service / route 任何代码。
 */
import { dataSourceProviderName } from "./config";
import { WpsBlogRepository } from "./providers/wps";
import type { BlogRepository } from "./types";

export type BlogRepositoryFactory = () => BlogRepository;

const registry = new Map<string, BlogRepositoryFactory>();

/** 注册一个数据源实现 */
export function registerBlogProvider(name: string, factory: BlogRepositoryFactory): void {
  registry.set(name.toLowerCase(), factory);
}

/** 已注册的数据源名称 */
export function listBlogProviders(): string[] {
  return [...registry.keys()];
}

/** 当前生效的数据源名称（注入值 → 环境变量 → 默认 wps） */
export function activeBlogProviderName(): string {
  return dataSourceProviderName();
}

// 内置实现：WPS 多维表
registerBlogProvider("wps", () => new WpsBlogRepository());

let cached: BlogRepository | undefined;
let cachedName = "";

/** 获取当前数据仓储（按名称缓存实例） */
export function getBlogRepository(): BlogRepository {
  const name = activeBlogProviderName();
  if (cached && cachedName === name) return cached;

  const factory = registry.get(name);
  if (!factory) {
    throw new Error(
      `未知的数据源 BLOG_DATA_PROVIDER="${name}"，可用值：${listBlogProviders().join(", ")}`
    );
  }

  cached = factory();
  cachedName = name;
  return cached;
}

/** 清空实例缓存（测试或运行时切换配置后使用） */
export function resetBlogRepository(): void {
  cached = undefined;
  cachedName = "";
}

export * from "./types";
