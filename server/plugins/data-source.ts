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
  wps365?: {
    baseUrl?: string;
    clientId?: string;
    clientSecret?: string;
    refreshToken?: string;
    accessToken?: string;
  };
}

export default defineNitroPlugin(() => {
  const runtime = useRuntimeConfig();
  const blog = (runtime.blog ?? {}) as BlogRuntimeConfig;
  const wps = blog.wps ?? {};
  const wps365 = blog.wps365 ?? {};
  // 仅在显式配置时下发；留 undefined 让数据层回退到 WPS_TRANSPORT 环境变量
  // （runtimeConfig 的构建期默认值会覆盖环境变量，所以这里不能把未知值强转成 'cli'）
  const transport: WpsTransportKind | undefined =
    wps.transport === "http" || wps.transport === "cli" ? wps.transport : undefined;

  configureDataSource({
    provider: blog.provider || "wps365",
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
    wps365: {
      baseUrl: wps365.baseUrl,
      clientId: wps365.clientId,
      clientSecret: wps365.clientSecret,
      refreshToken: wps365.refreshToken,
      accessToken: wps365.accessToken,
    },
  });

  // 配置可能晚于首次访问，清掉可能已缓存的仓储实例
  resetBlogRepository();

  logger.info(
    `Data source plugin initialized (provider=${blog.provider || "wps365"}, transport=${transport ?? "auto(env)"})`,
  );
});
