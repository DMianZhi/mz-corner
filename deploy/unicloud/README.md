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

（`pnpm run prepare:unicloud aliyun` 会直接生成这个骨架目录。）

然后在 HBuilderX 里：

1. **文件 → 打开目录**，选中 `uniCloud-aliyun`
2. 若提示未关联服务空间：右键 `uniCloud-aliyun` → **关联云服务空间或项目**
3. 右键 `cloudfunctions/mz-corner-api` → **上传部署**（快捷键 `Ctrl+U`）

> **关于 CLI**：DCloud 只在 **Linux** 提供可上传 uniCloud 云函数的 CLI
> （<https://hx.dcloud.net.cn/cli/README>，用途是服务器上做 CI 自动化）；
> Windows / macOS 桌面端只能走 HBuilderX 图形界面。
> npm 上**不存在** `@dcloudio/uni-cloud-cli` 这个包，不要按旧文档去找。

## 步骤 3：配置云函数环境变量

在 uniCloud 控制台 → 云函数 → `mz-corner-api` → 环境变量，添加：

| 变量 | 值 |
|---|---|
| `WPS_TRANSPORT` | `http` |
| `WPS_API_TOKEN` | 工具网关令牌 |
| `WPS_REQUEST_SOURCE_ENC` | 请求签名 |
| `WPS_CLIENT_ID` | 客户端 ID |
| `CORS_ORIGIN` | 静态站域名（不填为 `*`） |

> **变量名语义**（已在本地对构建产物实测）：
> `WPS_TRANSPORT` 等 `WPS_*` 变量由数据层在**运行期**读取，云函数控制台配置即可生效。
> 如果你想用 Nitro 原生的 runtimeConfig 覆盖写法，对应名字是 `BLOG_WPS_TRANSPORT`（多一层 `BLOG_` 前缀），
> 两者等效。
>
> 切忌把 `WPS_TRANSPORT` 留空或写成 `cli`：云函数里既没有 `/bin/sh` 也没有 CLI 二进制，
> 所有 `/api/blog/*` 会直接 500（日志里是 `spawn /bin/sh ENOENT`）。

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

- **令牌有效期**：`WPS_API_TOKEN` 为会话令牌，过期后接口会返回 500，
  `message` 为 `WPS 工具调用失败: code=401 Unauthorized`（云函数日志同样有记录）。
  失效时重新走 auth-guide 换取并更新环境变量。
  若需要长期免维护，可改用方案 A（`WPS_TRANSPORT=cli`，由 CLI 自动刷新凭据）。
- **跨域**：静态托管与云函数不同源，适配层已内置 CORS（含预检短路）。
  生产环境建议把 `CORS_ORIGIN` 设为静态站域名，避免开放给任意来源。
- **写接口**：评论提交、阅读数写回是公开写操作，如需限制请自行加校验。
- **冷启动**：云函数首次调用有 300~800ms 冷启动，之后复用 Nitro 实例。

## 排查

部署后接口不通，先看云函数日志里的 `message`，基本可以直接定位：

| 现象 | 原因 | 处理 |
|---|---|---|
| 500 + `spawn /bin/sh ENOENT` | transport 仍是 `cli`（变量没配、名字写错） | 确认 `WPS_TRANSPORT=http` 已生效 |
| 500 + `WPS 工具调用失败: code=401 Unauthorized` | 令牌失效 / 未授权 | 重走 auth-guide，更新 `WPS_API_TOKEN`（必要时同时更新 `WPS_REQUEST_SOURCE_ENC`、`WPS_CLIENT_ID`） |
| 500 + `HTTP 传输需要 WPS_API_TOKEN 环境变量` | 令牌变量没配或名字写错 | 检查变量名与作用域（要配在 `mz-corner-api` 上） |
| 接口 200 但列表恒为空 | 旧版本会静默吞掉网关失败码 | 重新构建并上传（当前版本已改为抛错，不再静默返回空） |
| 前端报 CORS | `CORS_ORIGIN` 与静态站域名不一致 | 把 `CORS_ORIGIN` 改成静态站实际域名，或留空为 `*` |

本地自检（无需真实令牌，验证产物能否加载、路由与 CORS 是否正常）：

```bash
WPS_TRANSPORT=http node -e "const m=require('./deploy/unicloud/cloudfunctions/mz-corner-api');m.main({path:'/api/blog/posts',httpMethod:'OPTIONS',headers:{}},).then(r=>console.log(r.statusCode))"
```
