/**
 * 数据源配置注入点。
 *
 * 设计意图：
 * - 数据层不依赖任何 Web 框架，配置由宿主注入（Nitro 经 runtimeConfig 注入，
 *   云函数 / 测试可自行调用 configureDataSource）。
 * - 未注入时回退到环境变量，使数据层可脱离宿主独立运行（测试、独立脚本）。
 *
 * Nitro 侧请勿在业务代码里读 process.env（平台同进程可能托管多个项目），
 * 统一走 `plugins/data-source.ts` 注入。
 */

export type WpsTransportKind = "cli" | "http";

export interface WpsDataSourceConfig {
  /** 博客多维表文档 ID */
  fileId?: string;
  /** 传输方式：cli 子进程 或 http 直连工具网关 */
  transport?: WpsTransportKind;
  /** CLI 可执行文件名（transport=cli） */
  cliBin?: string;
  /** 工具网关地址（transport=http） */
  endpoint?: string;
  /** 工具网关访问令牌（transport=http） */
  apiToken?: string;
  requestSourceEnc?: string;
  clientId?: string;
  cliVersion?: string;
}

export interface DataSourceConfig {
  /** 数据源实现名，对应 data/index.ts 注册表 */
  provider?: string;
  wps?: WpsDataSourceConfig;
}

let injected: DataSourceConfig = {};

/** 注入数据源配置（宿主启动时调用一次） */
export function configureDataSource(config: DataSourceConfig): void {
  injected = {
    ...injected,
    ...config,
    wps: { ...injected.wps, ...config.wps },
  };
}

/** 当前生效的数据源实现名 */
export function dataSourceProviderName(): string {
  return (injected.provider || process.env.BLOG_DATA_PROVIDER || "wps").toLowerCase();
}

export interface ResolvedWpsConfig {
  fileId: string;
  transport: WpsTransportKind;
  cliBin: string;
  endpoint: string;
  apiToken: string;
  requestSourceEnc: string;
  clientId: string;
  cliVersion: string;
}

const WPS_DEFAULTS = {
  fileId: "<dbsheet-file-id>",
  transport: "cli" as WpsTransportKind,
  cliBin: "kdocs-comate-cli",
  endpoint: "https://<endpoint>/skill_hub/api/v1/tool",
} as const;

/**
 * 解析 WPS 数据源配置：注入值 → 环境变量 → 默认值。
 * 环境变量仅作为无宿主场景的回退，不用于 Nitro 运行期。
 */
export function resolveWpsConfig(): ResolvedWpsConfig {
  const wps = injected.wps ?? {};
  const transport = (wps.transport || process.env.WPS_TRANSPORT || WPS_DEFAULTS.transport).toLowerCase();

  return {
    fileId: wps.fileId || process.env.WPS_BLOG_FILE_ID || WPS_DEFAULTS.fileId,
    transport: transport === "http" ? "http" : "cli",
    cliBin: wps.cliBin || process.env.WPS_CLI_BIN || WPS_DEFAULTS.cliBin,
    endpoint: wps.endpoint || process.env.WPS_TOOL_ENDPOINT || WPS_DEFAULTS.endpoint,
    apiToken: wps.apiToken || process.env.WPS_API_TOKEN || "",
    requestSourceEnc: wps.requestSourceEnc || process.env.WPS_REQUEST_SOURCE_ENC || "",
    clientId: wps.clientId || process.env.WPS_CLIENT_ID || "",
    cliVersion: wps.cliVersion || process.env.WPS_CLI_VERSION || "",
  };
}

/** 仅供测试：清空注入的配置 */
export function resetDataSourceConfig(): void {
  injected = {};
}
