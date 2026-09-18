import type JSEncrypt from "jsencrypt";

let cachedKey = "";
let instance: InstanceType<typeof JSEncrypt> | null = null;

export async function encryptRSA(data: string, publicKey: string): Promise<string | false> {
  if (!instance || cachedKey !== publicKey) {
    const { default: JSEncrypt } = await import("jsencrypt");
    instance = new JSEncrypt();
    instance.setPublicKey(publicKey);
    cachedKey = publicKey;
  }
  return instance.encrypt(data) || false;
}
