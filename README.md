# mz-corner · 敏智的个人角落

一个以**项目为主导**的个人博客网站。不是传统的文章列表堆叠，而是把作品放在最显眼的位置——打开首页先看到你是谁、你做过什么，文章退居为二级入口。

> 在线预览：项目导向首页 · 横向项目长廊 · 暗色画廊设计

## 设计概念：暗室色标

深色画廊基底（`#0A0A0B`）+ 酸性黄绿信号色（`#C8F542`），每个项目拥有一枚专属标志色方块——像暗房里冲洗照片时的色标卡，冷静克制但有记忆点。

- **Hero**：错位大字排版 + 鼠标视差 + 坐标/SCROLL 元信息
- **项目长廊**：纵向滚动驱动横向位移，卡片随鼠标 3D 倾斜 + 高光追踪，底部进度条随当前项目变色
- **文章**：窄栏阅读排版 + 阅读进度条 + Markdown 渲染（表格/代码块/复制按钮）
- **骨架屏**：与真实内容像素级对齐（隐形字符撑几何 + 微光色块条），数据加载零跳动
- **细节**：磁吸邮箱（统一指针状态机，快速甩动不闪烁）、SVG 图标库、深浅双主题、`prefers-reduced-motion` 降级

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 19 · Vite · Tailwind CSS 4 · HashRouter |
| 后端 | Nitro 2（h3）· 静态托管 + API 一体 |
| 数据 | WPS 365 多维表（文章 / 评论 / 项目三张表） |
| 工具链 | pnpm workspace · oxlint · TypeScript |

## 快速开始

```bash
# 安装依赖
pnpm install

# 开发模式（前端 5917 + 后端 4917）
pnpm run dev

# 质量检查
pnpm run lint
pnpm run check:types

# 打包
pnpm run pack
```

### 环境变量

后端通过 `server/.env` 提供数据源认证（已 gitignore，不入库）：

```ini
# WPS 数据源（默认 provider）
SANDBOX_CREDENTIAL_RESOLVE_AUTH_TOKEN=<token>
SANDBOX_CREDENTIAL_RESOLVE_URL=<url>
WPS_SID=<sid>
```

可选配置：

```ini
BLOG_DATA_PROVIDER=wps      # 数据源实现，默认 wps
WPS_TOOL_TRANSPORT=cli      # WPS 传输方式：cli（默认，子进程）或 http
WPS_API_TOKEN=<token>       # 仅 http 传输需要
```

## 数据层架构

数据访问按「路由 → 业务 → 仓储 → 服务商」四层组织，服务商实现被完全隔离：

```
routes/api/blog/*.ts        仅 HTTP 语义：参数解析、状态码、错误响应
        ↓
services/blog-service.ts    业务规则：筛选、排序、输入清洗、阅读数计算
        ↓
data/index.ts               provider 注册表 + 工厂（按 BLOG_DATA_PROVIDER 选择）
data/types.ts               领域模型 + BlogRepository 接口（服务商无关契约）
        ↓
data/providers/wps/         WPS 多维表实现
  ├── config.ts             file_id / sheet_id / 中文字段名集中于此
  ├── mappers.ts            多维表记录 ↔ 领域模型
  ├── transport.ts          工具网关传输（CLI 子进程 / 直连 HTTP 双实现）
  └── repository.ts         组装为 BlogRepository
```

**切换数据源**：在 `data/providers/<name>/` 实现 `BlogRepository` 接口，然后
`registerBlogProvider('<name>', () => new XxxRepository())`，把 `BLOG_DATA_PROVIDER` 指向它即可——
service 与 route 零改动。

**WPS 传输方式**：`cli` 走 `kdocs-comate-cli` 子进程（需二进制）；`http` 直连工具网关
`<endpoint>/skill_hub/api/v1/tool`（需 `WPS_API_TOKEN`，适合无法执行外部二进制的环境，
如云函数）。两种传输对外行为一致，可用 `WPS_TOOL_TRANSPORT` 切换。

**配置注入**：数据层不读运行期 `process.env`（平台可能同进程托管多个项目），
由 `nitro.config.ts` 的 `runtimeConfig.blog` 声明、`plugins/data-source.ts` 启动时注入。
环境变量仅在无宿主场景（测试、独立脚本、云函数）作为回退。

### 测试

```bash
cd server && pnpm test    # 业务规则 + 传输解析（20 个用例，含内存假仓储）
```

业务层测试通过 `registerBlogProvider` 注入内存假仓储，无需真实数据源即可验证筛选/排序/清洗等规则。

## 目录结构

```
├── client/               # 前端
│   └── src/
│       ├── components/   # Nav / Hero / ProjectGallery / Markdown / Skeletons / icon ...
│       ├── pages/        # HomePage / ArticlesPage / PostPage / ArchivePage / AboutPage
│       ├── services/     # blog-api.ts（相对路径 ./api/...）
│       └── styles/       # global.css（设计变量与排版体系）
├── server/               # Nitro 后端
│   ├── routes/api/blog/  # posts / projects / comments / view / config
│   ├── services/         # blog-service.ts 业务规则（含单元测试）
│   ├── data/             # 数据层：接口 + provider 注册表
│   │   └── providers/wps/# WPS 多维表实现（config / mappers / transport / repository）
│   └── proxy-63157.mjs   # 预览代理（63157 → 4917）
└── docs/designs/         # DESIGN.md 设计规范
```

## 部署

数据层支持两种运行形态，差别只在 `WPS_TOOL_TRANSPORT`：

### 方案 A：传统服务器（transport=cli）

适合任意云主机 / VPS。用 `node-server` 预设构建——**单个进程同时提供前端与 API**：

```bash
git clone https://github.com/DMianZhi/mz-corner && cd mz-corner
pnpm install

# 构建独立服务（node-server 预设自带监听器）
cd server && pnpm run build:standalone

# 启动（默认读 PORT，缺省 3000）
WPS_SID=<你的 WPS_SID> WPS_TRANSPORT=cli PORT=4917 node .output/server/index.mjs
```

前置条件：
- `kdocs-comate-cli` 二进制放入 `PATH`（或设 `WPS_CLI_BIN` 指向绝对路径）
- `WPS_SID` 通过环境变量传入（CLI 自行处理令牌交换与刷新）
- 若希望 Nginx 托管静态文件：静态根指向 `client/dist`，`/api/` 反代到 `127.0.0.1:4917`；
  或者直接用上面单进程模式，无需额外 Web 服务器

> 注：`pnpm run pack` 产出的 `.output` 是平台托管用的 `node-listener` 预设（不含监听器，
> 由平台接管生命周期），**不适用于独立部署**；独立部署请用上述 `node-server` 预设。

### 方案 B：Serverless / 云函数（transport=http）

适合无法执行外部二进制的环境（uniCloud 云函数、Vercel Functions 等）。
完整步骤见 [`deploy/unicloud/README.md`](deploy/unicloud/README.md)。

```bash
pnpm run build:unicloud           # 产出 deploy/unicloud/cloudfunctions/mz-corner-api
pnpm run deploy:unicloud          # 一条命令：构建 + 同步 + CLI 上传 + 自检
pnpm run prepare:unicloud alipay  # 可选：重建 uniCloud 项目骨架（aliyun|tencent|alipay）
```

云函数 `package.json` 的 `cloudfunction-config` 已声明 `runtime: Nodejs18`、`path: /mz-api`
（URL 化前缀）、`timeout: 20`；上传部署后可用自检脚本验证：

```bash
node scripts/verify-unicloud-deploy.mjs <URL化地址> [前端域名]
```

云函数侧环境变量：

```ini
WPS_TRANSPORT=http
WPS_API_TOKEN=<工具网关令牌>
WPS_REQUEST_SOURCE_ENC=<请求签名>
WPS_CLIENT_ID=<客户端 ID>
```

该模式直连 `<endpoint>/skill_hub/api/v1/tool`，无需 CLI。
令牌获取：`https://<endpoint>/kdocs-auth/auth-guide`（浏览器授权，账号登录后回调下发，支持刷新）。

注意：`WPS_TRANSPORT` 必须是 `http`（云函数里没有 `/bin/sh` 与 CLI 二进制，留空会全量 500）；
令牌失效时接口返回 500 且 `message` 为 `code=401 Unauthorized`，不会静默返回空列表。
排查表见 [`deploy/unicloud/README.md`](deploy/unicloud/README.md#排查)。

### 两种形态已验证的行为

| 项目 | cli | http |
|---|---|---|
| 文章列表 / 项目 / 配置读取 | ✅ | ✅ |
| 阅读数写回 / 评论创建 | ✅ | ✅ |
| 独立启动（`node-server` 预设） | ✅ 前端+API 单进程 | 同上 |

## License

MIT
