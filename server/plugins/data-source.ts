/**
 * 数据源配置注入插件。
 *
 * 平台可能在同一进程托管多个项目，因此运行期不读 process.env——
 * 配置统一由 nitro.config.ts 的 runtimeConfig 声明，在这里注入数据层。
 * 数据层本身不依赖 Nitro，注入后即可与框架解耦运行。
 *
 * 云数据库不需要凭据（句柄由云函数运行时注入），所以这里只剩 provider 开关；
 * 顺带在启动日志里报告一次数据库可用性——冷启动就能看出环境是否配对，
 * 不用等第一个请求失败才发现。
 */
import { resetBlogRepository } from "~~/data";
import { configureDataSource } from "~~/data/config";
import { isDatabaseAvailable } from "~~/data/providers/unicloud-db";

interface BlogRuntimeConfig {
  provider?: string;
}

export default defineNitroPlugin(() => {
  const runtime = useRuntimeConfig();
  const blog = (runtime.blog ?? {}) as BlogRuntimeConfig;
  const provider = blog.provider || "unicloud-db";

  configureDataSource({ provider });

  // 配置可能晚于首次访问，清掉可能已缓存的仓储实例
  resetBlogRepository();

  logger.info(
    `Data source plugin initialized (provider=${provider}, db=${isDatabaseAvailable() ? "ready" : "unavailable"})`,
  );
});
