export interface GatewayEncryptConfig {
  is_encryption: boolean;
  algorithm: string;
  public_key: string;
  expires: number;
}

export interface GatewayConfigResponse {
  encryption?: GatewayEncryptConfig;
}
