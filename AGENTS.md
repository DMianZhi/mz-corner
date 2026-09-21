# AGENTS

## 架构
- 工作区包含两个子包：`client/`（Vite + React 19 + Tailwind 4 + shadcn）和 `server/`（Nitro 2）。
- 前端构建为静态文件（`client/dist`），部署到 uniCloud 前端网页托管。
- 后端构建为云函数产物（`deploy/unicloud/cloudfunctions/mz-corner-api`），部署到 uniCloud 云函数。
- 数据存在同服务空间的云数据库，只能由云函数访问。

## 开发流程

```
pnpm run dev → 编码 → pnpm run lint && pnpm run check:types && pnpm test
```

### 1. 启动开发环境
```bash
pnpm run dev
```
同时启动前端（Vite，http://localhost:5917）和后端（Nitro，http://localhost:4917）。
前端 `/api/*` 请求自动代理到后端。支持 HMR 热更新，保存文件即刷新。

> 端口被占用时直接 kill：`lsof -ti :5917 | xargs kill` / `lsof -ti :4917 | xargs kill`

### 2. 编码

- 前端代码写在 `client/src/`，新建页面放 `pages/`，组件放 `components/`。
- 后端接口写在 `server/routes/api/`，文件名即路由，方法后缀即 HTTP Method（如 `todos.get.ts`）。
- 需要新的 UI 组件时运行 `pnpm dlx shadcn add <名称>`（在 client 目录下）。

### 3. 提交前检查
```bash
pnpm run lint          # oxlint 代码检查
pnpm run check:types   # TypeScript 类型检查
pnpm test              # 前后端单测
```
三个命令都会同时检查前端和后端。确保零错误再提交。

### 4. 构建与部署
```bash
pnpm run build:unicloud    # 云函数产物
pnpm run deploy:unicloud   # 构建 + 上传集合 Schema + 上传云函数 + 自检
```

前端构建与部署细节见 [`deploy/unicloud/README.md`](deploy/unicloud/README.md)。

## 开发规范
- 前端：见 [`client/AGENTS.md`](client/AGENTS.md)
- 后端：见 [`server/AGENTS.md`](server/AGENTS.md)
