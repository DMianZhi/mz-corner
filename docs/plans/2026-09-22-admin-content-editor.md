# 管理后台 v2：全内容编辑器（方案 B）

## 背景

- 现状：`/admin` 只能改文章 `content` 一个字段；界面为 v1 布局（用户评价：布局不行）
- 目标：**四类内容全部可编辑**（文章 / 项目 / 评论 / 站点设置）；界面改为**方案 B**（顶部标签 + 全页沉浸编辑）
- 视觉：复用站点「暗室色标 / Color Index」CSS 变量（深色基底 `#0A0A0B` + 酸性黄绿信号色 `#C8F542`），明暗继承 `html.light`

## 设计决策

| 决策 | 理由 |
|---|---|
| 后端新增通用内容 API `/api/admin/content/:collection` | 单字段 PATCH 无法覆盖四类内容；通用路由 + 字段白名单即可 |
| 字段白名单 + 类型校验（`server/utils/content-schema.ts`） | 通用路由必须挡住 `_id` 等系统字段与非法值，否则等于开放任意写 |
| schema 同时携带 label/type 元数据，并暴露 `GET /api/admin/content` | 前端表单由 schema 驱动，字段名/标签单一事实源，避免前后端各写一份 |
| 站点设置走集合级批量保存（`PUT`） | 它是 10 条 key-value 文档一组，逐条 PATCH 会产生 10 次请求 |
| 前端样式一律引用站点 CSS 变量，不硬编码颜色 | 明暗主题、品牌色自动跟随，零额外适配 |
| 拆 `components/admin/` 组件目录 | 单文件会超过 600 行，难维护 |

## 任务

1. `content-schema`（白名单/校验/元数据）+ 单测（TDD）
2. 通用 CRUD 路由：list / create / update / delete / bulk（全部走 `requireAdminToken`）
3. `admin-api.ts` 扩展（内容读写 + schema 拉取）
4. 前端组件：`admin/ui` 基元 / 文章 / 项目 / 评论 / 站点设置
5. `AdminPage` 壳（登录门 + 顶部标签 + 各面板装配）
6. 静态检查：typecheck / lint / test / build
7. 本地 harness + 浏览器 E2E
8. 部署上线 + push

## 验收标准

- 四类内容均可读、可改、可存；文章支持 Markdown 分屏预览
- 明暗两主题下配色与站点一致（引用同一批 CSS 变量）
- 未配 `ADMIN_PASSWORD` 时管理端 404 隐藏（语义不变）
- 所有写端点经 `requireAdminToken`；白名单外的字段一律拒绝
- 前台行为零回归（文章列表/详情/评论/项目接口不变）
