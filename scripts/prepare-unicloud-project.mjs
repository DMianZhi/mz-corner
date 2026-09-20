#!/usr/bin/env node
/**
 * 生成可直接用 HBuilderX 打开的 uniCloud 项目骨架。
 *
 * 用法: node scripts/prepare-unicloud-project.mjs [aliyun|tencent|alipay]
 * 产物: uniCloud-<provider>/cloudfunctions/mz-corner-api/
 *
 * 之后在 HBuilderX 中「文件 → 打开目录」选中 uniCloud-<provider> 的上级目录，
 * 右键 mz-corner-api → 上传部署。
 */
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROVIDERS = new Set(["aliyun", "tencent", "alipay"]);
const provider = process.argv[2] || "aliyun";

if (!PROVIDERS.has(provider)) {
  console.error(`不支持的 provider: ${provider}（可选：aliyun | tencent | alipay）`);
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "deploy/unicloud/cloudfunctions/mz-corner-api");
const projectDir = path.join(root, `uniCloud-${provider}`);
const target = path.join(projectDir, "cloudfunctions/mz-corner-api");

await rm(projectDir, { recursive: true, force: true });
await mkdir(path.dirname(target), { recursive: true });
await cp(source, target, { recursive: true });

await writeFile(
  path.join(projectDir, "README.md"),
  `# uniCloud 项目（${provider}）

由 \`pnpm run prepare:unicloud\` 生成，内容来自 \`deploy/unicloud/cloudfunctions/mz-corner-api\`。

## 部署

### 推荐：命令行（实测 Windows 可用）

在**仓库根目录**执行：

\`\`\`bash
pnpm run deploy:unicloud -- --provider ${provider}
\`\`\`

它会重新构建产物、同步到本目录、调 HBuilderX 自带 cli 上传，并跑一次线上自检。
前提：HBuilderX 至少打开过仓库根目录一次（项目名出现在 \`cli project list\` 里），
本目录已关联服务空间，且仓库根有 \`manifest.json\`（含 appid）。

### 备选：HBuilderX 图形界面

1. HBuilderX → 文件 → 打开目录 → 选择本目录
2. 右键 \`cloudfunctions/mz-corner-api\` → **上传部署**
   （若提示未关联服务空间，先右键 \`uniCloud-${provider}\` → 关联云服务空间或项目）

## 部署后仍必须在 Web 控制台做的两件事

1. 控制台 → 云函数 → \`mz-corner-api\` → 环境变量，添加：
   | 变量 | 值 |
   |---|---|
   | \`WPS_TRANSPORT\` | \`http\` |
   | \`WPS_API_TOKEN\` | 工具网关令牌 |
   | \`WPS_REQUEST_SOURCE_ENC\` | 请求签名 |
   | \`WPS_CLIENT_ID\` | 客户端 ID |
   | \`CORS_ORIGIN\` | 静态站域名（可选，默认 \`*\`） |

   \`WPS_TRANSPORT\` 必须为 \`http\`：云函数里没有 \`/bin/sh\` 也没有 CLI 二进制。
   令牌失效时接口返回 500 + \`code=401 Unauthorized\`（不会静默返回空列表）。

2. 控制台 → 云函数 → \`mz-corner-api\` → **URL 化**，设置路径前缀
3. 前端构建时指向该地址：

   \`\`\`bash
   cd client
   VITE_API_BASE=https://<spaceId>.bspapp.com/<你的路径前缀> pnpm run build
   \`\`\`

   把 \`client/dist\` 上传到「前端网页托管」。

完整说明见 \`deploy/unicloud/README.md\`。
`,
);

console.log(`✔ uniCloud 项目骨架已生成: ${path.relative(root, projectDir)}`);
console.log(`  云函数: ${path.relative(root, target)}`);
console.log("  下一步：pnpm run deploy:unicloud -- --provider " + provider + "（或 HBuilderX 右键上传部署）");
