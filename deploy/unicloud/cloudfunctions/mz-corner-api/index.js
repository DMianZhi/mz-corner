/**
 * uniCloud 云函数入口：把 uniCloud（URL 化）事件交给 Nitro handler 处理。
 *
 * 用 CommonJS + 动态 import 包裹 Nitro 的 ESM 产物，避免依赖云函数运行时的 ESM 开关。
 * 业务逻辑全部在 nitro/ 目录（构建时注入），本文件只做协议转换。
 */

const CORS_METHODS = 'GET,POST,PATCH,OPTIONS';
const CORS_HEADERS = 'content-type,accept';

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

/** 允许的来源：默认 *（公开只读博客），可用环境变量收敛到具体域名。 */
function corsHeaders() {
  const origin = process.env.CORS_ORIGIN || '*';
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': CORS_METHODS,
    'access-control-allow-headers': CORS_HEADERS,
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
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

  const path = event.path || '/';
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

exports.main = async (event, context) => {
  const method = (event && event.httpMethod ? event.httpMethod : 'GET').toUpperCase();
  const cors = corsHeaders();

  // 浏览器预检：直接短路，不进入业务逻辑
  if (method === 'OPTIONS') {
    return { statusCode: 204, headers: cors, body: '' };
  }

  try {
    const handler = await loadHandler();
    const result = await handler(toNitroEvent(event), context);
    return {
      statusCode: result.statusCode || 200,
      headers: { ...(result.headers || {}), ...cors },
      body: result.body || '',
      isBase64Encoded: Boolean(result.isBase64Encoded),
    };
  } catch (error) {
    console.error('[mz-corner-api] 处理失败:', error && error.stack ? error.stack : error);
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json', ...cors },
      body: JSON.stringify({
        code: 1,
        message: error && error.message ? error.message : '服务异常',
      }),
    };
  }
};
