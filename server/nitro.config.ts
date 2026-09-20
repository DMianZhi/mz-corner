import { defineNitroConfig } from 'nitropack/config'
import { config } from 'dotenv'

config()

export default defineNitroConfig({
  compatibilityDate: '2026-04-23',
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
      provider: process.env.BLOG_DATA_PROVIDER || 'wps',
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
    },
  },
})
