/**
 * fetch 拦截器：私网加密环境下自动加密请求、解密响应。
 * monkey-patch window.fetch，对匹配的 API 路径执行 AES 加密后 POST 到 gateway。
 */

import {
  encryptAES,
  getEncryptConfig,
  getEncryptionParameters,
  isEncryptedResponse,
  decryptResponseData,
} from "./gateway-crypto";

const PROXY_PATTERN = /\/base-proxy\b/;

function shouldEncrypt(url: string): boolean {
  const path = url.startsWith("http") ? new URL(url).pathname : url;
  return PROXY_PATTERN.test(path);
}

function splitUrl(url: string): { api: string; qs: string } {
  const full = url.startsWith("http") ? new URL(url).pathname + new URL(url).search : url;
  const q = full.indexOf("?");
  return { api: q === -1 ? full : full.slice(0, q), qs: q === -1 ? "" : full.slice(q + 1) };
}

export function installFetchEncryption(gatewayUrl: string): void {
  const target = gatewayUrl.replace(/\/+$/, "");
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
    const config = getEncryptConfig();

    if (!config?.is_encryption || !shouldEncrypt(url)) {
      return originalFetch(input, init);
    }

    const { api, qs } = splitUrl(url);
    const method = init?.method?.toUpperCase() || "GET";
    const body = init?.body == null ? "" : typeof init.body === "string" ? init.body : String(init.body);

    const apiParams = encryptAES(
      JSON.stringify({
        schema: window.location.protocol.replace(":", ""),
        method,
        api,
        query_string: qs,
      }),
    );

    const resp = await originalFetch(target, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Encryption-Algorithm": config.algorithm,
        "Encryption-Parameters": getEncryptionParameters(),
        "API-Parameters": apiParams,
      },
      body: body ? encryptAES(body) : undefined,
      credentials: "include",
    });

    if (isEncryptedResponse(resp.headers)) {
      const decrypted = decryptResponseData(await resp.text());
      return new Response(JSON.stringify(decrypted), {
        status: resp.status,
        statusText: resp.statusText,
        headers: resp.headers,
      });
    }

    return resp;
  };
}
