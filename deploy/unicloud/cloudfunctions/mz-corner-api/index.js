/**
 * uniCloud 云函数入口：把 uniCloud（URL 化）事件交给 Nitro handler 处理。
 *
 * 用 CommonJS + 动态 import 包裹 Nitro 的 ESM 产物，避免依赖云函数运行时的 ESM 开关。
 * 业务逻辑全部在 nitro/ 目录（构建时注入），本文件只做协议转换。
 */

const CORS_METHODS = 'GET,POST,PATCH,OPTIONS';
const CORS_HEADERS = 'content-type,accept';

/**
 * 云函数 URL 化路径前缀。
 *
 * 各家云商对前缀的剥离行为不一致：有的传进来的 event.path 已去掉前缀（'/api/blog/posts'），
 * 有的仍是完整路径（'/mz-api/api/blog/posts'）。这里做幂等剥离——两种形态都能正确路由，
 * 控制台改了前缀时同步改这个环境变量即可。
 */
const URL_PREFIX = (process.env.UNICLOUD_URL_PREFIX || '/mz-api').replace(/\/+$/, '');

function normalizePath(rawPath) {
  const path = rawPath || '/';
  if (URL_PREFIX && (path === URL_PREFIX || path.startsWith(`${URL_PREFIX}/`))) {
    return path.slice(URL_PREFIX.length) || '/';
  }
  return path;
}

/** Nitro 产物只在首次调用时加载，冷启动后复用。 */
let handlerPromise;
function loadHandler() {
  if (!handlerPromise) {
    handlerPromise = import('./nitro/index.mjs').then((mod) => {
      if (typeof mod.handler !== 'function') {
        throw new Error('Nitro 产物缺少 handler 导出，请重新执行 pnpm run build:unicloud');
      }
      return mod.handler;
    });
  }
  return handlerPromise;
}

/**
 * 允许的来源：默认回显请求 Origin（配合 credentials 场景；公开只读博客不受影响），
 * 可用环境变量 CORS_ORIGIN 收敛到固定域名。
 *
 * 为什么默认回显而不是 `*`：管理后台的会话 Cookie 需要 credentials: 'include'，
 * 而 CORS 规范禁止 `ACAO: *` 与 credentials 同用（浏览器直接拒收响应）。
 * 回显 Origin 等效于「允许任意源跨域读」，但满足 credentials 的语法要求；
 * 需要收敛时配 CORS_ORIGIN 即可（仅匹配该源才回显，其余源无 ACAO 头）。
 */
function corsHeaders(event) {
  const configured = process.env.CORS_ORIGIN;
  const rawOrigin = event && event.headers ? (event.headers.Origin || event.headers.origin) : undefined;
  const origin = String(rawOrigin || '');
  const allow = configured ? (origin === configured ? origin : '') : (origin || '*');
  const headers = {
    'access-control-allow-methods': CORS_METHODS,
    'access-control-allow-headers': CORS_HEADERS,
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
  if (allow) headers['access-control-allow-origin'] = allow;
  return headers;
}

/**
 * 把 uniCloud 事件规整为 Nitro（aws-lambda 预设）期望的事件结构。
 * uniCloud 的事件接近 API Gateway v1，此处补齐 Nitro 依赖的字段。
 */
function toNitroEvent(event = {}) {
  const headers = {};
  for (const [key, value] of Object.entries(event.headers || {})) {
    headers[key.toLowerCase()] = value;
  }
  if (!headers.host) headers.host = 'localhost';

  const path = normalizePath(event.path);
  const query = event.queryStringParameters || {};

  return {
    path,
    httpMethod: (event.httpMethod || 'GET').toUpperCase(),
    headers,
    queryStringParameters: query,
    multiValueQueryStringParameters: Object.fromEntries(
      Object.entries(query).map(([k, v]) => [k, [v]]),
    ),
    body: event.body || null,
    isBase64Encoded: Boolean(event.isBase64Encoded),
    requestContext: { http: { method: (event.httpMethod || 'GET').toUpperCase(), path } },
  };
}

/**
 * uniCloud 集成响应包装。
 *
 * 必须带 mpserverlessComposedResponse: true —— 否则 uniCloud 会把整个对象
 * 当成普通 JSON body 返回，HTTP 状态码恒为 200。实测现象：函数返回
 * {statusCode:500,...} 时，客户端收到的是 200 + 这段 JSON 原文。
 * 文档：云函数 URL 化 → url化返回值 → 返回集成响应。
 */
function composedResponse({ statusCode = 200, headers = {}, body = '', isBase64Encoded = false } = {}) {
  return {
    mpserverlessComposedResponse: true,
    isBase64Encoded: Boolean(isBase64Encoded),
    statusCode,
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  };
}

/**
 * 预压缩响应体（修复网关 gzip 截断 bug）。
 *
 * 实测（2026-09-22）：支付宝云 URL 化网关对大响应（如 366KB 的 SPA 主 JS）会
 * 自行 gzip，但 **Content-Length 仍是未压缩大小**（366721 vs 实际 ~117KB），
 * 客户端等不满声明字节即断流：curl exit 18（transfer closed with outstanding
 * data）、Chrome 报 net::ERR_HTTP2_PROTOCOL_ERROR，SPA module script 加载失败
 * → 整站白屏。Chrome 默认带 Accept-Encoding: gzip，必中。
 *
 * 解法（2026-09-22 最终版）：**适配层不做任何压缩**。
 *
 * 演进史（三次实测，别再走回头路）：
 * 1. 不压缩 → 网关压大文件但 Content-Length 错 → 大 JS 断流白屏
 *    （已解：静态资源迁 CDN，云函数域名只发 API JSON，均为小响应）
 * 2. 适配层预压缩 + 正确 Content-Length → 网关对「base64+gzip+length」断流
 * 3. 适配层预压缩 + 不设 length → 网关**无视 Content-Encoding 再压一遍**，
 *    双重 gzip（实测 body 两层 1f8b），浏览器 JSON 解析失败
 *
 * 结论：网关的 gzip 行为不可控（见压缩就压、不看 Content-Encoding），
 * 唯一自洽的形态是「明文出函数，让网关自己压」。API JSON 体量小，
 * 网关压缩正确（chunked + 单层 gzip，实测可解）。
 */

exports.main = async (event, context) => {
  const method = (event && event.httpMethod ? event.httpMethod : 'GET').toUpperCase();
  const cors = corsHeaders(event);

  // 浏览器预检：直接短路，不进入业务逻辑。
  //
  // 注意：**支付宝云 URL 化网关会先截住 OPTIONS**（实测：对不存在的路径发 OPTIONS 也回
  // 200 空体 + content-type: application/json，而同一路径的 GET 会打到函数并回 500），
  // 所以这段在云端不会被执行、预检头也补不上。前端因此改用 text/plain 发 JSON
  // （CORS 简单请求，不触发预检）。保留这段是为了本地 harness 与其他宿主。
  if (method === 'OPTIONS') {
    return composedResponse({ statusCode: 204, headers: cors });
  }

  try {
    const handler = await loadHandler();
    const result = await handler(toNitroEvent(event), context);
    // Nitro（aws-lambda 预设）把 set-cookie 放进 multiValueHeaders，
    // 其余头在 headers。uniCloud 集成响应只认单层 headers，
    // 必须把 multiValueHeaders 合并进来，否则登录 Set-Cookie 会被静默丢弃。
    const mergedHeaders = { ...(result.headers || {}), ...cors };
    const multi = result.multiValueHeaders || {};
    for (const [key, values] of Object.entries(multi)) {
      if (Array.isArray(values) && values.length > 0) {
        mergedHeaders[key] = values.length === 1 ? values[0] : values.join(', ');
      }
    }
    return composedResponse({
      statusCode: result.statusCode || 200,
      headers: mergedHeaders,
      body: result.body,
      isBase64Encoded: result.isBase64Encoded,
    });
  } catch (error) {
    console.error('[mz-corner-api] 处理失败:', error && error.stack ? error.stack : error);
    return composedResponse({
      statusCode: 500,
      headers: { 'content-type': 'application/json', ...cors },
      body: JSON.stringify({
        code: 1,
        message: error && error.message ? error.message : '服务异常',
      }),
    });
  }
};
