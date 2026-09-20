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
import { existsSync } from "node:fs";
import { cp, mkdir, readdir, readFile, rm } from "node:fs/promises";
import { builtinModules, createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverDir = path.join(root, "server");
const outputDir = path.join(serverDir, ".output");
const targetDir = path.join(root, "deploy/unicloud/cloudfunctions/mz-corner-api/nitro");

// Windows 下 node_modules/.bin 里只有 .CMD shim，Node 20+ 无法直接 execFileSync 执行，
// 统一用 node 跑 nitropack 的 CLI 入口，保证跨平台一致。
const nitroCli = path.join(serverDir, "node_modules/nitropack/dist/cli/index.mjs");

console.log("→ 构建 Nitro（preset=aws-lambda）");
await rm(outputDir, { recursive: true, force: true });
execFileSync(process.execPath, [nitroCli, "build"], {
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

// 自包含检查：云函数目录不带仓库的 node_modules，产物里的裸导入必须能在产物内解析。
// 本地跑得通不代表云端可用——Node 会向上找到仓库的 node_modules，
// 云端只有函数目录，于是直接 Cannot find package（实测踩过 consola）。
// 放在拷贝之前检查，失败时不会留下半成品产物。
console.log("→ 自包含检查");
const unresolvable = await findUnresolvableImports(path.join(outputDir, "server"));
if (unresolvable.length) {
  console.error("✗ 以下导入在云端会变成 Cannot find package：");
  for (const { file, specifier, reason } of unresolvable) {
    console.error(`   ${path.relative(outputDir, file)} → ${specifier}（${reason}）`);
  }
  console.error(
    "   处置：在 server/nitro.config.ts 的 externals.inline 里内联该包；不要把仓库 node_modules 拷进云函数。",
  );
  await rm(outputDir, { recursive: true, force: true });
  process.exit(1);
}
console.log("✔ 自包含检查通过");

console.log("→ 注入云函数目录");
await rm(targetDir, { recursive: true, force: true });
await mkdir(path.dirname(targetDir), { recursive: true });
await cp(path.join(outputDir, "server"), targetDir, { recursive: true });

/**
 * 找出产物内无法解析的裸导入。
 *
 * 用 Node 自身的解析算法，从「引用方文件」出发解析，并要求结果落在产物目录内；
 * 若解析到了产物外（仓库 node_modules）或根本解析不到，即视为云端会报错。
 * 覆盖 import/export ... from、动态 import()、require() 三种写法。
 */
async function findUnresolvableImports(artifactRoot) {
  const builtins = new Set([
    ...builtinModules,
    ...builtinModules.map((m) => `node:${m}`),
  ]);
  const patterns = [
    /(?:from|import)\s*["']([^"']+)["']/g,
    /import\s*\(\s*["']([^"']+)["']\s*\)/g,
    /require\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  const problems = new Map();

  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!/\.(mjs|cjs|js)$/.test(entry.name)) continue;

      const code = await readFile(full, "utf8");
      for (const re of patterns) {
        for (const m of code.matchAll(re)) {
          const spec = m[1];
          if (!spec || spec.includes("\n") || spec.includes("${")) continue;
          if (spec.startsWith(".") || spec.startsWith("/")) continue;
          if (builtins.has(spec)) continue;
          if (problems.has(spec)) continue;

          const reason = resolveOutsideArtifact(full, spec, artifactRoot);
          if (reason) problems.set(spec, { file: full, specifier: spec, reason });
        }
      }
    }
  }

  await walk(artifactRoot);
  return [...problems.values()];
}

/** 返回 null 表示可接受（能解析且落在产物内），否则返回不可接受的原因。 */
function resolveOutsideArtifact(importerFile, specifier, artifactRoot) {
  try {
    const resolved = createRequire(importerFile).resolve(specifier);
    const inside =
      resolved === artifactRoot || resolved.startsWith(artifactRoot + path.sep);
    return inside ? null : "解析到了产物目录之外";
  } catch {
    // ESM-only 包（exports 只提供 import 条件）require.resolve 会抛错，
    // 退化为「包目录是否在产物内」检查，避免误报。
    const pkgName = specifier.startsWith("@")
      ? specifier.split("/").slice(0, 2).join("/")
      : specifier.split("/")[0];
    let dir = path.dirname(importerFile);
    while (dir.startsWith(artifactRoot)) {
      if (existsSync(path.join(dir, "node_modules", pkgName))) return null;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    return "产物内找不到该包";
  }
}

// 清理：平台打包会重建 .output，留着容易混淆
await rm(outputDir, { recursive: true, force: true });

console.log(`✔ 云函数产物已就绪: ${path.relative(root, targetDir)}`);
