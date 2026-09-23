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
 *   --skip-client                   跳过前端构建（复用现有 client/dist）
 *   --skip-hosting                  跳过前端静态托管上传
 *   --skip-db                       跳过数据库集合 Schema 上传
 *   --skip-verify                   跳过部署后自检
 *
 * 前置:
 *   1. HBuilderX 至少打开过仓库根目录一次（`cli project list` 里能看到项目名）
 *   2. uniCloud-<provider> 已关联服务空间（HBuilderX 里关联一次即可，之后不再需要界面操作）
 *   3. .env 里配好 UNICLOUD_SPACE_ID（前端静态托管上传需要它）
 *
 * 踩过的坑（2026-09-23）：这个脚本一度只传云函数，**不管前端静态托管**。
 *   于是「改了前端 → 跑 deploy:unicloud → 以为上线了」实际线上还是旧页面。
 *   更阴的是 build:unicloud 只把 client/dist 拷进云函数，**从不构建前端**：
 *   忘了单独跑 pnpm build，传上去的就是上一版 dist（连文件名都还是旧的）。
 *   现在：默认构建前端 → 传云函数 → 传静态托管，一步到位。
 *   另注：静态托管的 index.html 有 CDN 缓存（实测 age 381 / cachetime 1119），
 *   刚传完裸 URL 可能仍是旧入口，属正常，等回源或用控制台刷新缓存。
 *
 * 说明:
 *   官方文档称 uniCloud CLI「仅适用于 linux 命令行调用」，实测 Windows 桌面端自带的
 *   cli.exe（HBuilderX 5.26）同样支持 `cloud functions --upload`，本项目即用它部署。
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
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
const provider = args.provider || process.env.UNICLOUD_PROVIDER || "alipay";
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

// 0. 前端构建（必须先于 build:unicloud —— 后者只是把 client/dist 拷进云函数，不负责构建）
if (!args["skip-build"] && !args["skip-client"]) {
  console.log("→ 构建前端产物 client/dist");
  const build = spawnSync("pnpm", ["--filter", "@mz-corner/client", "build"], {
    cwd: root,
    stdio: "inherit",
    shell: true,
  });
  if (build.status !== 0) fail("前端构建失败（可用 --skip-client 复用现有 client/dist）");
} else {
  console.log("→ 跳过前端构建（复用现有 client/dist）");
}
if (!existsSync(path.join(root, "client/dist/index.html"))) {
  fail("缺少 client/dist/index.html —— 前端产物不存在，先跑一次 pnpm run build");
}

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

// 2.5 数据库集合 Schema（放在云函数之前上传：集合先建好，新函数上线即能查到集合）
if (!args["skip-db"]) {
  const databaseSource = path.join(root, "deploy/unicloud/database");
  const databaseTarget = path.join(projectDir, "database");
  await mkdir(databaseTarget, { recursive: true });
  const schemas = existsSync(databaseSource)
    ? readdirSync(databaseSource).filter((file) => file.endsWith(".schema.json"))
    : [];
  for (const file of schemas) {
    await cp(path.join(databaseSource, file), path.join(databaseTarget, file));
  }
  console.log(`→ 已同步集合 Schema：${schemas.map((f) => f.replace(".schema.json", "")).join(", ") || "（无）"}`);
} else {
  console.log("→ 跳过集合 Schema 上传");
}

// 3. 确认 HBuilderX 认得这个项目（不认识时 CLI 只会回一句「不是有效的项目名称」）
const projectList = runCli(cliPath, ["project", "list"]);
if (!projectList.includes(projectName)) {
  fail(
    `HBuilderX 项目列表里没有「${projectName}」。\n` +
      `   现有：${projectList.split("\n").filter(Boolean).join(" / ") || "（空）"}\n` +
      "   处置：HBuilderX → 文件 → 打开目录 → 选中仓库根目录（不是 uniCloud-alipay 本身），再重试。",
  );
}

// 4. 上传集合 Schema（uniCloud 的集合必须先有 Schema 才能建，建完云函数才写得进去）
if (!args["skip-db"]) {
  for (const file of readdirSync(path.join(projectDir, "database")).filter((f) => f.endsWith(".schema.json"))) {
    const collection = file.replace(".schema.json", "");
    console.log(`→ 上传集合 Schema ${collection}`);
    // --name 要的是文件名（实测传集合名会报「schema 文件名必须以 '.schema.json' 结尾」）
    runCli(cliPath, [
      "cloud",
      "functions",
      "--upload",
      "db",
      "--prj",
      projectName,
      "--provider",
      provider,
      "--name",
      file,
    ]);
  }
}

// 5. 上传云函数（--force 覆盖；实测不带 --force 也会覆盖，加上只是显式表达意图）
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

// 6. 上传前端静态资源到前端网页托管
//    这是 SPA 的正式入口（云函数域名有 gzip 截断 bug，只能备用，详见 deploy/unicloud/README.md）。
//    必须省略 --prefix：传了会被 Windows 路径规范化搞坏，云端凭空多出 C: 目录树。
if (!args["skip-hosting"]) {
  const spaceId = args.space || process.env.UNICLOUD_SPACE_ID;
  if (!spaceId) {
    console.log("⚠ 未配置 UNICLOUD_SPACE_ID（也没有 --space），跳过静态托管上传 —— 前端不会更新！");
  } else {
    console.log(`→ 上传前端静态资源到托管空间 ${spaceId}`);
    runCli(cliPath, [
      "hosting",
      "deploy",
      "--prj",
      projectName,
      "--provider",
      provider,
      "--space",
      spaceId,
      "--source",
      "client/dist",
    ]);
  }
} else {
  console.log("→ 跳过静态托管上传");
}

// 7. 部署后自检（地址默认从服务空间 id 推导）
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

console.log("\n✔ 部署流程结束。");
console.log("  云函数 + 前端静态托管均已上传；静态托管的 index.html 有 CDN 缓存，刚传完可能仍是旧入口，等回源即可。");
console.log("  URL 化路径（/mz-api）与 SEED_TOKEN 环境变量仍需在 Web 控制台配置（CLI 不提供这两项）。");
console.log("  首次部署后还要把数据灌进云数据库：pnpm run export:init-data 生成 init_data 文件，");
console.log("  再用 cli cloud functions --initdatabase 灌入（详见 deploy/unicloud/README.md）。");

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
