# mz-corner · 敏智的个人角落

一个以**项目为主导**的个人博客网站。不是传统的文章列表堆叠，而是把作品放在最显眼的位置——打开首页先看到你是谁、你做过什么，文章退居为二级入口。

> 在线预览：项目导向首页 · 横向项目长廊 · 暗色画廊设计

## 设计概念：暗室色标

深色画廊基底（`#0A0A0B`）+ 酸性黄绿信号色（`#C8F542`），每个项目拥有一枚专属标志色方块——像暗房里冲洗照片时的色标卡，冷静克制但有记忆点。

- **Hero**：错位大字排版 + 鼠标视差 + 坐标/SCROLL 元信息
- **项目长廊**：纵向滚动驱动横向位移，卡片随鼠标 3D 倾斜 + 高光追踪，底部进度条随当前项目变色
- **文章**：窄栏阅读排版 + 阅读进度条 + Markdown 渲染（表格/代码块/复制按钮）+ 上一篇/下一篇连续阅读
- **骨架屏**：与真实内容像素级对齐（隐形字符撑几何 + 微光色块条），数据加载零跳动
- **细节**：磁吸邮箱（统一指针状态机，快速甩动不闪烁）、SVG 图标库、深浅双主题、`prefers-reduced-motion` 降级

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 19 · Vite · Tailwind CSS 4 · HashRouter |
| 后端 | Nitro 2（h3）· 静态托管 + API 一体 |
| 数据 | uniCloud 云数据库（文章 / 评论 / 项目 / 站点配置 四个集合） |
| 工具链 | pnpm workspace · oxlint · TypeScript · Vitest |

## 快速开始

```bash
# 安装依赖
pnpm install

# 开发模式（前端 5917 + 后端 4917）
pnpm run dev

# 质量检查
pnpm run lint
pnpm run check:types
pnpm test

# 构建前端（产物在 client/dist）
pnpm run build
```

### 环境变量

数据源是**同服务空间的云数据库**，句柄由云函数运行时注入，本地开发与测试**不需要任何凭据**。

```ini
# 可选：数据源实现（默认 unicloud-db）
BLOG_DATA_PROVIDER=unicloud-db
```

只有「B 路数据导入」需要 `SEED_TOKEN`（配在云函数环境变量上，且**只能在 Web 控制台配**——
CLI 与云函数目录里的 `.env` 都传不上去，实测）。不想碰控制台就走 A 路：用
`init_data.json` + CLI `--initdatabase` 灌数据，见 [部署文档](deploy/unicloud/README.md)。

## 数据层架构

数据访问按「路由 → 业务 → 仓储 → 数据源」四层组织，数据源实现被完全隔离：

```
routes/api/blog/*.ts        仅 HTTP 语义：参数解析、状态码、错误响应
        ↓
services/blog-service.ts    业务规则：筛选、排序、输入清洗、阅读数计算
        ↓
data/index.ts               provider 注册表 + 工厂（按 BLOG_DATA_PROVIDER 选择）
data/types.ts               领域模型 + BlogRepository 接口（数据源无关契约）
        ↓
data/providers/unicloud-db/ uniCloud 云数据库实现
  ├── collections.ts        集合名 / 分页 / 语义常量
  ├── client.ts             数据库句柄获取（云函数运行时注入 uniCloud 全局）
  ├── mappers.ts            云数据库文档 ↔ 领域模型（类型归一 + 缺省兜底）
  ├── admin.ts              批量导入用：清空 / 计数 / 批量写入
  └── repository.ts         组装为 BlogRepository
```

**切换数据源**：在 `data/providers/<name>/` 实现 `BlogRepository` 接口，然后
`registerBlogProvider('<name>', () => new XxxRepository())`，把 `BLOG_DATA_PROVIDER` 指向它即可——
service 与 route 零改动。

**字段名即领域模型**：集合里存的就是 `title` / `content` / `viewCount` 这样的领域字段，
控制台里看到的数据可直接排障。读取侧仍做类型归一（数据库是 schemaless 的，
控制台手改可能塞进非预期类型）。

**配置注入**：数据层不读运行期 `process.env`（平台可能同进程托管多个项目），
由 `nitro.config.ts` 的 `runtimeConfig.blog` 声明、`plugins/data-source.ts` 启动时注入。
环境变量仅在无宿主场景（测试、独立脚本）作为回退。

**运行位置约束**：`unicloud-db` 依赖 `uniCloud` 全局，因此**真实数据访问只在 uniCloud 云函数里可用**。
本地开发/自检由 `scripts/local-unicloud-harness.mjs` 注入内存假库（`globalThis.uniCloud`）。

### 测试

```bash
pnpm test                 # 前后端一起跑（服务端 23 + 客户端 12）
cd server && pnpm test    # 仅后端：业务规则 + 传输解析
cd client && pnpm test    # 仅前端：Markdown 渲染器 + 相邻篇选取
```

两端都**不依赖真实数据源、不需要 jsdom**，可在 CI 与本地离线跑：

- **服务端**（23 个用例）：业务层通过 `registerBlogProvider` 注入内存假仓储，验证筛选 / 排序 / 输入清洗等规则。
- **客户端**（12 个用例）：`Markdown` 用 `react-dom/server` 渲染后断言输出（如表格单元格里的转义竖线
  `\|` 不被拆列）；`adjacentOf` 覆盖最新 / 最旧 / 单篇 / 空表 / id 缺失五种边界。

## 目录结构

```
├── client/               # 前端
│   └── src/
│       ├── components/   # Nav / Hero / ProjectGallery / Markdown / Skeletons / icon ...
│       ├── pages/        # HomePage / ArticlesPage / PostPage / ArchivePage / AboutPage
│       ├── services/     # blog-api.ts（相对路径 ./api/...）
│       ├── types/        # blog.ts 领域类型
│       ├── utils/        # cn / post-nav（相邻篇选取，含单测）
│       └── styles/       # global.css（设计变量与排版体系）
├── server/               # Nitro 后端
│   ├── routes/api/blog/  # posts / projects / comments / view / config
│   ├── services/         # blog-service.ts 业务规则（含单元测试）
│   ├── data/             # 数据层：接口 + provider 注册表
│   │   └── providers/unicloud-db/  # 云数据库实现（collections / client / mappers / admin / repository）
│   └── plugins/          # data-source.ts：启动时把配置注入数据层
├── scripts/              # 构建 / 部署 / 自检脚本
├── deploy/unicloud/      # 云函数产物 + database/*.schema.json
└── docs/designs/         # DESIGN.md 设计规范
```

## 部署

线上形态：**静态前端（前端网页托管）+ API（云函数）+ 数据（同服务空间云数据库）**。
完整步骤（含数据导入）见 [`deploy/unicloud/README.md`](deploy/unicloud/README.md)。

```bash
pnpm run build:unicloud           # 产出 deploy/unicloud/cloudfunctions/mz-corner-api
pnpm run deploy:unicloud          # 构建 + 同步产物 + 上传集合 Schema + CLI 上传 + 自检

# 数据导入（两条路，详见部署文档「步骤 4」）
node scripts/export-init-data.mjs --in payload.json   # A: 领域文档 → init_data.json，再走 CLI --initdatabase
# B: POST /api/admin/seed（幂等可重跑，需云函数环境变量 SEED_TOKEN）

# 前端（uniCloud 前端网页托管；CLI 可直接传，见部署文档「步骤 6」）
cd client && rm -rf dist && VITE_API_BASE=<URL化地址> pnpm run build && cd ..
# 省略 --prefix 即传到云空间根目录（写 --prefix / 会被路径规范化搞坏）
"<HBuilderX>/cli.exe" hosting deploy --prj mz-corner --provider alipay \
  --space <unicloud-space-id> --source client/dist
```

线上入口：<https://<unicloud-space-id>-static.normal.cloudstatic.cn/>
（`/` 会 302 到 `/index.html`——该托管的「索引文件」是路径语义，这个尾巴消不掉，已实测接受。
控制台静态站点「索引文件」须为 `index.html`，填带目录的路径会把 `/FlappyBird/`、`/password_tools/`
一起拼坏。详见部署文档「步骤 6」）

云函数 `package.json` 的 `cloudfunction-config` 已声明 `runtime: Nodejs18`、`path: /mz-api`
（URL 化前缀）、`timeout: 20`；部署后用只读自检脚本验证：

```bash
node scripts/verify-unicloud-deploy.mjs <URL化地址> [前端域名]
```

云函数侧环境变量只需两个：

```ini
SEED_TOKEN=<批量导入令牌>
CORS_ORIGIN=<静态站域名>
```

> **跨域**：支付宝云网关会直接应答 OPTIONS 预检（适配层的预检短路在云端不会执行，
> 官方 URL 化文档也没有跨域配置项），所以前端写请求用 `text/plain` 发 JSON
> ——CORS 简单请求不触发预检；服务端 `readJsonBody` 对 `application/json` 与
> `text/plain` 都能解析，其他客户端不受影响。细节见
> [`deploy/unicloud/README.md`](deploy/unicloud/README.md)。

### 本地开发与自检

```bash
pnpm run harness:unicloud                              # 终端 A：内存假库 + 模拟 uniCloud 事件（:8899）
pnpm run verify:unicloud http://127.0.0.1:8899/mz-api  # 终端 B：跑自检
```

### 为什么不做独立服务器部署

云数据库只能以云函数身份（服务空间）访问，uniCloud 没有公开的数据库 REST API，
所以 `unicloud-db` 在普通 VPS 上拿不到数据。若要在云主机上跑，需另实现一个走 HTTP 的数据源
（Postgres / SQLite / 自建 API 皆可）——`BlogRepository` 契约与 provider 注册表就是为这种替换留的。

## License

MIT
