# 在线管理后台（口令换 JWT 会话）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 mz-corner 加一个手机可用的在线管理后台：口令登录 → HMAC 会话 → 在浏览器里改文章正文，附带数据导出端点补全「线上拉回 → 本地改 → seed 推回」闭环。

**Architecture:** 后端零新依赖（`node:crypto` HMAC-SHA256 自签会话令牌），鉴权三通道并入统一守卫（会话头 ∥ Cookie ∥ 旧 seed 令牌）。前端利用云函数本身伺服 SPA（`publicAssets`）这一事实，把 `/admin` 挂在同源上 —— 部署后的管理页与 API 完全同源，`x-admin-session` 自定义头天然免疫 CSRF，Cookie 仅作为辅助通道。

**Tech Stack:** Nitro 路由 + `node:crypto`（零依赖）；React 19 现有 SPA（复用 `Markdown` 组件做实时预览）；vitest；local-unicloud-harness 做端到端。

**Spec:** 本文件「规格决策」一节（决策在 brainstorm 后由用户一次性拍板：「直接用你推荐的方案，完成后 push，不要再问」）。

## 规格决策（Spec）

| 决策点 | 选择 | 理由 |
|---|---|---|
| 用户体系 | 不用 uni-id；单用户「是不是站长」问题 | uni-id 付费；单人博客只需要一个口令 |
| 会话机制 | 自签 HMAC-SHA256 令牌（JWT 格式），TTL 7 天，零依赖 | 免费、可控，本身即 Web 鉴权教学样本 |
| 秘密存放 | 云函数环境变量 `ADMIN_PASSWORD` + `SESSION_SECRET` | 与 SEED_TOKEN 同机制；runtimeConfig 会内联进产物，改秘密须重建，不可接受 |
| CSRF | 令牌走 `x-admin-session` 自定义头（跨站攻击者无法伪造）+ Cookie `SameSite=Strict` 辅助 | 双保险；跨站请求既无令牌也带不上 Cookie |
| Cookie 是否关键通道 | **否**（uniCloud 网关对 Cookie 转发行为未经实测，不能赌）；localStorage 存令牌 + 头发送为主，Cookie 为防御纵深 | 已知约束下的诚实设计；Cookie 若被网关剥掉，功能不受影响 |
| XSS 取舍 | localStorage 令牌可被 XSS 窃取 —— 接受并如实注释 | 单人内容管理面，无第三方内容渲染（Markdown 组件全转义）；收益（网关不确定性免疫）大于风险 |
| 防爆破 | 实例内存计数：同 IP（`x-forwarded-for` 首值）5 次失败锁 15 分钟 | 实例重启丢失计数是已知局限，如实注释；聊胜于无 |
| 鉴权语义 | 管理后台已配置（两环境变量齐）→ 未认证 401；仅 SEED_TOKEN → 错令牌 403；两者皆无 → 404 隐藏 | 延续仓库既有「未配置即 404」语义 |
| 编辑范围 | 仅文章正文 `content`（PATCH 现有能力）；标题/元数据/状态不做 | 竖切最小可用；仓储层本就只有 `updateArticleContent` |
| 管理页入口 | `https://<UNICLOUD_URL_BASE>/#/admin`（云函数源） | 网关会把 `/mz-api/*` 外的路径挡掉，SPA 由云函数伺服，管理页必须与 API 同源 |
| 强制 Header | 登录/登出/会话/导出请求按仓库既定惯例走 `text/plain` 载荷，避免网关预检拦截 | 见 `utils/body.ts` 注释 |
| 导出端点 | `GET /api/admin/export`（会话或 seed 令牌均可），加 `scripts/export-live-data.mjs` 落成 `*.init_data.json` | 补全方案 B 悬而未决的数据闭环 |
| UI 风格 | 复用站点 CSS 变量（明暗跟随系统）+ HIG 形态语言（系统字体栈、圆角、分隔线）；图标一律内联 SVG | 用户既有 UI 偏好 |

## Global Constraints

- HashRouter，禁止 BrowserRouter。
- 写请求 `text/plain` 载荷 + `readJsonBody`。
- 真实数据不进 git：`uniCloud-*/database/` 已 gitignore，导出产物只落那里。
- 图标用内联 SVG（`currentColor`），禁 emoji。
- 服务端禁 runtimeConfig 存秘密（内联问题），一律 `process.env`。
- 提交身份：`DMianZhi <DMianZhi@users.noreply.github.com>`（仓库局部已配）。
- 敏感值（口令/密钥）只进 gitignore 的 `.env` 与部署控制台，**不进任何入库文件**。

---

## File Structure

```
server/
  utils/session.ts            ← 新增：HMAC 会话签发/校验（纯函数）
  utils/session.test.ts       ← 新增
  utils/login-throttle.ts     ← 新增：登录防爆破（内存计数，可注入时钟）
  utils/login-throttle.test.ts← 新增
  utils/admin-auth.ts         ← 修改：resolveAdminAuth 纯函数 + requireAdmin 守卫升级
  utils/admin-auth.test.ts    ← 修改：补三通道分支
  routes/api/admin/login.post.ts    ← 新增
  routes/api/admin/logout.post.ts   ← 新增
  routes/api/admin/session.get.ts   ← 新增
  routes/api/admin/export.get.ts    ← 新增
  routes/api/admin/seed.post.ts     ← 修改：requireAdminToken → requireAdmin
  routes/api/blog/posts/[id].patch.ts ← 修改：同上
scripts/export-live-data.mjs  ← 新增：线上四集合 → uniCloud-*/database/*.init_data.json
client/
  src/services/admin-api.ts   ← 新增：login/logout/session/updateContent（x-admin-session 头）
  src/pages/AdminPage.tsx     ← 新增：登录页 + 文章列表 + 正文编辑器 + 实时预览
  src/pages/AdminPage.test.tsx← 新增：登录前/后状态机（mock fetch）
  src/App.tsx                 ← 修改：注册 /admin 路由
.env.example                  ← 修改：新增两个管理端变量说明
client/.env.example 等        ← 不动
deploy/unicloud/README.md     ← 修改：管理后台激活章节
scripts/prepare-unicloud-project.mjs ← 修改：生成的 README 环境变量表补两行
docs/superpowers/plans/2026-09-21-admin-dashboard-jwt.md ← 本文件
```

---

### Task 1: 会话工具（TDD）

**Files:**
- Create: `server/utils/session.ts`、`server/utils/session.test.ts`

**Interfaces:**
- Produces: `signSession(payload: SessionPayload, secret: string): string`；`verifySession(token: string, secret: string, nowSec?: number): SessionPayload | null`；`type SessionPayload = { sub: string; iat: number; exp: number }`

- [ ] **Step 1: 写失败测试** — 覆盖：正常签发→校验通过；`exp` 过期（nowSec 前拨）→ null；篡改签名/载荷 → null；错误密钥 → null；载荷缺字段 → null。
- [ ] **Step 2: 跑测试确认失败**（缺模块）。
- [ ] **Step 3: 最小实现** — JWT 紧凑格式 `b64url(header).b64url(payload).b64url(hmacSha256(header.payload))`，`header={alg:"HS256",typ:"JWT"}` 固定；常量时间比较签名（复用 admin-auth 的 sha256 前置模式）；`nowSec` 参数默认 `Math.floor(Date.now()/1000)`，60 秒时钟漂移容忍。
- [ ] **Step 4: 测试通过**，`git commit -m "feat(admin): HMAC 会话签发/校验工具"`。

### Task 2: 防爆破节流（TDD）

**Files:**
- Create: `server/utils/login-throttle.ts`、`server/utils/login-throttle.test.ts`

**Interfaces:**
- Produces: `createLoginThrottle(options?: { max?: number; windowSec?: number; now?: () => number })` → `{ registerFailure(key): void; isLocked(key): boolean; registerSuccess(key): void }`，默认 max=5、windowSec=900。

- [ ] 失败测试（锁内 isLocked=true、窗口外解除、成功清零）→ 实现 → 通过 → commit `feat(admin): 登录防爆破节流`。

### Task 3: 守卫升级（TDD）

**Files:**
- Modify: `server/utils/admin-auth.ts`、`server/utils/admin-auth.test.ts`

**Interfaces:**
- Produces: `resolveAdminAuth(input: { adminConfigured: boolean; seedConfigured: boolean; sessionValid: boolean; seedProvided: boolean; headerName: "x-admin-session" | "x-seed-token" }): "ok" | "unauthorized" | "forbidden" | "hidden"`；`requireAdmin(event: H3Event): void`（替代 `requireAdminToken`，保留 `checkAdminToken` 导出供旧测试）

- [ ] 失败测试覆盖真值表：会话有效→ok；无会话但 adminConfigured→unauthorized(401)；admin 未配但 seedConfigured 且头是 x-seed-token 且匹配→ok；adminConfigured 时即使带 seed 头：仿会话缺失→unauthorized（不泄露 seed 存在）；两者皆无→hidden(404)。
- [ ] 实现 `resolveAdminAuth` 纯函数；`requireAdmin` 负责接线：读 `parseCookies(event).mz_admin_session` 与两请求头，`verifySession` 判会话，旧 `checkAdminToken` 判 seed 头，按结果抛 401/403/404。
- [ ] 通过 → commit `feat(admin): 统一写端点守卫（会话∥Cookie∥seed令牌）`。

### Task 4: 管理端路由 + 守卫接线 + 文档

**Files:**
- Create: `server/routes/api/admin/login.post.ts`、`logout.post.ts`、`session.get.ts`、`export.get.ts`
- Modify: `seed.post.ts`、`[id].patch.ts`（requireAdminToken → requireAdmin）、根 `.env.example`、`deploy/unicloud/README.md`、`scripts/prepare-unicloud-project.mjs:93` 附近环境变量表

**Interfaces:**
- `POST /api/admin/login`：guard=adminConfigured 否则 404；`requireAdminAuth` 校验节流；`checkAdminToken(ADMIN_PASSWORD, body.password)` 恒时比对；成功 → `{ code:0, data:{ token, expiresIn: 604800 } }` + `Set-Cookie: mz_admin_session=<token>; HttpOnly; Secure*; Path=/; Max-Age=604800; SameSite=Strict`（`Secure` 仅当 `x-forwarded-proto=https`）；失败 → 节流失败计数 + 401；锁定 → 429 + `Retry-After`。
- `POST /api/admin/logout`：清 Cookie（Max-Age=0），恒 `{ code: 0 }`。
- `GET /api/admin/session`：恒 200 `{ code:0, data:{ authenticated, configured } }`（后台未配置时 `configured:false`，UI 据此显示禁用态）。
- `GET /api/admin/export`：`requireAdmin`；`fetchAll` + `countDocuments` 拉四集合原样文档（保 `_id`）；响应 `{ code:0, data:{ articles, comments, projects, siteConfig } }`。
- `.env.example` 增补：`ADMIN_PASSWORD`（口令，`openssl rand -base64 24` 生成）、`SESSION_SECRET`（HMAC 密钥，同法生成）。

- [ ] 逐路由实现（login 里组装 session+throttle，其余极薄）→ 文档 → `pnpm lint:server && pnpm check:types:server && pnpm test:server` 全绿 → commit `feat(admin): 登录/会话/导出端点与守卫接线`。

### Task 5: 前端 admin-api + AdminPage（HIG 风格）

**Files:**
- Create: `client/src/services/admin-api.ts`、`client/src/pages/AdminPage.tsx`、`client/src/pages/AdminPage.test.tsx`
- Modify: `client/src/App.tsx`（`<Route path="/admin" element={<AdminPage />} />`，置于 Layout 内，与既有页面同层）

**Interfaces:**
- `admin-api.ts`：`const BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/+$/,'') + '/api/admin'`；内部 `adminFetch(path, init)` 自动附 `x-admin-session`（localStorage 键 `mz_admin_session`）；`login(password): Promise<void>`（成功存令牌）；`logout(): Promise<void>`；`checkSession(): Promise<{authenticated:boolean; configured:boolean}>`；`updateArticleContent(id, content): Promise<void>`（PATCH，`text/plain` 载荷）。
- `AdminPage.tsx`：三态组件 `disabled | login | dashboard`；dashboard 内两栏（移动端纵向堆叠）：文章列表（标题+日期+当前编辑高亮）与编辑器（正文 textarea + 「保存」 + 「预览」开关）；预览复用 `@/components/Markdown`；保存成功 toast（sonner）；图标内联 SVG（铅笔/眼睛/退出）。样式复用站点 `--text-*`/`--bg`/`--brand` 等变量。
- 测试：mock 全局 fetch，覆盖「未配置→禁用文案」「configured+未认证→登录表单」「登录成功→列表渲染」「保存调用 PATCH 与令牌头」。

- [ ] admin-api → AdminPage 静态结构 → 状态机接线 → 测试 → `pnpm lint:client && pnpm check:types:client && pnpm test:client` → commit `feat(admin): /admin 管理页（登录+正文编辑+实时预览）`。

### Task 6: 导出脚本 + 端到端验证

**Files:**
- Create: `scripts/export-live-data.mjs`

- [ ] 脚本：读根 `.env`（`node --env-file-if-exists=.env`），`GET {UNICLOUD_URL_BASE}/api/admin/export` 带 `x-seed-token`（或 `x-admin-session`），四个集合落 `uniCloud-<provider>/database/<name>.init_data.json`（仅当目录含 `uniCloud-`，与 export-init-data.mjs 同一守卫）；`--dir` 可覆盖。
- [ ] 本地全检：`pnpm lint && pnpm check:types && pnpm test`。
- [ ] harness 端到端：`pnpm build && pnpm build:unicloud`；带 `ADMIN_PASSWORD/SESSION_SECRET/SEED_TOKEN` 起 `scripts/local-unicloud-harness.mjs stripped 8900`；curl 流：未认证 PATCH→401；错口令→401；锁 5 次→429；正确口令→200+token；带会话头 PATCH→200 且数据变化；seed（会话）→200；export→四集合 JSON；session 探测→authenticated。SPA：`GET /mz-api/` 返回 index.html。
- [ ] commit `feat(admin): 线上数据导出脚本 + 端到端自检`。

### Task 7: 部署 + 线上验证 + push

- [ ] `pnpm deploy:unicloud`（`.env` 已具 HBX 前提；deploys build first if needed）。
- [ ] 线上探测：`/ api/admin/session`→configured（若控制台已配变量）；SPA 散点 `GET /mz-api/`；**Cookie 通路实测**（`curl -i` 登录看 `Set-Cookie` 是否穿透网关——只记录结论，不作为依赖）；口令未配置态确认 login→404。
- [ ] `git push`（沿用直接 push 节奏）；最终消息含控制台待配变量值与激活步骤。
