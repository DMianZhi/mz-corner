#!/usr/bin/env node
/**
 * 把 migrate-from-dbsheet.mjs 的转换结果落成 uniCloud 的「初始化数据」文件。
 *
 * 用途：在没有 SEED_TOKEN（云函数环境变量只能在 Web 控制台配置）的情况下，
 * 也能把数据灌进云数据库——走 uniCloud 原生的 `表名.init_data.json` 机制，
 * 由 CLI 的 `--initdatabase` 上传，全程不需要界面操作。
 *
 * 用法：
 *   node scripts/migrate-from-dbsheet.mjs --out /tmp/payload.json   # 只转换，不写库
 *   node scripts/export-init-data.mjs --in /tmp/payload.json        # 生成初始化文件
 *   cli cloud functions --initdatabase --prj mz-corner --provider alipay
 *
 * 产物落在 uniCloud-<provider>/database/ 下，而 uniCloud-* 已在 .gitignore 内
 * ——真实数据不会进入仓库（红线）。
 *
 * 两个关键点：
 * 1. **显式指定 `_id`**：初始化数据是「一次性写文件」，没法像 HTTP 播种那样先插文章
 *    再回读 id。所以文章 id 在这里生成，评论的 articleId 同步指向它，保证关联有效。
 * 2. 评论的 articleId 在 migrate 的中间产物里**存的是文章标题**（HTTP 播种时再换成
 *    真实 id），这里把它换成第 1 步生成的 `_id`。
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const provider = option("provider", "alipay");
const PROJECT_DIR = { alipay: "uniCloud-alipay", aliyun: "uniCloud-aliyun", tcb: "uniCloud-tencent" };
const inFile = option("in", "");
const dir = path.resolve(repoRoot, option("dir", path.join(PROJECT_DIR[provider] ?? "", "database")));

if (!inFile) {
  console.error("用法：node scripts/export-init-data.mjs --in <payload.json> [--dir <database 目录>]");
  process.exit(1);
}
if (!dir.includes("uniCloud-")) {
  console.error(`拒绝写入 ${dir}：初始化数据含真实内容，必须落在 uniCloud-<provider>/ 目录内（该目录已被 git 忽略）`);
  process.exit(1);
}

const payload = JSON.parse(readFileSync(path.resolve(inFile), "utf8"));
const articles = Array.isArray(payload.articles) ? payload.articles : [];
const projects = Array.isArray(payload.projects) ? payload.projects : [];
const siteConfig = Array.isArray(payload.siteConfig) ? payload.siteConfig : [];
const comments = Array.isArray(payload.comments) ? payload.comments : [];

// 1. 文章 id：按备份表顺序生成稳定 id（顺序稳定 ⇒ id 稳定 ⇒ 评论关联可复现）
const titleToId = new Map();
const articleDocs = articles.map((article, index) => {
  const _id = `art-${String(index + 1).padStart(2, "0")}`;
  titleToId.set(article.title, _id);
  return { _id, ...article };
});

// 2. 评论：articleId 由标题换成 _id（空标题/未命中则留空，与 HTTP 播种行为一致）
let unresolved = 0;
const commentDocs = comments.map((comment, index) => {
  const id = titleToId.get(comment.articleId) ?? "";
  if (!id) unresolved += 1;
  return { _id: `cmt-${String(index + 1).padStart(2, "0")}`, ...comment, articleId: id };
});

mkdirSync(dir, { recursive: true });

const files = [
  ["articles", articleDocs],
  ["comments", commentDocs],
  ["projects", projects],
  ["site_config", siteConfig],
];

for (const [name, docs] of files) {
  const target = path.join(dir, `${name}.init_data.json`);
  writeFileSync(target, JSON.stringify(docs, null, 2), "utf8");
  console.log(`✓ ${name}.init_data.json —— ${docs.length} 条`);
  console.log(`OUTPUT=${target}`);
}

console.log(`\n文章 id 已生成（art-01 … art-${String(articleDocs.length).padStart(2, "0")}），评论按标题完成关联`);
if (unresolved) console.warn(`⚠ ${unresolved} 条评论找不到目标文章，articleId 为空`);
console.log(`\n下一步：cli cloud functions --initdatabase --prj mz-corner --provider ${provider}`);
