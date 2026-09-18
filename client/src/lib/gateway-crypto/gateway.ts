import { calculateSignature } from "./crypto";
import type { GatewayConfigResponse } from "./types";

const CONFIG_PATH = "/gateway/config";

function buildSignatureInput(baseURL: string): string {
  const origin = window.origin || `${window.location.protocol}//${window.location.host}`;
  const prefix = baseURL.startsWith("http") ? baseURL : origin + baseURL;
  return prefix.replace(/\/$/, "") + CONFIG_PATH;
}

export async function fetchGatewayConfig(gatewayBaseURL: string): Promise<GatewayConfigResponse> {
  const signature = calculateSignature(buildSignatureInput(gatewayBaseURL));
  const url = gatewayBaseURL.startsWith("http")
    ? gatewayBaseURL.replace(/\/$/, "") + CONFIG_PATH
    : CONFIG_PATH;

  const resp = await fetch(url, {
    headers: { sign: signature, accept: "application/json, text/plain, */*" },
  });
  if (!resp.ok) throw new Error(`gateway config HTTP ${resp.status}`);
  return resp.json() as Promise<GatewayConfigResponse>;
}
