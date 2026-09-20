#!/usr/bin/env node
/**
 * 构建 uniCloud 云函数产物。
 *
 * 1. 用 aws-lambda 预设构建 Nitro —— 产出纯 handler，不含 HTTP 监听器
 *    （node-server 预设会自带监听器，node-listener 预设不含 handler，均不适用）
 * 2. 拷贝 .output/server → deploy/unicloud/cloudfunctions/mz-corner-api/nitro
 * 3. 清理 .output，避免与平台打包（pnpm run pack）的产物互相污染
 */
import { execFileSync } from "node:child_process";
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverDir = path.join(root, "server");
const outputDir = path.join(serverDir, ".output");
const targetDir = path.join(root, "deploy/unicloud/cloudfunctions/mz-corner-api/nitro");

console.log("→ 构建 Nitro（preset=aws-lambda）");
await rm(outputDir, { recursive: true, force: true });
execFileSync(path.join(serverDir, "node_modules/.bin/nitropack"), ["build"], {
  cwd: serverDir,
  stdio: "inherit",
  env: { ...process.env, NITRO_PRESET: "aws-lambda" },
});

// capability 运行时资产（插件模块 + 实例配置）不会被 Nitro 自动打包，需单独注入
console.log("→ 注入 capability 资产");
execFileSync(process.execPath, ["scripts/copy-capability-assets.mjs"], {
  cwd: serverDir,
  stdio: "inherit",
});

console.log("→ 注入云函数目录");
await rm(targetDir, { recursive: true, force: true });
await mkdir(path.dirname(targetDir), { recursive: true });
await cp(path.join(outputDir, "server"), targetDir, { recursive: true });

// 清理：平台打包会重建 .output，留着容易混淆
await rm(outputDir, { recursive: true, force: true });

console.log(`✔ 云函数产物已就绪: ${path.relative(root, targetDir)}`);
