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
  // aws-lambda 预设默认不伺服静态资源（serveStatic 未开），产物里只有 API 路由。
  // 但云函数本身要伺服前端 SPA（publicAssets 指向 client/dist），
  // 不开这个，线上所有非 /api 路径（含管理页 /admin）都是 404。
  serveStatic: true,
  publicAssets: [
    {
      dir: '../client/dist',
      baseURL: '/',
      maxAge: 0,
    },
  ],
  runtimeConfig: {
    logLevel: '3',
    nitro: {
      envPrefix: '',
    },
    // 博客数据源（运行期经 plugins/data-source.ts 注入数据层）
    // 只有一个内置实现 unicloud-db，此开关仅用于将来替换数据源或测试注入。
    // 注意：runtimeConfig 的取值会被构建期内联进产物，运行期改普通环境变量无效，
    // 需要覆盖请用 NITRO_BLOG_PROVIDER（Nitro 的 envPrefix='' 前缀规则）。
    blog: {
      provider: process.env.BLOG_DATA_PROVIDER || 'unicloud-db',
    },
  },
})
