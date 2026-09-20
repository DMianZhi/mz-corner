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

- 一个 uniCloud 服务空间（阿里云版 / 腾讯云版 / 支付宝云版均可；本项目实测为**支付宝云**）
  - 支付宝云默认运行时就是 **Nodejs18**（云函数用到全局 `fetch`，需 Node 18+）
  - 单个云函数体积上限 **10MB**（含 `node_modules`），本项目产物约 1.6MB
  - 支付宝云/阿里云**不支持相对路径读文件**（`fs.readFileSync('./x')`），本项目已用绝对路径，不受影响
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
├── index.js      适配层（uniCloud 事件 ↔ Nitro handler，含 CORS、URL 化前缀幂等剥离）
├── package.json   含 cloudfunction-config（运行时 / URL 化路径 / 超时）
└── nitro/        Nitro 产物（aws-lambda 预设，纯 handler 无监听器）
```

`package.json` 里的 `cloudfunction-config` 会在上传时随包带到服务端：

| 字段 | 值 | 说明 |
|---|---|---|
| `runtime` | `Nodejs18` | 支付宝云默认即 Nodejs18；**只在第一次上传时生效**，之后改需删掉云端函数重新上传 |
| `timeout` | `20` | 默认仅 5 秒，冷启动 + 网关往返容易踩到；上限 120 秒 |
| `memorySize` | `512` | 支付宝云默认 512MB |
| `path` | `/mz-api` | ⚠️ **不负责 URL 化路径**，实测上传后网关仍报 50002（路由未注册）。URL 化路径必须在 Web 控制台配，见「步骤 4」 |

> 说明：`pnpm run pack` 产出的是平台托管用的 `node-listener` 预设，不含可调用入口，
> 不能直接放进云函数；`build:unicloud` 用 `aws-lambda` 预设产出纯 `handler`。

## 步骤 2：上传云函数

把 `mz-corner-api` 整个目录放到 uniCloud 项目的 `cloudfunctions/` 下：

```
uniCloud-alipay/cloudfunctions/mz-corner-api/
```

（`pnpm run prepare:unicloud alipay` 会直接生成这个骨架目录，参数换成 `aliyun` / `tencent` 即对应其他云商。）

然后在 HBuilderX 里：

1. **文件 → 打开目录**，选中 **仓库根目录 `mz-corner`**（注意：不是 `uniCloud-alipay` 本身）
2. 在左侧项目管理器展开 `uniCloud-alipay`，右键它 → **关联云服务空间或项目...**
3. 展开 `cloudfunctions`，右键 `mz-corner-api` → **上传部署**（`Ctrl+U`）

> **为什么必须打开仓库根**：uniCloud 插件的右键菜单条件是
> `workspaceFolderRelativePath =~ /^uniCloud\-(tcb|aliyun|alipay)\/cloudfunctions$/`，
> 即相对**项目根**的路径必须是 `uniCloud-alipay/cloudfunctions/...`。
> 若把 `uniCloud-alipay` 本身当项目根打开，相对路径变成 `cloudfunctions/...`，
> 菜单不会报错、只是默默不出现（上传部署、关联云服务空间都找不到）。
> 同理：右键要在**左侧项目管理器**里，且只选中 1 个节点（`explorerResourceCount == 1`）。
>
> 若菜单仍不出现：右键项目根 → **重新识别项目类型**；或 **文件 → 导入 → 从本地目录导入** 重新导入。

### 前置：项目必须有 appid（非 uni-app 项目会卡在这里）

点「关联云服务空间或项目」时若报：

```
缺少appid，请在manifest.json中设置appid
```

这不是配置问题：uniCloud 插件的关联/上传请求都要带 `appid`
（实测 `share/index.js` 的 `getAppid()` 只读 `<项目根>/manifest.json` 的 `appid` 字段，
上传请求 `/serverless/function/...` 的 body 里也带 `appid`），
而 `appid` **只能由 DCloud 云端分配**（官方文档：新建 uni-app 项目时云端分配）。
本仓库是 Vite 工程，没有这个文件，所以关联过不去。

两条路，推荐第二条：

| 方案 | 做法 | 代价 |
|---|---|---|
| **A. 给项目根补 manifest.json（实测可用）** | 从任意 uni-app 项目拷一个 `manifest.json`（带 `appid`）到项目根，再点关联 | 项目会被 HBuilderX 当成 uni-app 项目；`appid` 是账号相关文件，建议 gitignore |
| B. 用一个 uni-app 项目做部署宿主 | HBuilderX 新建 uni-app 项目 + 勾选启用 uniCloud + 服务商支付宝云 + 关联已有服务空间；再把 `mz-corner-api` 拷进它的 `uniCloud-alipay/cloudfunctions/` | 部署宿主不在仓库内（云函数本体仍由本仓库脚本生成） |

方案 A 实测路径：拷入 `manifest.json` → 右键云函数 → **上传所有云函数、公共模块及Actions**
（或单函数「上传部署」）→ 控制台输出「云函数 mz-corner-api 上传完成」即成功。
注意上传成功 ≠ 能访问，URL 化路由还得单独配，见「步骤 4」。

> 另：HBuilderX 控制台会提示「已支持通过命令行 cli 部署 uniCloud 资源」——
> 那个 CLI **仅支持 Linux**（官方文档原文：仅适用于 linux 命令行调用），Windows 上无法用。

> 产物里已带 `node_modules`（约 1.6MB），选「上传部署」即可，不必用「云端安装依赖」。
> 若 HBuilderX 提示依赖未安装，忽略即可（我们不打 npm 安装，依赖随产物一起上传）。

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
| `UNICLOUD_URL_PREFIX` | URL 化前缀，默认 `/mz-api`（改了控制台前缀才需要设） |

> **变量名语义**（已在本地对构建产物实测）：
> `WPS_TRANSPORT` 等 `WPS_*` 变量由数据层在**运行期**读取，云函数控制台配置即可生效。
> 如果你想用 Nitro 原生的 runtimeConfig 覆盖写法，对应名字是 `BLOG_WPS_TRANSPORT`（多一层 `BLOG_` 前缀），
> 两者等效。
>
> 切忌把 `WPS_TRANSPORT` 留空或写成 `cli`：云函数里既没有 `/bin/sh` 也没有 CLI 二进制，
> 所有 `/api/blog/*` 会直接 500（日志里是 `spawn /bin/sh ENOENT`）。

## 步骤 4：配置云函数 URL 化（必须手动，在 Web 控制台）

> ⚠️ 实测确认：`cloudfunction-config.path` **不会**替你配 URL 化路由。
> 云函数上传成功（控制台日志「上传完成」）后，网关仍报 `50002 函数请求不合法 / 函数路由未配置`。
> 官方文档也明确：「在 uniCloud Web 控制台进行 URL 化配置」。

1. 登录 [uniCloud 后台](https://unicloud.dcloud.net.cn/)，选择服务空间 `<unicloud-space-id>`
2. 左侧菜单【云函数】
3. 找到 `mz-corner-api` → 点【详情】→ 配置访问路径 = `/mz-api` → 保存
4. 若仍报 `50002` 并提示「HTTP访问服务开关」：到 **环境管理 → 访问服务** 打开 **HTTP 访问服务**

配好后 URL 形如：

| 云商 | URL 化默认域名 |
|---|---|
| 支付宝云 | `https://{spaceId}.dev-hz.cloudbasefunction.cn/{path}` |
| 阿里云 | `https://{spaceId}.bspapp.com/{path}` |
| 腾讯云 | `https://{spaceId}.service.tcloudbase.com/{path}` |

本项目实际使用（支付宝云，spaceId `<unicloud-space-id>`）：

```
https://<unicloud-space-id>.dev-hz.cloudbasefunction.cn/mz-api
```

> ⚠️ **别把 `dev-hz` 和 `api-hz` 搞混**（实测踩过）：
> `dev-hz.cloudbasefunction.cn` 才是 URL 化（HTTP 访问）域名；
> `api-hz.cloudbasefunction.cn` 是云函数**调用**域名（`uni.request` / `callFunction`），
> 打到 `api-hz` 上会得到网关 `50002 函数请求不合法`，看起来很像「函数没传上去」。
> 以控制台「云函数 → 详情 → 云函数URL化」里显示的域名为准。

> **前缀剥离行为**（官方文档明确）：`event.path` 是「以配置的 url 化路径为根路径」的访问路径。
> 配 `/mz-api` 后访问 `/mz-api/api/blog/posts`，云函数收到的 `event.path` 是 `/api/blog/posts`。
> 适配层做了幂等剥离，两种形态（带前缀/不带前缀）都能正确路由；
> 若你改了控制台里的前缀，记得同步设 `UNICLOUD_URL_PREFIX`。
>
> 支付宝云限制（官方文档）：请求与响应 Body 上限均为 32MB；
> 默认域名存在**全空间共享**的限流池，正式用建议绑自定义域名。

## 步骤 5：构建并上传前端

```bash
cd client
VITE_API_BASE=https://<unicloud-space-id>.dev-hz.cloudbasefunction.cn/mz-api pnpm run build
```

把 `client/dist` 全部文件上传到 **前端网页托管**，两种方式任选：

- 控制台：<https://unicloud.dcloud.net.cn> → 前端网页托管 → **上传文件 / 上传文件夹**（无需 HBuilderX）
- HBuilderX：**发行 → 上传网站到服务器**（需项目里先关联服务空间）

项目使用 `HashRouter`，所有路由都在 `#/` 之后，因此不需要配置 SPA fallback。
上传后在托管页「基础设置」里记下**默认域名**，下一步要用。

> 若把前端也部署在同一台服务器/同源路径下，`VITE_API_BASE` 留空即可（默认相对路径 `./api/blog`）。

## 步骤 6：配置安全域名（跨域）

静态托管与云函数不同源，除了适配层内置的 CORS 响应头，uniCloud 还要求在控制台放行来源：

控制台 → 云函数 → `mz-corner-api` → **安全域名 / 跨域配置** → 添加前端网页托管的域名。

未配置时浏览器会拦请求（适配层已短路处理 OPTIONS 预检，但正式请求仍会被网关拦下）。
同时建议把云函数环境变量 `CORS_ORIGIN` 设为该域名（不设则为 `*`）。

## 步骤 7：验证

仓库自带只读自检脚本（不写数据）：

```bash
node scripts/verify-unicloud-deploy.mjs \
  https://<unicloud-space-id>.dev-hz.cloudbasefunction.cn/mz-api \
  https://<前端网页托管域名>
```

它会依次探测 `config` / `posts` / CORS 预检，并把失败原因翻译成处置建议（如令牌失效、
transport 未生效、URL 前缀不匹配、产物缺依赖、集成响应未被网关还原）。
全部通过后浏览器打开静态站，确认首页项目、文章列表、文章详情、评论提交均正常。

本地不想联网时，可用 harness 模拟 uniCloud 事件：

```bash
node scripts/local-unicloud-harness.mjs            # 默认 8899，模拟平台已剥离前缀
node scripts/verify-unicloud-deploy.mjs http://127.0.0.1:8899/mz-api
```

harness 默认把产物**拷到仓库外的临时目录**再加载。这是故意的：否则 Node 会沿目录树
向上找到仓库的 `node_modules`，把「云端缺依赖」这类问题掩盖掉（实测踩过 `consola`）。
加 `--in-place` 可就地加载，仅供调试。

## 两个实测踩过的坑

### 1. 云函数产物必须自包含

云函数目录里**没有**（也不该有）仓库的 `node_modules`，因此任何被 Nitro 外置的依赖
都会在云端变成 `Cannot find package 'xxx'`。

- 本地跑得通 ≠ 云端可用：Node 会沿目录树向上找到仓库的 `node_modules`（harness 已默认隔离运行）
- `consola` 是 `server/package.json` 的直接依赖，Nitro 默认外置 → 已在 `server/nitro.config.ts`
  的 `externals.inline` 里内联
- `build:unicloud` 现在会扫描产物：凡是从引用方出发解析不到产物内部的裸导入，直接构建失败
  （Nitro trace 拷进 `nitro/node_modules/` 的依赖会正常通过）

### 2. 集成响应必须带 `mpserverlessComposedResponse: true`

uniCloud 云函数要返回 `{ statusCode, headers, body }` 这种「集成响应」时，
**必须**同时带 `mpserverlessComposedResponse: true`，否则网关会把整个对象当普通 JSON body
返回、HTTP 状态码恒为 200。

实测现象：函数内部返回 500，客户端收到的是 `HTTP 200` + `{"statusCode":500,"headers":{...},"body":"..."}`，
症状极具误导性（像是「接口通了但数据不对」）。适配层已统一经 `composedResponse()` 包装。

## 注意事项

- **令牌有效期**：`WPS_API_TOKEN` 为会话令牌，过期后接口会返回 500，
  `message` 为 `WPS 工具调用失败: code=401 Unauthorized`（云函数日志同样有记录）。
  失效时重新走 auth-guide 换取并更新环境变量。
  若需要长期免维护，可改用方案 A（`WPS_TRANSPORT=cli`，由 CLI 自动刷新凭据）。
- **跨域**：静态托管与云函数不同源，适配层已内置 CORS（含预检短路）。
  生产环境建议把 `CORS_ORIGIN` 设为静态站域名，避免开放给任意来源。
- **写接口**：评论提交、阅读数写回是公开写操作，如需限制请自行加校验。
- **冷启动**：云函数首次调用有 300~800ms 冷启动，之后复用 Nitro 实例。
- **支付宝云默认域名限流**：所有支付宝云空间的 URL 化默认域名共享一个限流池，
  正式使用建议绑定自定义域名（已备案）。

## 排查

部署后接口不通，先看云函数日志里的 `message`，基本可以直接定位：

| 现象 | 原因 | 处理 |
|---|---|---|
| 500 + `50002` / `请先检查[环境管理-访问服务]中的HTTP访问服务开关` | 支付宝云网关层：云函数未部署、URL 化路由未生效，或空间的 HTTP 访问服务未开启；也可能是打到了 `api-hz`（调用域名）而非 `dev-hz`（URL 化域名） | ① HBuilderX 上传云函数；② **Web 控制台 → 云函数 → 详情 → 配访问路径 `/mz-api`**（这步必须手动，`cloudfunction-config.path` 不生效）；③ 仍报错则到「环境管理 → 访问服务」开启 HTTP 访问服务；④ 核对域名用控制台里显示的那个 |
| 500 + `Cannot find package 'xxx'` | 产物不自包含（依赖被外置，而云函数目录不带 node_modules） | 重新 `pnpm run build:unicloud`（已加自包含检查，会直接构建失败并列出缺失包）后重新上传云函数 |
| 客户端收到 **HTTP 200** 但 body 是 `{"statusCode":500,...,"body":"..."}` | 云函数返回的集成响应未被网关还原——缺 `mpserverlessComposedResponse: true` | 更新到最新产物并重新上传云函数（适配层已统一包装） |
| 500 + `spawn /bin/sh ENOENT` | transport 仍是 `cli`（变量没配、名字写错） | 确认 `WPS_TRANSPORT=http` 已生效 |
| 500 + `WPS 工具调用失败: code=401 Unauthorized` | 令牌失效 / 未授权 | 重走 auth-guide，更新 `WPS_API_TOKEN`（必要时同时更新 `WPS_REQUEST_SOURCE_ENC`、`WPS_CLIENT_ID`） |
| 500 + `HTTP 传输需要 WPS_API_TOKEN 环境变量` | 令牌变量没配或名字写错 | 检查变量名与作用域（要配在 `mz-corner-api` 上） |
| 接口 200 但列表恒为空 | 旧版本会静默吞掉网关失败码 | 重新构建并上传（当前版本已改为抛错，不再静默返回空） |
| 前端报 CORS | `CORS_ORIGIN` 与静态站域名不一致，或未配安全域名 | 云函数「安全域名」里放行前端域名，并把 `CORS_ORIGIN` 改成静态站实际域名（或留空为 `*`） |
| 全部 404 | URL 化前缀与请求路径不匹配 | 核对控制台里配的访问路径与请求 URL 前缀是否一致（本项目为 `/mz-api`），不一致时同步设 `UNICLOUD_URL_PREFIX` |
| 首次调用超时 / 504 | 云函数超时默认仅 5 秒 | 产物已设 `timeout: 20`；若改过，在控制台调大 |

本地自检（无需真实令牌，验证产物能否加载、路由与 CORS 是否正常）：

```bash
pnpm run harness:unicloud          # 终端 A：本地模拟 uniCloud 事件（默认 :8899）
pnpm run verify:unicloud http://127.0.0.1:8899/mz-api   # 终端 B：跑自检
```

模拟器支持两种 `event.path` 形态（`full` / `stripped`），用来验证适配层的前缀剥离：

```bash
pnpm run harness:unicloud full 8899
```

> 传占位令牌（如 `WPS_API_TOKEN=dummy WPS_TRANSPORT=http`）时会返回 401，
> 这正好可以验证自检脚本的失败诊断是否符合预期。
