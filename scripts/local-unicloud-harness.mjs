#!/usr/bin/env node
/**
 * 本地 uniCloud 事件模拟器 —— 把云函数适配层挂到本地 HTTP 服务上，便于离线自检。
 *
 * 用途：uniCloud 云函数无法在本地直接 curl（需要 URL 化 + 服务空间），
 * 该脚本用 Node 内置 http 复刻云商传入的 event 结构，调用真实的适配层与 Nitro 产物，
 * 从而在本地验证「产物能否加载、路由是否命中、CORS 是否正常、错误是否可诊断」。
 *
 * 用法：
 *   node scripts/local-unicloud-harness.mjs                 # 默认 8899 端口，模拟平台已剥离前缀
 *   node scripts/local-unicloud-harness.mjs full 8899       # 模拟平台把 /mz-api 前缀也传进来
 *   node scripts/local-unicloud-harness.mjs stripped 8900
 *
 * 另一个终端配合自检脚本：
 *   node scripts/verify-unicloud-deploy.mjs http://127.0.0.1:8899/mz-api
 *
 * 说明：本脚本只做只读转发，不写数据；令牌可用占位值，用来观察失败诊断是否符合预期。
 */

import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENTRY = path.join(repoRoot, "deploy/unicloud/cloudfunctions/mz-corner-api/index.js");
const PREFIX = "/mz-api";
const EMPTY = Object.create(null);

const mode = process.argv[2] === "full" ? "full" : "stripped";
const port = Number(process.argv[3] || 8899);

const cloudFunction = require(ENTRY);

const server = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);

  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  // full: 平台把 URL 化前缀一起传进来；stripped: 平台已剥离前缀
  const eventPath =
    mode === "full" ? url.pathname : url.pathname.replace(new RegExp(`^${PREFIX}`), "") || "/";

  const event = {
    path: eventPath,
    httpMethod: req.method,
    headers: req.headers,
    queryStringParameters: Object.fromEntries(url.searchParams),
    body: Buffer.concat(chunks).toString("utf8") || undefined,
  };

  const result = await cloudFunction.main(event, EMPTY);
  res.writeHead(result.statusCode, result.headers);
  res.end(result.body);
});

server.listen(port, () => {
  console.log(`本地 uniCloud 模拟器已启动：http://127.0.0.1:${port}${PREFIX}`);
  console.log(`event.path 形态：${mode === "full" ? "含前缀" : "已剥离"}`);
  console.log(`适配层：${ENTRY}`);
  console.log(`自检：node scripts/verify-unicloud-deploy.mjs http://127.0.0.1:${port}${PREFIX}`);
});
