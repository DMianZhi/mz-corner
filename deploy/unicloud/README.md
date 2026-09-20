# uniCloud 部署指南

静态前端走 **前端网页托管**（CDN + HTTPS），数据接口走 **云函数**（Nitro 产物 + 适配层），
数据存在**同一个服务空间的云数据库**里。浏览器只与本项目的 API 通信。

```
浏览器
 ├── 静态资源 ──→ uniCloud 前端网页托管（client/dist）
 └── /api/blog/* ──→ 云函数 mz-corner-api（Nitro handler）──→ uniCloud 云数据库
```

## 为什么数据放在云数据库（结论，别反复试）

原方案用 WPS 多维表当存储，实测三条路都堵死：

- **技能渠道**：`POST https://api.wps.cn/office/v5/ai/skill_hub/token/create` 对企业账号直接回
  `{"code":403,"message":"enterprise account not supported"}`；网关带企业 cookie 直连回 `403001`，
  原文「企业用户请使用 WPS365 CLI」。**企业账号拿不到令牌**。
- **个人账号能签发，但令牌与会话同生共死**：`expires_in` 看似一年（31535956 秒），实际
  `wps_sid` 会话一断，令牌立刻 `401`，再调 `token/create` 得 `HTTP 401 {"code":200,"msg":"no login"}`。
  **不能当服务器端长期凭据**。跨账号读企业表另有一道墙：`{"code":400100,"message":"第三方服务错误：无权限"}`。
- **WPS365 开放平台**：官方 CLI 实测能读到企业表（数据链路是通的），但本地绑定的应用
  `auth refresh --delegated` 回 `40100009 invalid_grant: refresh token not_found`、`auth status` 显示
  `app: not_found`——应用已在服务端不存在，需重建。

云数据库没有上述任何一道墙：**同服务空间、无第三方凭据、权限由云函数运行身份决定**，
且每个开发者账号的免费服务空间（阿里云 / 支付宝云各一个）本就包含数据库额度。

## 前置条件

- 一个 uniCloud 服务空间（阿里云版 / 腾讯云版 / 支付宝云版均可；本项目实测为**支付宝云**）
  - 支付宝云默认运行时就是 **Nodejs18**（云函数用到全局 `fetch`，需 Node 18+）
  - 单个云函数体积上限 **10MB**（含 `node_modules`），本项目产物约 1.6MB
  - 支付宝云/阿里云**不支持相对路径读文件**（`fs.readFileSync('./x')`），本项目已用绝对路径，不受影响
- 4 个数据库集合：`articles` / `comments` / `projects` / `site_config`
  - 由 `deploy/unicloud/database/*.schema.json` 定义，`pnpm run deploy:unicloud` 会**自动上传建集合**，
    不需要在控制台手点
  - Schema 里权限一律 `false`：只有云函数（服务空间身份）能读写，前端拿不到直连权限
  - 云数据库是 JSON 文档型、兼容 MongoDB 协议，字段名即领域模型（`title` / `content` / `viewCount`…）

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

### 推荐：命令行上传（一条命令，实测可用）

```bash
pnpm run deploy:unicloud                  # 构建 → 同步产物 → CLI 上传 → 自动自检
pnpm run deploy:unicloud -- --skip-build  # 复用现有产物，只做上传 + 自检
```

脚本 `scripts/deploy-unicloud.mjs` 依次做：`build:unicloud`（含自包含检查）
→ 同步产物到 `uniCloud-alipay/cloudfunctions/mz-corner-api/`
→ 同步并上传 `database/*.schema.json`（建集合；放在云函数之前，避免新函数上线时集合还不存在）
→ 调 HBuilderX 自带 cli 上传云函数（`--force` 覆盖）
→ 从服务空间 id 推导 URL 化地址并跑 `verify-unicloud-deploy.mjs`。

常用参数：`--provider alipay|aliyun|tcb`、`--prj <HBuilderX 项目名>`、`--cli <cli 路径>`、
`--url <自检地址>`、`--skip-db`（跳过建集合）、`--skip-verify`。cli 路径可用 `--cli` 或环境变量 `HBX_CLI` 指定
（Windows 默认 `C:\Users\<你>\HBuilderX\cli.exe`，macOS `/Applications/HBuilderX.app/Contents/MacOS/cli`）。

不想用脚本时，裸命令等价：

```bash
"C:\Users\<你>\HBuilderX\cli.exe" cloud functions --upload cloudfunction \
  --prj mz-corner --provider alipay --name mz-corner-api --force
```

### 备选：图形界面（等效）

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

> **CLI 在 Windows 上可用（实测，与官方文档说法不一致）**：官方文档写「仅适用于 linux 命令行调用」，
> 但 HBuilderX 5.26 桌面端自带的 `cli.exe` 实测支持 `cloud functions --list / --upload`，
> 本项目云函数就是用它上传的（`--provider` 取值 `tcb|aliyun|alipay`，支付宝云同样可用）。
> 且 CLI 上传同样要求项目根存在 `manifest.json`（含 `appid`）——实测把该文件移走后，
> CLI 直接报「缺少appid，请在manifest.json中设置appid」，与图形界面同因。

> 产物里已带 `node_modules`（约 1.6MB），选「上传部署」即可，不必用「云端安装依赖」。
> 若 HBuilderX 提示依赖未安装，忽略即可（我们不打 npm 安装，依赖随产物一起上传）。

> **CLI 的能力边界**：`--list / --upload / --download / --run / --create / --info`
> （资源类型 `cloudfunction | common | db | vf | action | space`）都能用，
> 但**不能配 URL 化路径、不能配环境变量**——这两项仍必须走 Web 控制台（步骤 3、4）。
> 另外 npm 上**不存在** `@dcloudio/uni-cloud-cli` 这个包，不要按旧文档去找。
>
> 失败判定坑：CLI 上传失败时退出码仍为 0，失败信息是 stdout 里的
> `-1:cloud functions:上传失败：...`（如支付宝云偶发 `aop.unknow-error 系统繁忙`，重跑即过）。
> 用脚本部署时已自动识别这一行。

## 步骤 3：配置云函数环境变量

在 uniCloud 控制台 → 云函数 → `mz-corner-api` → 环境变量。

| 变量 | 必填 | 值 |
|---|---|---|
| `SEED_TOKEN` | 仅「B 路迁移」需要 | 自定一个长随机串，用于一次性数据迁移（`/api/admin/seed`）；**不配则该路由关闭（回 404）** |
| `CORS_ORIGIN` | 建议 | 静态站域名（不填为 `*`） |
| `UNICLOUD_URL_PREFIX` | 改了前缀才需要 | URL 化前缀，默认 `/mz-api` |
| `NITRO_BLOG_PROVIDER` | 否 | 数据源实现名，默认 `unicloud-db`；仅将来替换数据源时用 |

数据源是**同服务空间的云数据库**，不需要任何第三方凭据，也没有会过期的令牌。

> **环境变量只能在这里配（CLI 与产物都不行，实测）**：
> ① `cli cloud functions` 的资源类型只有 `cloudfunction | common | db | vf | action | space`，没有环境变量；
> ② 在云函数目录放 `.env` **不会**随上传同步——实测写 `SEED_TOKEN=probe-abc123` 后上传，
> 云端 `/api/admin/seed` 仍回 404（= 未读到该变量）。官方文档也说明 `.env` 存的是
> **本地值**（供本地运行用），远程值由 IDE/控制台界面保存。
> 保存后实时生效，不需要重新部署云函数。

> **为什么覆盖 `provider` 要用 `NITRO_` 前缀**：`nitro.config.ts` 里 `runtimeConfig` 的默认值会被
> **构建期内联进产物**，运行期改普通环境变量对它无效；要覆盖必须用 `NITRO_` + 路径（大写下划线），
> 如 `NITRO_BLOG_PROVIDER=...`。数据层自己读的变量（`BLOG_DATA_PROVIDER`）只在「未经宿主注入」时兜底
> （测试、独立脚本）。
>
> **怎么确认线上实际用的是哪个数据源**：云函数日志里那行
> `Data source plugin initialized (provider=..., db=ready|unavailable)`。
> 配了变量却不见效时，先看这行，再看具体报错。

## 步骤 4：首次数据迁移（把多维表备份灌进云数据库）

备份目录（**仓库外**，含 4 份 sheet JSON）默认取 `<local-path>/data/work/mz-corner-数据备份`，
可用 `--from` 指定。两条路灌的是同一份备份，按「要不要 SEED_TOKEN」选：

| | **A. 初始化数据文件**（已实测走通） | **B. seed 路由** |
|---|---|---|
| 前提 | 只要 CLI + 已关联服务空间 | 云函数环境变量 `SEED_TOKEN`（**只能在 Web 控制台配**） |
| 命令 | `export:init-data` → `--initdatabase` | `migrate:unicloud --base … --token …` |
| 幂等 | ❌ **追加插入**，重跑报 `_id` 重复 | ✅ `mode=replace` 先清空再写 |
| 适合 | 首次灌数据 | 重跑、纠错、从备份恢复 |

### 路 A：初始化数据文件（不需要 SEED_TOKEN）

走 uniCloud 原生的 `表名.init_data.json` 机制，由 CLI 的 `--initdatabase` 上传，
**全程不需要界面操作**。产物落在 `uniCloud-alipay/database/`（`uniCloud-*` 已在
`.gitignore` 内，真实数据不入库）：

```bash
# 1. 转换备份 → 中间产物（不写库）
pnpm run migrate:unicloud -- --out /tmp/payload.json

# 2. 中间产物 → 初始化数据文件（顺带生成文章 _id，并把评论按标题关联到该 _id）
node scripts/export-init-data.mjs --in /tmp/payload.json

# 3. 上传（会一并上传 schema 与初始数据）
"<local-path>/HBuilderX/cli.exe" cloud functions --initdatabase --prj mz-corner --provider alipay

# 4. 验证
node scripts/verify-unicloud-deploy.mjs
```

> **为什么要自己生成 `_id`**：初始化数据是「一次性写文件」，没法像 B 路那样先插文章、
> 回读真实 id、再插评论。所以文章 id 由脚本按备份表顺序生成（`art-01`…，顺序稳定 ⇒
> id 稳定），评论的 `articleId` 同步指向它。实测线上：`art-02` 挂 1 条、`art-05` 挂 4 条，
> 关联全部有效。
>
> **坑：`--initdatabase` 是「插入」不是「同步」**——它不清理集合。重跑会撞
> `duplicate key error collection: articles index: _id_ dup key`（实测：第二次执行时
> articles 整批 `nInserted=0` 失败，其余集合也未被处理）。所以**改数据 / 删数据只能走
> B 路（`mode=replace`）或 Web 控制台**；A 路适合「空库首次灌入」。

### 路 B：seed 路由（可重跑、可清理）

脚本依次做：

1. 解析每份的 `records[].fields`（**是 JSON 字符串，需二次解析**）
2. 字段归一：`标题→title`、`标签→tags`（拆逗号）、`发布时间→publishDate`（转 `YYYY-MM-DD`）、`已发布→published`
3. 写入文章 / 项目 / 配置 → 回读文章列表建立「标题 → 新 `_id`」→ 据此解析评论归属 → 写入评论
4. 逐篇回读评论数，确认关联生效

```bash
# 只转换，产出可检查的 JSON（不写库）
pnpm run migrate:unicloud -- --out ./migrated.json

# 真实迁移
pnpm run migrate:unicloud --   --base https://<unicloud-space-id>.dev-hz.cloudbasefunction.cn/mz-api   --token <SEED_TOKEN>
```

> **评论归属为什么要重算**：原表「文章ID」列是 `MultiLineText` 手填文本（值为 `d` / `e` / `f`），
> 与文章记录 id（`8` / `9` / `-` / `_` / `BA`…）**本就对不上**，是无效关联。
> 脚本按评论内容判定归属（「TypeScript 很实用！」→《TypeScript 5.0 最佳实践》、
> 「年终总结很真实」→《我的 2024 年终总结》），判不出来的落到最早发布的文章，
> 并把原值写进 `legacyArticleId` 便于人工纠正。迁移时会打印这张映射表。

> 迁移**幂等**：`mode=replace` 先清空对应集合再写入，重跑不会产生重复数据。
> 请求体约 108KB（23 篇文章全文），远低于支付宝云 32MB 的 Body 上限。

## 步骤 5：配置云函数 URL 化（必须手动，在 Web 控制台）

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

## 步骤 6：构建并上传前端

```bash
cd client
rm -rf dist   # 必做：否则上次构建的旧 hash 文件会被一起传上去，越传越多
VITE_API_BASE=https://<unicloud-space-id>.dev-hz.cloudbasefunction.cn/mz-api pnpm run build
cd ..
```

上传到 **前端网页托管**（实测 CLI 可用，不必开控制台）：

```bash
# 注意：省略 --prefix 才是「传到云空间根目录」（CLI 文档口径：不填则目标为根目录）
"<local-path>/HBuilderX/cli.exe" hosting deploy --prj mz-corner --provider alipay \
  --space <unicloud-space-id> --source client/dist
```

其他方式（等效）：控制台 <https://unicloud.dcloud.net.cn> → 前端网页托管 → **上传文件 / 上传文件夹**；
或 HBuilderX **发行 → 上传网站到服务器**。查看/清理云端文件用 `cli hosting list|delete`。

> **坑：不要写 `--prefix /`**。实测在 Windows 上它会把文件写到被路径规范化搞坏的位置——云端凭空
> 多出一个名为 `..\..\..\..` 的文件夹，而 `hosting list --prefix /assets/` 却能看到文件，
> 造成「列表里有、HTTP 取不到」的假象（`/assets/…` 一律 404）。省略 `--prefix` 即根目录，
> 实测 15 个文件全部生效。

**线上地址**：

```
https://<unicloud-space-id>-static.normal.cloudstatic.cn/                        → 302 → /index.html（博客）
https://<unicloud-space-id>-static.normal.cloudstatic.cn/FlappyBird/index.html
https://<unicloud-space-id>-static.normal.cloudstatic.cn/password_tools/index.html
```

项目使用 `HashRouter`，所有路由都在 `#/` 之后，因此不需要配置 SPA fallback。

### 控制台必须有一处配置：「索引文件」= `index.html`

`/` 返回什么**由支付宝云静态站点的「索引文件」配置决定，不是由根目录里有没有 `index.html` 决定**
（官方文档：索引文件默认 `index.html`，且**支持自定义路径**；访问域名时按 `域名 + 索引路径/索引文件` 路由）。
它同时决定**所有目录形式请求**的落点——取值是**带目录的相对路径**时会被拼在请求路径后面：

| 索引文件取值 | `/` | `/FlappyBird/` | `/password_tools/` |
|---|---|---|---|
| `index.html`（**正确值**） | 302 → `/index.html` ✓ 博客 | 302 → `/FlappyBird/index.html` ✓ | 302 → `/password_tools/index.html` ✓ |
| `FlappyBird/index.html`（曾误设） | 302 → `/FlappyBird/index.html` | 302 → `/FlappyBird/FlappyBird/index.html` ✗ | 302 → `/password_tools/FlappyBird/index.html` ✗ |
| `mz-corner/index.html`（曾试） | 302 → `/mz-corner/index.html` | 302 → `/FlappyBird/mz-corner/index.html` ✗ | 302 → `/password_tools/mz-corner/index.html` ✗ |

**所以索引文件必须填 `index.html`**：既让 `/` 落到博客，也让另外两个项目各自解析自己的 index。

> **`/` 落地会带 `/index.html` 尾巴，消不掉（已实测并接受）**：托管把索引文件当**路径**用，
> 访问 `/` 时 CDN 先 302 到该路径，地址栏跟着变。曾推测「索引文件指向子目录 → `/` 内部渲染、
> 地址栏干净」——**实测为假**（那次看到的 200 是边缘缓存的旧响应），改成子目录取值后反而把
> 所有目录请求拼坏。想让 `/` 真正干净，只能换支持内部渲染的静态托管（GitHub Pages 等）
> 或绑自定义域名（能否免跳转未知）。

> **这个服务空间不是博客独占**：根 `index.html` 现在归博客，Flappy Bird 退到 `/FlappyBird/index.html`
> （文件都在，未丢失）。

> **不要再动 `base`**：根目录部署用默认相对 `./`（资源与 index.html 同级 → 解析成 `/assets/…` ✓）。
> `client/vite.config.ts` 保留了 `VITE_BASE` 覆盖能力，只在未来换托管平台、真要放子目录时才用：
> `MSYS_NO_PATHCONV=1 VITE_BASE=/mz-corner/ pnpm run build`。
> **Git Bash 的 MSYS 路径转换坑**：不设 `MSYS_NO_PATHCONV=1` 时 `/mz-corner/` 会被转成
> `C:\…\mz-corner`，产物里写进本地绝对路径、部署后白屏（实测踩到）。构建后务必用
> `grep -o 'src="[^"]*"' dist/index.html | grep -v 'src="data:'` 确认引用形态。

> 若把前端也部署在同一台服务器/同源路径下，`VITE_API_BASE` 留空即可（默认相对路径 `./api/blog`）。

## 步骤 7：跨域（已用「简单请求」规避预检）

**实测：支付宝云 URL 化网关会直接应答 OPTIONS 预检**——对不存在的路径发 OPTIONS 也回
`200` + 空体 + `content-type: application/json`（而同一路径的 GET 会打到函数并回 500）。
也就是说适配层里的「OPTIONS 短路」在云端**不会被执行**，预检头补不上；官方 URL 化文档
也没有任何跨域配置项——**不要去控制台找「安全域名」开关，实测不存在**。

处置：**前端写请求改用 `text/plain` 发 JSON**（CORS 简单请求，不触发预检），
服务端 `server/utils/body.ts` 的 `readJsonBody` 对 `application/json` 与 `text/plain`
都能解析，curl / 脚本等其他客户端照旧用标准 JSON。

真实浏览器（headless Chromium，页面跑在 `127.0.0.1`）实测三种情形：

| 请求 | 结果 |
|---|---|
| `GET /api/blog/config`（无自定义头，不触发预检） | ✅ 200，可读 |
| `POST` + `application/json` | ❌ `Failed to fetch`（预检被网关截住） |
| `POST` + `text/plain`（简单请求） | ✅ 200/404 正常拿到响应体 |

云函数环境变量 `CORS_ORIGIN` 仍建议设为前端域名（不设则回 `*`，公开只读博客可接受）。
自检脚本第 3 项校验的是「真实响应是否带 `access-control-allow-origin`」，
OPTIONS 的探测结果只作为已知现象提示，不计入失败。

## 步骤 8：验证

仓库自带只读自检脚本（不写数据）：

```bash
node scripts/verify-unicloud-deploy.mjs \
  https://<unicloud-space-id>.dev-hz.cloudbasefunction.cn/mz-api \
  https://<前端网页托管域名>
```

它会依次探测 `health` / `config` / `posts` / CORS 预检，并把失败原因翻译成处置建议（如集合未创建、
URL 前缀不匹配、产物缺依赖、集成响应未被网关还原）。
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

- **无凭据**：数据源是同服务空间的云数据库，句柄由云函数运行时注入，
  不存在「令牌过期导致线上 500」这一类故障。唯一的密钥是 `SEED_TOKEN`，且只用于一次性迁移。
- **数据备份**：迁移源（多维表导出）留在仓库外的 `<local-path>/data/work/mz-corner-数据备份/`，
  不进版本库；云数据库本身也可在控制台导出。
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
| 500 + `50002` / `请先检查[环境管理-访问服务]中的HTTP访问服务开关` | 支付宝云网关层：云函数未部署、URL 化路由未生效，或空间的 HTTP 访问服务未开启；也可能是打到了 `api-hz`（调用域名）而非 `dev-hz`（URL 化域名） | ① `pnpm run deploy:unicloud` 重新部署（或 HBuilderX 右键上传）；② **Web 控制台 → 云函数 → 详情 → 配访问路径 `/mz-api`**（这步必须手动，`cloudfunction-config.path` 不生效）；③ 仍报错则到「环境管理 → 访问服务」开启 HTTP 访问服务；④ 核对域名用控制台里显示的那个 |
| 500 + `Cannot find package 'xxx'` | 产物不自包含（依赖被外置，而云函数目录不带 node_modules） | 重新 `pnpm run build:unicloud`（已加自包含检查，会直接构建失败并列出缺失包）后重新上传云函数 |
| 客户端收到 **HTTP 200** 但 body 是 `{"statusCode":500,...,"body":"..."}` | 云函数返回的集成响应未被网关还原——缺 `mpserverlessComposedResponse: true` | 更新到最新产物并重新上传云函数（适配层已统一包装） |
| 500 + 集合不存在 / `DATABASE_COLLECTION_NOT_EXIST` | 集合没建（`--skip-db` 部署过，或首次部署漏了） | `pnpm run deploy:unicloud` 重新部署（会自动上传 `database/*.schema.json` 建集合），或在控制台手动建 4 个集合 |
| `GET /api/health` 里 `database=unavailable` | 云函数运行时没有注入 `uniCloud` 全局（本地裸跑 Node 时必然如此） | 云端出现才需处理：确认部署的是最新产物；本地用 `pnpm run harness:unicloud` 会注入内存假库 |
| `POST /api/admin/seed` 回 403 | `SEED_TOKEN` 没配或与请求头 `x-seed-token` 不一致 | 在云函数环境变量里配 `SEED_TOKEN`，请求时带同一值 |
| `POST /api/admin/seed` 回 **404** | 云端没读到 `SEED_TOKEN`（未配置，或以为 `.env` 会随上传同步） | 到控制台云函数「环境变量」里配；CLI 与 `.env` 都传不上去（实测） |
| 自检第 3 项「跨域响应头 (CORS)」失败 | 真实响应缺 `access-control-allow-origin` | 把云函数环境变量 `CORS_ORIGIN` 设为前端域名（不设则为 `*`） |
| 浏览器里 POST 报 `Failed to fetch`、GET 正常 | 该请求带了 `application/json` → 触发预检 → 被网关截住 | 前端写请求用 `text/plain` 发 JSON（已内置）；服务端 `readJsonBody` 两种都收 |
| 接口 200 但列表恒为空 | 数据还没迁进云数据库 | 跑一次「步骤 4」的数据迁移（迁移后 `posts` 应有 23 篇） |
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

> harness 会注入一个**内存假库**（`globalThis.uniCloud`）并把产物拷到仓库外加载，
> 因此本地自检既不碰真实数据，也不会被仓库的 `node_modules` 掩盖依赖问题。
