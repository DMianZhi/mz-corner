# uniCloud 部署指南（方案 B）

静态前端走 **前端网页托管**（CDN + HTTPS），数据接口走 **云函数**（Nitro 产物 + 适配层）。
数据仍存放在 WPS 多维表，浏览器只与本项目的 API 通信。

```
浏览器
 ├── 静态资源 ──→ uniCloud 前端网页托管（client/dist）
 └── /api/blog/* ──→ 云函数 mz-corner-api（Nitro handler）──→ WPS 工具网关 ──→ 多维表
```

## 为什么不用 CLI 二进制

沙箱内的 `kdocs-comate-cli` 无法在云函数里执行，因此云函数使用 `WPS_TRANSPORT=http`，
直连工具网关（与 CLI 调用的是同一套接口，已在沙箱内实测读写全通）。

## 前置条件

- 一个 uniCloud 服务空间（阿里云版 / 腾讯云版均可，Node.js 16+）
- 工具网关令牌三件套：`WPS_API_TOKEN`、`WPS_REQUEST_SOURCE_ENC`、`WPS_CLIENT_ID`
  - 令牌入口：<https://<endpoint>/kdocs-auth/auth-guide>
- 多维表 `file_id`（默认已在 `server/data/config.ts` 中，换文档时用 `WPS_BLOG_FILE_ID` 覆盖）

## 步骤 1：构建云函数产物

```bash
pnpm install
pnpm run build:unicloud
```

产物落在 `deploy/unicloud/cloudfunctions/mz-corner-api/`：

```
mz-corner-api/
├── index.js      适配层（uniCloud 事件 ↔ Nitro handler，含 CORS）
├── package.json
└── nitro/        Nitro 产物（aws-lambda 预设，纯 handler 无监听器）
```

> 说明：`pnpm run pack` 产出的是平台托管用的 `node-listener` 预设，不含可调用入口，
> 不能直接放进云函数；`build:unicloud` 用 `aws-lambda` 预设产出纯 `handler`。

## 步骤 2：上传云函数

把 `mz-corner-api` 整个目录放到 uniCloud 项目的 `cloudfunctions/` 下：

```
uniCloud-aliyun/cloudfunctions/mz-corner-api/
```

用 HBuilderX 右键「上传部署」，或使用 uniCloud CLI：

```bash
npx @dcloudio/uni-cloud-cli login
npx @dcloudio/uni-cloud-cli upload --space <spaceId> --function mz-corner-api
```

## 步骤 3：配置云函数环境变量

在 uniCloud 控制台 → 云函数 → `mz-corner-api` → 环境变量，添加：

| 变量 | 值 |
|---|---|
| `WPS_TRANSPORT` | `http` |
| `WPS_API_TOKEN` | 工具网关令牌 |
| `WPS_REQUEST_SOURCE_ENC` | 请求签名 |
| `WPS_CLIENT_ID` | 客户端 ID |
| `CORS_ORIGIN` | 静态站域名（不填为 `*`） |

## 步骤 4：开启云函数 URL 化

控制台 → 云函数 → `mz-corner-api` → **URL 化**，设置路径前缀（例如 `/api-mz-corner`）。
记下完整地址，形如 `https://<spaceId>.bspapp.com/api-mz-corner`。

## 步骤 5：构建并上传前端

```bash
cd client
VITE_API_BASE=https://<spaceId>.bspapp.com/api-mz-corner pnpm run build
```

把 `client/dist` 全部文件上传到 **前端网页托管**。项目使用 `HashRouter`，
所有路由都在 `#/` 之后，因此不需要配置 SPA fallback。

> 若把前端也部署在同一台服务器/同源路径下，`VITE_API_BASE` 留空即可（默认相对路径 `./api/blog`）。

## 步骤 6：验证

```bash
curl https://<spaceId>.bspapp.com/api-mz-corner/api/blog/posts   # 应返回 {"code":0,...}
curl https://<spaceId>.bspapp.com/api-mz-corner/api/blog/config  # 站点配置
```

浏览器打开静态站地址，确认首页项目、文章列表、文章详情、评论提交均正常。

## 注意事项

- **令牌有效期**：`WPS_API_TOKEN` 为会话令牌，过期后接口会返回错误（云函数日志中有明确记录）。
  上线前建议观察一天确认有效期；失效时重新走 auth-guide 换取并更新环境变量。
  若需要长期免维护，可改用方案 A（`WPS_TRANSPORT=cli`，由 CLI 自动刷新凭据）。
- **跨域**：静态托管与云函数不同源，适配层已内置 CORS（含预检短路）。
  生产环境建议把 `CORS_ORIGIN` 设为静态站域名，避免开放给任意来源。
- **写接口**：评论提交、阅读数写回是公开写操作，如需限制请自行加校验。
- **冷启动**：云函数首次调用有 300~800ms 冷启动，之后复用 Nitro 实例。
