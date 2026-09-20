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
 *   node scripts/local-unicloud-harness.mjs stripped 8899 --in-place   # 就地加载（仅调试用）
 *
 * 隔离：默认把产物拷到仓库外的临时目录再加载。否则 Node 会沿目录树向上找到仓库的
 * node_modules，把「云端缺依赖」这类问题掩盖掉（实测踩过：本地全绿、上传后 500
 * Cannot find package 'consola'）。
 *
 * 另一个终端配合自检脚本：
 *   node scripts/verify-unicloud-deploy.mjs http://127.0.0.1:8899/mz-api
 *
 * 说明：本脚本只做只读转发，不写数据；令牌可用占位值，用来观察失败诊断是否符合预期。
 */

import { rmSync } from "node:fs";
import { cp, mkdir, rm } from "node:fs/promises";
import http from "node:http";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { installFakeUnicloudDatabase } from "./fake-unicloud-db.mjs";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARTIFACT = path.join(repoRoot, "deploy/unicloud/cloudfunctions/mz-corner-api");
const PREFIX = "/mz-api";
const EMPTY = Object.create(null);

const args = process.argv.slice(2);
const inPlace = args.includes("--in-place");
const positional = args.filter((a) => !a.startsWith("--"));
const mode = positional[0] === "full" ? "full" : "stripped";
const port = Number(positional[1] || 8899);

// 数据层读的是云函数运行时注入的全局 uniCloud，本地没有——先装上内存假库，
// 否则任何读数据的路由都会 500（而不是「返回空列表」，这是刻意的：见 client.ts）。
const fakeDatabase = installFakeUnicloudDatabase();

const { cloudFunction, entry } = await loadCloudFunction();

async function loadCloudFunction() {
  if (inPlace) {
    return { cloudFunction: require(path.join(ARTIFACT, "index.js")), entry: ARTIFACT };
  }
  const sandbox = path.join(os.tmpdir(), `mz-corner-api-harness-${process.pid}`);
  await rm(sandbox, { recursive: true, force: true });
  await mkdir(sandbox, { recursive: true });
  await cp(ARTIFACT, sandbox, { recursive: true });
  const cleanup = () => {
    try {
      rmSync(sandbox, { recursive: true, force: true });
    } catch {
      // 清理失败不影响结论
    }
  };
  process.on("exit", cleanup);
  return { cloudFunction: require(path.join(sandbox, "index.js")), entry: sandbox };
}

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

// 端口占用是最容易踩的坑（上一次的模拟器进程不会自己退出），给一条能直接照做的提示
server.on("error", (error) => {
  if (error?.code === "EADDRINUSE") {
    console.error(`端口 ${port} 已被占用：可能上一次的模拟器还在运行。先结束它，或换端口重跑（如 8900）`);
    process.exit(1);
  }
  throw error;
});

server.listen(port, () => {
  console.log(`本地 uniCloud 模拟器已启动：http://127.0.0.1:${port}${PREFIX}`);
  console.log(`event.path 形态：${mode === "full" ? "含前缀" : "已剥离"}`);
  console.log(`适配层：${entry}${inPlace ? "（就地加载，未隔离）" : "（已隔离到仓库外临时目录）"}`);
  console.log(
    `假数据库：已注入 globalThis.uniCloud（集合 ${fakeDatabase.names().join(", ")}；` +
      `文章 ${fakeDatabase.count("articles")} 条，含 1 条草稿、1 条历史中文状态值）`,
  );
  // seed 端点需要 SEED_TOKEN 才启用（未设置时返回 404），启动时说明清楚，
  // 免得把「功能关闭」误读成「路由没注册」
  console.log(`seed 端点：${process.env.SEED_TOKEN ? "已启用（SEED_TOKEN 已设置）" : "关闭（未设置 SEED_TOKEN）"}`);
  console.log(`自检：node scripts/verify-unicloud-deploy.mjs http://127.0.0.1:${port}${PREFIX}`);
});
