import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { devErrorReporter } from "./src/plugins/dev-error-reporter";
import { gatewayProxy } from "./src/plugins/gateway-proxy";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const appBaseUrl = env.APP_BASE_URL || "https://open.wps.cn/app-studio/app-base";
  const devPort = Number(process.env.DEV_PORT || 5917);
  const sandboxAllowedHosts = [".qwps.net"];
  const targetOrigin = (() => {
    try {
      return new URL(appBaseUrl).origin;
    } catch {
      return appBaseUrl;
    }
  })();
  const wpsSid = (env.WPS_SID || process.env.WPS_SID || "").trim();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function injectPrivateHeaders(proxyReq: any) {
    proxyReq.setHeader("Referer", targetOrigin);
    proxyReq.setHeader("Origin", targetOrigin);
    if (wpsSid) {
      proxyReq.setHeader("Cookie", `wps_sid=${wpsSid}`);
      proxyReq.setHeader("X-Wps-Sid", wpsSid);
    }
  }

  return {
    base: "./",
    // gatewayProxy 注册在 proxy 之前：加密环境拦截请求，非加密环境 next() 透传给 proxy
    plugins: [react(), tailwindcss(), tsconfigPaths({ ignoreConfigErrors: true }), devErrorReporter(), gatewayProxy()],
    server: {
      host: "0.0.0.0",
      port: devPort,
      allowedHosts: [...sandboxAllowedHosts],
      proxy: {
        "/base-proxy/wps365": {
          target: appBaseUrl,
          changeOrigin: true,
          secure: false,
          rewrite: (path: string) => path.replace("/base-proxy/wps365", "/base-proxy"),
          configure: (proxy: any) => {
            proxy.on("proxyReq", (proxyReq: any) => injectPrivateHeaders(proxyReq));
          },
        },
        "/base-proxy": {
          target: appBaseUrl,
          changeOrigin: true,
          secure: false,
          configure: (proxy: any) => {
            proxy.on("proxyReq", (proxyReq: any) => injectPrivateHeaders(proxyReq));
          },
        },
        "/app/app-base/base-proxy": {
          target: appBaseUrl,
          changeOrigin: true,
          secure: false,
          rewrite: (path: string) => path.replace(/^\/app\/app-base\/base-proxy/, "/base-proxy"),
          configure: (proxy: any) => {
            proxy.on("proxyReq", (proxyReq: any) => injectPrivateHeaders(proxyReq));
          },
        },
        "/api/manage": {
          target: appBaseUrl,
          changeOrigin: true,
          secure: false,
          configure: (proxy: any) => {
            proxy.on("proxyReq", (proxyReq: any) => injectPrivateHeaders(proxyReq));
          },
        },
        "/api": {
          target: "http://localhost:4917",
          changeOrigin: false,
          configure: (proxy: any) => {
            proxy.on("proxyReq", (proxyReq: any) => {
              if (wpsSid) proxyReq.setHeader("Cookie", `wps_sid=${wpsSid}`);
              if (env.VITE_PROJECT_ID) proxyReq.setHeader("X-Project-Id", env.VITE_PROJECT_ID);
            });
          },
        },
      },
    },
    preview: {
      host: "0.0.0.0",
      allowedHosts: [...sandboxAllowedHosts],
    },
    build: {
      outDir: "dist",
      sourcemap: true,
      target: ["chrome108", "es2022"],
    },
  };
});
