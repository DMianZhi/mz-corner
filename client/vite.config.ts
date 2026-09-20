import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const devPort = Number(process.env.DEV_PORT || 5917);
  const apiDevTarget = process.env.API_DEV_TARGET || "http://localhost:4917";

  return {
    // 默认相对路径：适合「传到前端网页托管根目录」的部署（./assets/… → /assets/…）
    // 若部署到子目录（如 mz-corner/），需 VITE_BASE=/mz-corner/ 生成绝对路径——
    // 因为托管的「索引文件」是 302 跳转/内部渲染而非可配置重写，相对路径会解析错。
    base: env.VITE_BASE || "./",
    plugins: [react(), tailwindcss(), tsconfigPaths({ ignoreConfigErrors: true })],
    server: {
      host: "0.0.0.0",
      port: devPort,
      proxy: {
        // 本地联调：前端 /api/* → 本地 nitro 服务（server/，默认 4917）
        "/api": { target: apiDevTarget, changeOrigin: false },
      },
    },
    preview: {
      host: "0.0.0.0",
    },
    build: {
      outDir: "dist",
      sourcemap: true,
      target: ["chrome108", "es2022"],
    },
  };
});
