#!/usr/bin/env node
/**
 * uniCloud 部署自检脚本（只读探测，不写数据）
 *
 * 用法：
 *   node scripts/verify-unicloud-deploy.mjs
 *   node scripts/verify-unicloud-deploy.mjs https://<spaceId>.dev-hz.cloudbasefunction.cn/mz-api
 *   node scripts/verify-unicloud-deploy.mjs <baseUrl> https://<前端网页托管域名>
 *
 * 注意域名：支付宝云 URL 化域名是 dev-hz.cloudbasefunction.cn，
 * api-hz.cloudbasefunction.cn 是云函数调用（uni.request/callFunction）域名，
 * 两者不通用——打到 api-hz 会得到网关 50002。
 *
 * 第二个参数（前端域名）用于校验 CORS：跨域部署时前端域名必须出现在
 * 云函数的「安全域名」配置里，同时要与云函数环境变量 CORS_ORIGIN 一致。
 */

const DEFAULT_BASE = "https://<unicloud-space-id>.dev-hz.cloudbasefunction.cn/mz-api";

const positional = process.argv.slice(2).filter((arg) => !arg.startsWith("-"));
const baseUrl = (positional[0] || process.env.DEPLOY_BASE_URL || DEFAULT_BASE).replace(/\/+$/, "");
const origin = positional[1] || "";
const TIMEOUT_MS = 20000;

const results = [];

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function probe(path, init) {
  const url = `${baseUrl}${path}`;
  const startedAt = Date.now();
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const text = await res.text();
    return { url, status: res.status, headers: res.headers, text, ms: Date.now() - startedAt };
  } catch (err) {
    return { url, error: err instanceof Error ? err.message : String(err), ms: Date.now() - startedAt };
  }
}

/** 把接口返回的 message 映射成可执行的处置建议 */
function diagnose(response) {
  if (response.error) {
    if (/ENOTFOUND|getaddrinfo|EAI_AGAIN/.test(response.error)) {
      return "域名解析失败：检查 URL 化地址是否正确、服务空间是否存在";
    }
    if (/timeout|aborted|ETIMEDOUT/.test(response.error)) {
      return "请求超时：云函数可能未部署、URL 化未开启，或支付宝云默认域名被限流";
    }
    return `网络错误：${response.error}`;
  }
  const body = response.text || "";
  if (/50002|HTTP访问服务/.test(body)) {
    return "支付宝云网关 50002：云函数未部署 / URL 化路由未生效 / HTTP 访问服务未开启。依次确认：① HBuilderX 上传云函数；② 控制台「云函数 → 详情 → 配置访问路径」= /mz-api；③ 「环境管理 → 访问服务」开启 HTTP 访问服务。另：URL 化域名是 dev-hz（api-hz 是云函数调用域名，打到那边必然 50002）";
  }
  if (/Cannot find package/.test(body)) {
    const pkg = body.match(/Cannot find package '([^']+)'/)?.[1] || "某依赖";
    return `云函数产物缺依赖（${pkg}）：产物必须自包含，重新执行 pnpm run build:unicloud（已加自包含检查）并重新上传云函数`;
  }
  if (/spawn \/bin\/sh/.test(body)) {
    return "transport 仍为 cli：云函数环境变量 WPS_TRANSPORT=http 未生效";
  }
  if (/code=401/.test(body)) {
    return "工具网关令牌失效：重走 auth-guide 换取后更新 WPS_API_TOKEN（必要时连同 WPS_REQUEST_SOURCE_ENC、WPS_CLIENT_ID）";
  }
  if (/需要 WPS_API_TOKEN/.test(body)) {
    return "令牌未配置：在云函数环境变量里补 WPS_API_TOKEN（注意变量名拼写）";
  }
  if (response.status === 404) {
    return "404：URL 化路径前缀与请求路径不匹配，检查前缀是否与 baseUrl 一致（或设 UNICLOUD_URL_PREFIX）";
  }
  if (response.status === 403) {
    return "403：可能是安全域名 / 防盗链配置拦截，或支付宝云默认域名限流";
  }
  if (response.status >= 500) {
    return `HTTP ${response.status}：${body.slice(0, 140).replace(/\s+/g, " ")} —— 云函数日志可看到根因`;
  }
  return `HTTP ${response.status}：${body.slice(0, 160).replace(/\s+/g, " ")}`;
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * 拆掉「集成响应」信封。
 *
 * 云函数返回 { mpserverlessComposedResponse: true, statusCode, headers, body } 时，
 * uniCloud 网关会把它还原成真正的 HTTP 响应；若缺少该字段，客户端收到的就是
 * HTTP 200 + 这段 JSON 原文（实测踩过：500 被误读成 200）。
 * 这里统一拆封后再判定，并把「信封未被还原」单独报出来。
 */
function unwrap(response) {
  const json = parseJson(response.text || "");
  const looksEnveloped =
    json &&
    typeof json === "object" &&
    typeof json.statusCode === "number" &&
    Object.prototype.hasOwnProperty.call(json, "body");
  if (!looksEnveloped) return { ...response, enveloped: false };
  return {
    ...response,
    enveloped: true,
    status: json.statusCode,
    text: typeof json.body === "string" ? json.body : JSON.stringify(json.body ?? ""),
  };
}

console.log(`\n目标：${baseUrl}${origin ? `\n前端域名：${origin}` : ""}\n`);

/* 1. 站点配置接口 —— 最轻量，用来判断「函数是否活着 + 数据层是否通」 */
const configRes = unwrap(await probe("/api/blog/config", { headers: { Accept: "application/json" } }));
if (configRes.enveloped) {
  record(
    "集成响应信封",
    false,
    "网关未还原云函数返回的集成响应（响应是 HTTP 200 + {statusCode,body} JSON）：产物缺 mpserverlessComposedResponse: true，重新 build:unicloud 并重新上传云函数",
  );
}
if (configRes.error || configRes.status !== 200) {
  record("GET /api/blog/config", false, diagnose(configRes));
} else {
  const json = parseJson(configRes.text);
  const ok = json && json.code === 0;
  record("GET /api/blog/config", ok, ok ? `${configRes.ms}ms` : diagnose(configRes));
}

/* 2. 文章列表 —— 校验真实数据链路，顺带看是否有内容 */
const postsRes = unwrap(await probe("/api/blog/posts?page=1&pageSize=3", { headers: { Accept: "application/json" } }));
if (postsRes.error || postsRes.status !== 200) {
  record("GET /api/blog/posts", false, diagnose(postsRes));
} else {
  const json = parseJson(postsRes.text);
  const items = json?.data?.items;
  if (json?.code !== 0) {
    record("GET /api/blog/posts", false, diagnose(postsRes));
  } else if (!Array.isArray(items) || items.length === 0) {
    record("GET /api/blog/posts", false, "接口通但返回 0 条：检查多维表里是否有「已发布」文章");
  } else {
    record("GET /api/blog/posts", true, `${items.length} 条，首条标题：${items[0]?.title ?? "(无标题)"}`);
  }
}

/* 3. CORS 预检 —— 静态托管与云函数跨域时必须通过 */
const preflightOrigin = origin || "https://example.invalid";
const preflight = unwrap(await probe("/api/blog/posts", {
  method: "OPTIONS",
  headers: {
    Origin: preflightOrigin,
    "Access-Control-Request-Method": "GET",
    "Access-Control-Request-Headers": "content-type",
  },
}));
if (preflight.error) {
  record("OPTIONS 预检 (CORS)", false, diagnose(preflight));
} else {
  const acao = preflight.headers.get("access-control-allow-origin");
  const ok = Boolean(acao) && (acao === "*" || acao === preflightOrigin);
  record(
    "OPTIONS 预检 (CORS)",
    ok,
    ok
      ? `allow-origin=${acao}`
      : acao
        ? `allow-origin=${acao} 未包含 ${preflightOrigin}：改 CORS_ORIGIN 或在云函数「安全域名」里放行`
        : "响应缺少 access-control-allow-origin：前端会被浏览器拦截",
  );
}

const failed = results.filter((item) => !item.ok);
console.log(`\n${failed.length === 0 ? "全部通过" : `${failed.length}/${results.length} 项未通过`}\n`);
process.exit(failed.length === 0 ? 0 : 1);
