/**
 * 数据源配置注入点。
 *
 * 设计意图：
 * - 数据层不依赖任何 Web 框架，配置由宿主注入（Nitro 经 runtimeConfig 注入，
 *   云函数 / 测试可自行调用 configureDataSource）。
 * - 未注入时回退到环境变量，使数据层可脱离宿主独立运行（测试、独立脚本）。
 *
 * 接入 uniCloud 云数据库后，数据源**不再需要任何凭据**：数据库句柄由云函数运行时
 * 注入（见 providers/unicloud-db/client.ts），这里只剩「用哪个 provider」一个开关。
 *
 * Nitro 侧请勿在业务代码里读 process.env（平台同进程可能托管多个项目），
 * 统一走 `plugins/data-source.ts` 注入。
 */

export interface DataSourceConfig {
  /** 数据源实现名，对应 data/index.ts 注册表 */
  provider?: string;
}

let injected: DataSourceConfig = {};

/** 注入数据源配置（宿主启动时调用一次） */
export function configureDataSource(config: DataSourceConfig): void {
  injected = { ...injected, ...config };
}

/** 当前生效的数据源实现名（注入值 → 环境变量 → 默认 unicloud-db） */
export function dataSourceProviderName(): string {
  return (injected.provider || process.env.BLOG_DATA_PROVIDER || "unicloud-db").toLowerCase();
}

/** 仅供测试：清空注入的配置 */
export function resetDataSourceConfig(): void {
  injected = {};
}
