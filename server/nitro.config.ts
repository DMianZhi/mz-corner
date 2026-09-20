import { defineNitroConfig } from 'nitropack/config'
import { config } from 'dotenv'

config()

export default defineNitroConfig({
  compatibilityDate: '2026-04-23',
  // consola 在 server/package.json 的 dependencies 里，Nitro 默认把它外置（external）。
  // 而云函数目录不带 node_modules（也不该带），必须内联进产物，
  // 否则云端报：Cannot find package 'consola' imported from /var/task/code/nitro/index.mjs。
  // 本地跑得通是因为 Node 会向上找到仓库的 node_modules——所以本地通过 ≠ 云端可用，
  // build:unicloud 里另有一道裸导入扫描守住这个不变量。
  externals: {
    inline: ['consola'],
  },
  publicAssets: [
    {
      dir: '../client/dist',
      baseURL: '/',
      maxAge: 0,
    },
  ],
  runtimeConfig: {
    logLevel: '3',
    projectId: '',
    appBaseEndpoint: '<endpoint>',
    nitro: {
      envPrefix: '',
    },
    // 博客数据源配置（运行期经 plugins/data-source.ts 注入数据层）
    blog: {
      provider: process.env.BLOG_DATA_PROVIDER || 'wps365',
      wps: {
        fileId: process.env.WPS_BLOG_FILE_ID || '',
        // 留空 = 未显式指定：运行期由数据层回退到 WPS_TRANSPORT 环境变量。
        // 不可写死 'cli'——Nitro 会把构建期取值内联进产物，运行期再配 WPS_TRANSPORT 将被覆盖。
        transport: process.env.WPS_TRANSPORT || '',
        cliBin: process.env.WPS_CLI_BIN || 'kdocs-comate-cli',
        endpoint: process.env.WPS_TOOL_ENDPOINT || '',
        apiToken: process.env.WPS_API_TOKEN || '',
        requestSourceEnc: process.env.WPS_REQUEST_SOURCE_ENC || '',
        clientId: process.env.WPS_CLIENT_ID || '',
        cliVersion: process.env.WPS_CLI_VERSION || '',
      },
      // WPS 365 Open API（企业账号通道；refresh_token 长期有效，运行期换 access_token）
      wps365: {
        baseUrl: process.env.WPS365_BASE_URL || '',
        clientId: process.env.WPS365_CLIENT_ID || '',
        clientSecret: process.env.WPS365_CLIENT_SECRET || '',
        refreshToken: process.env.WPS365_REFRESH_TOKEN || '',
        accessToken: process.env.WPS365_ACCESS_TOKEN || '',
      },
    },
  },
})
