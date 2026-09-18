/**
 * Vite plugin: 私有化加密网关代理。
 *
 * 启动时自动 fetch gateway config 判断是否需要加密。
 * encryption_mode "1" 或 "2" 时启用，拦截 /base-proxy 和 /api/manage 请求，
 * 使用 RSA+AES 信封加密协议与网关通信。
 *
 * 非加密环境（encryption_mode "0" 或无私网配置）此插件不做任何事，
 * 请求走 vite.config.ts 中原有的 proxy 配置。
 *
 * 需要的环境变量（写入 client/.env.local）：
 *   PRIVATE_GATEWAY_URL  — 私网网关根地址（如 https://10.x.x.x/path）
 *   APP_BASE_URL         — 私网 app-base 地址（加密请求的 POST 目标）
 *   WPS_SID              — 用户凭证
 */
import type { Plugin, ConfigEnv, ViteDevServer } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import crypto from "node:crypto";
import https from "node:https";
import http from "node:http";
import { loadEnv } from "vite";

const tlsAgent = new https.Agent({ rejectUnauthorized: false });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GatewayEncryptionConfig {
  is_encryption: boolean;
  algorithm: string;
  public_key: string;
}

interface GatewayConfig {
  encryption: GatewayEncryptionConfig;
  entry_json_config: { encryption_mode: string };
}

interface ResolvedEncryption {
  appBaseUrl: string;
  publicKeyB64: string;
  algorithm: string;
  wpsSid: string;
  gatewayOrigin: string;
}

// ---------------------------------------------------------------------------
// Crypto primitives (matches sidecar gateway-crypto.ts)
// ---------------------------------------------------------------------------

function generateAesKeyIv(): { key: string; iv: string } {
  return {
    key: crypto.randomBytes(16).toString("hex"),
    iv: crypto.randomBytes(8).toString("hex"),
  };
}

function aesEncrypt(key: string, iv: string, plaintext: string): string {
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  return encrypted.toString("base64");
}

function aesDecrypt(key: string, iv: string, ciphertextB64: string): string {
  const ct = Buffer.from(ciphertextB64.trim(), "base64");
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  const decrypted = Buffer.concat([decipher.update(ct), decipher.final()]);
  return decrypted.toString("utf-8");
}

function rsaEncrypt(publicKeyB64: string, plaintext: string): string {
  const pemBytes = Buffer.from(publicKeyB64, "base64");
  const pemStr = pemBytes.toString("utf-8").trim();
  return crypto
    .publicEncrypt({ key: pemStr, padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(plaintext, "utf-8"))
    .toString("base64");
}

// ---------------------------------------------------------------------------
// HTTP helper — 使用 node:https 模块，rejectUnauthorized: false 兼容自签证书
// ---------------------------------------------------------------------------

function nodeRequest(
  url: string,
  opts: { method?: string; headers?: Record<string, string>; body?: string },
): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === "https:";
    const mod = isHttps ? https : http;

    const req = mod.request(
      parsed,
      {
        method: opts.method || "GET",
        headers: opts.headers,
        ...(isHttps ? { agent: tlsAgent } : {}),
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () =>
          resolve({
            status: res.statusCode || 0,
            headers: res.headers as Record<string, string | string[] | undefined>,
            body: Buffer.concat(chunks).toString("utf-8"),
          }),
        );
      },
    );
    req.on("error", reject);
    req.setTimeout(15000, () => {
      req.destroy(new Error("request timeout"));
    });
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Gateway config fetch (matches gateway.rs gateway_fetch_config)
// ---------------------------------------------------------------------------

function calculateSignature(url: string): string {
  return crypto.createHash("sha256").update(`${url}1024`).digest("hex");
}

async function fetchGatewayConfig(gatewayUrl: string): Promise<GatewayConfig> {
  const url = `${gatewayUrl.replace(/\/+$/, "")}/gateway/config`;
  const sign = calculateSignature(url);

  const resp = await nodeRequest(url, {
    headers: { sign, accept: "application/json, text/plain, */*" },
  });
  if (resp.status < 200 || resp.status >= 300) {
    throw new Error(`gateway config HTTP ${resp.status}: ${resp.body}`);
  }
  return JSON.parse(resp.body) as GatewayConfig;
}

// ---------------------------------------------------------------------------
// Encrypted fetch
// ---------------------------------------------------------------------------

async function encryptedFetch(
  enc: ResolvedEncryption,
  method: string,
  api: string,
  queryString: string,
  body: string | null,
): Promise<{ status: number; body: string; contentType: string }> {
  const { key, iv } = generateAesKeyIv();
  const schema = enc.appBaseUrl.startsWith("https") ? "https" : "http";

  const apiParamsB64 = aesEncrypt(
    key,
    iv,
    JSON.stringify({ schema, method: method.toUpperCase(), api, query_string: queryString }),
  );
  const encParamsB64 = rsaEncrypt(enc.publicKeyB64, JSON.stringify({ private_key: key, iv }));

  const postUrl = enc.appBaseUrl.replace(/\/+$/, "");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Encryption-Algorithm": enc.algorithm,
    "API-Parameters": apiParamsB64,
    "Encryption-Parameters": encParamsB64,
    Referer: enc.gatewayOrigin,
    Origin: enc.gatewayOrigin,
  };
  if (enc.wpsSid) {
    headers["Cookie"] = `wps_sid=${enc.wpsSid}`;
  }

  let fetchBody: string | undefined;
  if (body) {
    fetchBody = aesEncrypt(key, iv, body);
  }

  const resp = await nodeRequest(postUrl, { method: "POST", headers, body: fetchBody });

  let bodyText: string;
  try {
    bodyText = aesDecrypt(key, iv, resp.body);
  } catch {
    bodyText = resp.body;
  }

  const ct = resp.headers["content-type"];
  return {
    status: resp.status,
    body: bodyText,
    contentType: (Array.isArray(ct) ? ct[0] : ct) || "application/json",
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function collectBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export function gatewayProxy(): Plugin {
  let encPromise: Promise<ResolvedEncryption | null> | null = null;
  let logger: { info: (msg: string) => void } = { info: () => {} };

  return {
    name: "gateway-encrypted-proxy",
    configResolved(config) {
      logger = config.logger;
    },
    apply: "serve",

    config(_: unknown, { mode }: ConfigEnv) {
      const env = loadEnv(mode, process.cwd(), "");
      const gatewayUrl = env.PRIVATE_GATEWAY_URL;
      if (!gatewayUrl) return;

      const appBaseUrl = env.APP_BASE_URL || "";
      const wpsSid = env.WPS_SID || "";
      let gatewayOrigin: string;
      try {
        gatewayOrigin = new URL(gatewayUrl).origin;
      } catch {
        gatewayOrigin = gatewayUrl;
      }

      encPromise = fetchGatewayConfig(gatewayUrl)
        .then((config) => {
          const mode = config.entry_json_config?.encryption_mode;
          if (mode !== "1" && mode !== "2") {
            logger.info(`[gateway-proxy] encryption_mode="${mode}", encryption disabled`);
            return null;
          }
          const pk = config.encryption?.public_key;
          const algo = config.encryption?.algorithm;
          if (!pk || !algo) {
            console.warn("[gateway-proxy] encryption config incomplete, disabled");
            return null;
          }
          logger.info(`[gateway-proxy] encryption enabled (mode=${mode}), target=${appBaseUrl}`);
          return { appBaseUrl, publicKeyB64: pk, algorithm: algo, wpsSid, gatewayOrigin };
        })
        .catch((err) => {
          console.warn("[gateway-proxy] failed to fetch gateway config, encryption disabled:", err);
          return null;
        });
    },

    configureServer(server: ViteDevServer) {
      if (!encPromise) return;

      const pending = encPromise;

      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const url = req.url || "";
        const isBaseProxy = url.startsWith("/base-proxy");
        const isApiManage = url.startsWith("/api/manage");
        if (!isBaseProxy && !isApiManage) {
          next();
          return;
        }

        (async () => {
          const encCfg = await pending;
          if (!encCfg) {
            next();
            return;
          }

          let apiPath = url;
          if (url.startsWith("/base-proxy/wps365")) {
            apiPath = url.replace("/base-proxy/wps365", "/base-proxy");
          }

          const qIdx = apiPath.indexOf("?");
          const api = qIdx === -1 ? apiPath : apiPath.slice(0, qIdx);
          const queryString = qIdx === -1 ? "" : apiPath.slice(qIdx + 1);
          const method = req.method || "GET";

          try {
            const body = ["POST", "PUT", "PATCH"].includes(method.toUpperCase())
              ? await collectBody(req)
              : null;

            const result = await encryptedFetch(encCfg, method, api, queryString, body);

            res.writeHead(result.status, {
              "Content-Type": result.contentType,
              "Access-Control-Allow-Origin": "*",
            });
            res.end(result.body);
          } catch (err) {
            console.error("[gateway-proxy] error:", err);
            res.writeHead(502, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: String(err) }));
          }
        })();
      });
    },
  };
}
