#!/usr/bin/env node
/**
 * 一条命令部署云函数到 uniCloud（走 HBuilderX 自带的 cli，不需要点图形界面）。
 *
 * 用法:
 *   node scripts/deploy-unicloud.mjs [选项]
 *
 * 选项:
 *   --provider <alipay|aliyun|tcb>  云商，默认 alipay
 *   --prj <名称>                    HBuilderX 中的项目名，默认 mz-corner
 *   --name <名称>                   云函数名，默认 mz-corner-api
 *   --url <URL化地址>               部署后的自检地址，默认由服务空间 id 推导
 *   --cli <路径>                    HBuilderX cli 可执行文件路径
 *   --skip-build                    跳过 build:unicloud（复用现有产物）
 *   --skip-verify                   跳过部署后自检
 *
 * 前置:
 *   1. HBuilderX 至少打开过仓库根目录一次（`cli project list` 里能看到项目名）
 *   2. uniCloud-<provider> 已关联服务空间（HBuilderX 里关联一次即可，之后不再需要界面操作）
 *
 * 说明:
 *   官方文档称 uniCloud CLI「仅适用于 linux 命令行调用」，实测 Windows 桌面端自带的
 *   cli.exe（HBuilderX 5.26）同样支持 `cloud functions --upload`，本项目即用它部署。
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { cp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** provider 代号 → uniCloud 项目目录名（注意 CLI 用 tcb，目录用 tencent） */
const PROJECT_DIR = { alipay: "uniCloud-alipay", aliyun: "uniCloud-aliyun", tcb: "uniCloud-tencent" };
/** provider 代号 → URL 化默认域名后缀 */
const URL_SUFFIX = {
  alipay: "dev-hz.cloudbasefunction.cn",
  aliyun: "bspapp.com",
  tcb: "service.tcloudbase.com",
};

const args = parseArgs(process.argv.slice(2));
const provider = args.provider || "alipay";
const projectName = args.prj || "mz-corner";
const functionName = args.name || "mz-corner-api";

if (!PROJECT_DIR[provider]) {
  fail(`不支持的 provider: ${provider}（可选：${Object.keys(PROJECT_DIR).join(" | ")}）`);
}

const cliPath = args.cli || process.env.HBX_CLI || findCli();
if (!cliPath) {
  fail(
    "找不到 HBuilderX cli。请用 --cli <路径> 或环境变量 HBX_CLI 指定，例如：\n" +
      "   --cli \"C:/Users/<你>/HBuilderX/cli.exe\"",
  );
}
console.log(`→ HBuilderX cli: ${cliPath}`);

// 1. 构建产物（含自包含检查，云端缺依赖会在这里直接失败）
if (!args["skip-build"]) {
  console.log("→ 构建云函数产物");
  execFileSync(process.execPath, ["scripts/build-unicloud.mjs"], { cwd: root, stdio: "inherit" });
} else {
  console.log("→ 跳过构建（复用现有产物）");
}

// 2. 同步产物到 uniCloud 项目目录（CLI 从这个目录读本地函数）
const sourceDir = path.join(root, "deploy/unicloud/cloudfunctions", functionName);
const projectDir = path.join(root, PROJECT_DIR[provider]);
const targetDir = path.join(projectDir, "cloudfunctions", functionName);
if (!existsSync(sourceDir)) fail(`产物不存在：${path.relative(root, sourceDir)}（先跑一次不带 --skip-build）`);
await rm(targetDir, { recursive: true, force: true });
await mkdir(path.dirname(targetDir), { recursive: true });
await cp(sourceDir, targetDir, { recursive: true });
console.log(`→ 已同步产物到 ${path.relative(root, targetDir)}`);

// 3. 确认 HBuilderX 认得这个项目（不认识时 CLI 只会回一句「不是有效的项目名称」）
const projectList = runCli(cliPath, ["project", "list"]);
if (!projectList.includes(projectName)) {
  fail(
    `HBuilderX 项目列表里没有「${projectName}」。\n` +
      `   现有：${projectList.split("\n").filter(Boolean).join(" / ") || "（空）"}\n` +
      "   处置：HBuilderX → 文件 → 打开目录 → 选中仓库根目录（不是 uniCloud-alipay 本身），再重试。",
  );
}

// 4. 上传（--force 覆盖；实测不带 --force 也会覆盖，加上只是显式表达意图）
console.log(`→ 上传云函数 ${functionName} 到 [${provider}]`);
const uploadArgs = [
  "cloud",
  "functions",
  "--upload",
  "cloudfunction",
  "--prj",
  projectName,
  "--provider",
  provider,
  "--name",
  functionName,
  "--force",
];
runCli(cliPath, uploadArgs);

// 5. 部署后自检（地址默认从服务空间 id 推导）
if (!args["skip-verify"]) {
  const url = args.url || deriveVerifyUrl(cliPath);
  if (url) {
    console.log(`→ 自检 ${url}`);
    spawnSync(process.execPath, ["scripts/verify-unicloud-deploy.mjs", url], {
      cwd: root,
      stdio: "inherit",
    });
  } else {
    console.log("⚠ 未能推导出自检地址，跳过（可用 --url 显式指定）");
  }
}

console.log("\n✔ 部署流程结束。URL 化路径与环境变量仍需在 Web 控制台配置（CLI 不提供这两项）。");

/** 从 `--list space` 输出里取服务空间 id，拼出 URL 化默认地址。 */
function deriveVerifyUrl(cliPath) {
  const out = runCli(cliPath, [
    "cloud",
    "functions",
    "--list",
    "space",
    "--prj",
    projectName,
    "--provider",
    provider,
  ]);
  const spaceId = out.match(/\((env-[0-9a-z]+)\)/i)?.[1];
  if (!spaceId) return null;
  const prefix = process.env.UNICLOUD_URL_PREFIX || configuredPath() || "/mz-api";
  return `https://${spaceId}.${URL_SUFFIX[provider]}${prefix}`;
}

/**
 * 读产物 package.json 里的 cloudfunction-config.path。
 * 注意它**不负责**真正配 URL 化（那必须在 Web 控制台做），只能当默认前缀用。
 */
function configuredPath() {
  const manifest = path.join(sourceDir, "package.json");
  if (!existsSync(manifest)) return null;
  try {
    return JSON.parse(readFileSync(manifest, "utf8"))["cloudfunction-config"]?.path || null;
  } catch {
    return null;
  }
}

/**
 * 执行 CLI 并回显输出。
 *
 * 注意：CLI 失败时不一定以非 0 退出码表达——实测上传失败是 stdout 里的
 * `-1:cloud functions:上传失败：...`（退出码仍为 0），所以这里额外扫这一行。
 */
function runCli(cliPath, cliArgs) {
  const result = spawnSync(cliPath, cliArgs, { cwd: root, encoding: "utf8" });
  const stdout = result.stdout || "";
  const stderr = result.stderr || "";
  const output = `${stdout}${stderr}`.trim();
  if (output) console.log(indent(output));
  if (result.error) fail(`调用 cli 失败：${result.error.message}`);
  const failure = output.split("\n").find((line) => line.trim().startsWith("-1:"));
  if (failure) fail(failure.trim());
  return stdout;
}

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      i += 1;
    }
  }
  return parsed;
}

function findCli() {
  const candidates = [
    path.join(os.homedir(), "HBuilderX", "cli.exe"),
    "C:/HBuilderX/cli.exe",
    "C:/Program Files/HBuilderX/cli.exe",
    "/Applications/HBuilderX.app/Contents/MacOS/cli",
    "/opt/HBuilderX/cli",
  ];
  return candidates.find((candidate) => existsSync(candidate)) || null;
}

function indent(text) {
  return text
    .split("\n")
    .map((line) => `   ${line}`)
    .join("\n");
}

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}
