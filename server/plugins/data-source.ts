/**
 * 数据源配置注入插件。
 *
 * 平台可能在同一进程托管多个项目，因此运行期不读 process.env——
 * 配置统一由 nitro.config.ts 的 runtimeConfig 声明，在这里注入数据层。
 * 数据层本身不依赖 Nitro，注入后即可与框架解耦运行。
 */
import { resetBlogRepository } from "~~/data";
import { configureDataSource, type WpsTransportKind } from "~~/data/config";

interface BlogRuntimeConfig {
  provider?: string;
  wps?: {
    fileId?: string;
    transport?: string;
    cliBin?: string;
    endpoint?: string;
    apiToken?: string;
    requestSourceEnc?: string;
    clientId?: string;
    cliVersion?: string;
  };
}

export default defineNitroPlugin(() => {
  const runtime = useRuntimeConfig();
  const blog = (runtime.blog ?? {}) as BlogRuntimeConfig;
  const wps = blog.wps ?? {};
  const transport: WpsTransportKind = wps.transport === "http" ? "http" : "cli";

  configureDataSource({
    provider: blog.provider || "wps",
    wps: {
      fileId: wps.fileId,
      transport,
      cliBin: wps.cliBin,
      endpoint: wps.endpoint,
      apiToken: wps.apiToken,
      requestSourceEnc: wps.requestSourceEnc,
      clientId: wps.clientId,
      cliVersion: wps.cliVersion,
    },
  });

  // 配置可能晚于首次访问，清掉可能已缓存的仓储实例
  resetBlogRepository();

  logger.info(`Data source plugin initialized (provider=${blog.provider || "wps"}, transport=${transport})`);
});
