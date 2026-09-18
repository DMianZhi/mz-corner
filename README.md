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

后端通过 `server/.env` 提供 WPS CLI 认证（已 gitignore，不入库）：

```ini
SANDBOX_CREDENTIAL_RESOLVE_AUTH_TOKEN=<token>
SANDBOX_CREDENTIAL_RESOLVE_URL=<url>
WPS_SID=<sid>
```

数据存储在 WPS 多维表中，通过 `kdocs-comate-cli` 读写，`server/utils/blog-db.ts` 封装了全部数据访问。

## 目录结构

```
├── client/               # 前端
│   └── src/
│       ├── components/   # Nav / Hero / ProjectGallery / Markdown / Skeletons / icon ...
│       ├── pages/        # HomePage / ArticlesPage / PostPage / ArchivePage / AboutPage
│       ├── services/     # blog-api.ts（相对路径 ./api/...）
│       └── styles/       # global.css（设计变量与排版体系）
├── server/               # Nitro 后端
│   ├── routes/api/blog/  # posts / projects / comments / view
│   ├── utils/blog-db.ts  # 多维表数据访问层
│   └── proxy-63157.mjs   # 预览代理（63157 → 4917）
└── docs/designs/         # DESIGN.md 设计规范
```

## License

MIT
