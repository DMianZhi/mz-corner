#!/usr/bin/env node
/**
 * uniCloud 部署自检脚本（只读探测，不写数据）
 *
 * 用法：
 *   node scripts/verify-unicloud-deploy.mjs
 *   node scripts/verify-unicloud-deploy.mjs https://<spaceId>.dev-hz.cloudbasefunction.cn/mz-api
 *   node scripts/verify-unicloud-deploy.mjs <baseUrl> https://<前端网页托管域名>
 *
 * 地址来源优先级：命令行参数 > 环境变量（UNICLOUD_URL_BASE / UNICLOUD_STATIC_HOST）> 报错退出。
 * 环境变量从仓库根 .env 读取（cp .env.example .env 后填值），也可直接 pnpm run verify:unicloud。
 *
 * 注意域名：支付宝云 URL 化域名是 dev-hz.cloudbasefunction.cn，
 * api-hz.cloudbasefunction.cn 是云函数调用（uni.request/callFunction）域名，
 * 两者不通用——打到 api-hz 会得到网关 50002。
 *
 * 第二个参数（前端域名）用于校验跨域：实测支付宝云网关会**直接应答 OPTIONS 预检**
 * （不存在的路径也回 200 空体、不进云函数），我方适配层的预检短路在云端不会执行。
 * 因此前端改用 `text/plain` 发 JSON（CORS 简单请求，不触发预检）——本脚本校验的正是
 * 「简单请求能否跨域读到响应」，即真实请求响应里的 access-control-allow-origin。
 * OPTIONS 的探测结果只作为已知现象的提示，不计入失败。
 */

const positional = process.argv.slice(2).filter((arg) => !arg.startsWith("-"));
const rawBase = positional[0] || process.env.UNICLOUD_URL_BASE;
if (!rawBase) {
  console.error(
    [
      "缺少接口地址，任选其一：",
      "  1. 命令行参数：node scripts/verify-unicloud-deploy.mjs https://<spaceId>.dev-hz.cloudbasefunction.cn/mz-api",
      "  2. 环境变量：cp .env.example .env 并填 UNICLOUD_URL_BASE，再跑 pnpm run verify:unicloud",
    ].join("\n"),
  );
  process.exit(1);
}
const baseUrl = rawBase.replace(/\/+$/, "");
const origin = positional[1] || process.env.UNICLOUD_STATIC_HOST || "";
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
  if (/uniCloud 运行时不可用/.test(body)) {
    return "云函数里拿不到 uniCloud 全局：确认上传的是 uniCloud 云函数且运行环境正确；本地自检请用 scripts/local-unicloud-harness.mjs（它会注入内存假库）";
  }
  if (/未知的数据源/.test(body)) {
    return "数据源名不认识：检查 BLOG_DATA_PROVIDER（或 NITRO_BLOG_PROVIDER）是否拼错，目前内置实现只有 unicloud-db";
  }
  if (response.status === 404) {
    return "404：URL 化路径前缀与请求路径不匹配，检查前缀是否与 baseUrl 一致（或设 UNICLOUD_URL_PREFIX）";
  }
  if (response.status === 403) {
    return "403：云函数拒绝了请求（防盗链 / 域名限流 / 权限），云函数日志可看到根因";
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

/* 0. 健康检查 —— 最先看「函数是否活着 + 数据源是否就绪」 */
const healthRes = unwrap(await probe("/api/health", { headers: { Accept: "application/json" } }));
if (healthRes.error || healthRes.status !== 200) {
  record("GET /api/health", false, diagnose(healthRes));
} else {
  const json = parseJson(healthRes.text);
  const data = json?.data ?? {};
  const ok = json?.code === 0 && data.ok === true;
  record(
    "GET /api/health",
    ok,
    ok
      ? `provider=${data.provider} database=${data.database}`
      : `数据源未就绪：provider=${data.provider ?? "?"} database=${data.database ?? "?"}（云数据库不可用时数据层会显式报错而非返回空数据）`,
  );
}

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
    record(
      "GET /api/blog/posts",
      false,
      "接口通但返回 0 条：检查云数据库 articles 集合是否有 status=published 的文章",
    );
  } else {
    record("GET /api/blog/posts", true, `${items.length} 条，首条标题：${items[0]?.title ?? "(无标题)"}`);
  }
}

/*
 * 3. 跨域 —— 校验「真实请求的响应带 access-control-allow-origin」。
 *
 * 这是浏览器能否读到跨域响应的充要条件（简单请求场景）；预检那条路已确认被网关截住，
 * 前端因此改走简单请求（text/plain），所以这里不再把 OPTIONS 结果当作失败。
 */
const probeOrigin = origin || "https://example.invalid";
const crossOrigin = unwrap(await probe("/api/blog/config", { headers: { Origin: probeOrigin } }));
if (crossOrigin.error) {
  record("跨域响应头 (CORS)", false, diagnose(crossOrigin));
} else {
  const acao = crossOrigin.headers.get("access-control-allow-origin");
  const ok = Boolean(acao) && (acao === "*" || acao === probeOrigin);
  record(
    "跨域响应头 (CORS)",
    ok,
    ok
      ? `allow-origin=${acao}${origin ? `（含前端域名 ${origin}）` : ""}`
      : acao
        ? `allow-origin=${acao} 不含 ${probeOrigin}：把云函数环境变量 CORS_ORIGIN 设为前端域名`
        : "响应缺 access-control-allow-origin：浏览器读不到跨域响应（检查云函数环境变量 CORS_ORIGIN，以及请求是否真的到达云函数）",
  );
}

// 预检探测：仅作已知现象提示，不计入失败
const preflight = unwrap(await probe("/api/blog/posts", {
  method: "OPTIONS",
  headers: {
    Origin: probeOrigin,
    "Access-Control-Request-Method": "POST",
    "Access-Control-Request-Headers": "content-type",
  },
}));
const preflightAcao = preflight.error ? "" : preflight.headers.get("access-control-allow-origin");
console.log(
  preflightAcao
    ? `• OPTIONS 预检 — allow-origin=${preflightAcao}（网关放行，非必需）`
    : "• OPTIONS 预检 — 网关直接应答、无 CORS 头（已知现象，前端已用简单请求规避；仅影响带 application/json 的跨域写请求）",
);

const failed = results.filter((item) => !item.ok);
console.log(`\n${failed.length === 0 ? "全部通过" : `${failed.length}/${results.length} 项未通过`}\n`);
process.exit(failed.length === 0 ? 0 : 1);
