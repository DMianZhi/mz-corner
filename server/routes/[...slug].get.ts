/**
 * SPA fallback：非 /api 的未知路径回退到 index.html，由前端路由接管。
 *
 * 为什么需要这个文件：
 * - 云函数本身伺服前端 SPA（publicAssets → client/dist）。
 * - 静态中间件只伺服 assets 表里登记过的文件（index.html、/assets/*），
 *   /admin、/posts/xxx 这类前端路由路径不在表里，会落到路由表 404。
 * - Nitro 没有 Nuxt 那种 spaFallback 选项，catch-all 路由是标准解法。
 *
 * 实现注意（踩过的坑）：
 * - 不能用 useStorage('assets:public')：aws-lambda 预设下该 storage 表是空的
 *   （_assets = {}），getItem 永远返回 null。静态中间件走的是构建期 assets
 *   元数据表 + readAsset（相对 nitro 目录读 ../public/ 文件）。
 * - 这里复刻 readAsset 的做法：从 import.meta.url 定位 nitro 目录，读
 *   ../public/index.html。本地 dev（nitro-dev）下没有该目录，读不到就 404，
 *   dev 模式由 vite 伺服 SPA，不依赖这里。
 *
 * 优先级说明（radix3 路由树）：
 * - 静态中间件先于路由表执行：/、/assets/* 已被伺服，到不了这里。
 * - 具体路由优先于 catch-all：/api/health 等仍走各自 handler。
 * - 只有「中间件没接住 + 路由表没匹配」的 GET 才落到这里。
 *
 * /api/* 保持 404 语义：API 的 404 是 JSON 错误响应，
 * 回退成 HTML 会破坏客户端的错误解析（admin-api.ts 按 content-type 分流）。
 */
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export default defineEventHandler(async (event) => {
  const path = event.path.split('?')[0]
  if (path.startsWith('/api/') || path === '/api') {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }

  try {
    const nitroDir = dirname(fileURLToPath(import.meta.url))
    const html = await readFile(resolve(nitroDir, '../public/index.html'), 'utf8')
    setResponseHeader(event, 'content-type', 'text/html; charset=utf-8')
    return html
  } catch {
    // dev 模式或产物缺文件：保持 404，不掩盖问题
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }
})
