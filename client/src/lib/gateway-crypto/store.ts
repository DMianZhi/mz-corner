import type { GatewayEncryptConfig } from "./types";

let encryptConfig: GatewayEncryptConfig | null = null;
let encryptionParameters = "";

export function setEncryptConfig(config: GatewayEncryptConfig): void {
  encryptConfig = config;
}

export function getEncryptConfig(): GatewayEncryptConfig | null {
  return encryptConfig;
}

export function isEncryptionEnabled(): boolean {
  return encryptConfig?.is_encryption === true;
}

export function setEncryptionParameters(params: string): void {
  encryptionParameters = params;
}

export function getEncryptionParameters(): string {
  return encryptionParameters;
}
