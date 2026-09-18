import CryptoJS from "crypto-js";

import { encryptRSA } from "./rsa";
import { setEncryptConfig, setEncryptionParameters } from "./store";
import type { GatewayEncryptConfig } from "./types";

const AES_KEY_LEN = 16;
const AES_IV_LEN = 8;

let key: string | null = null;
let iv: string | null = null;

function randomHex(len: number): string {
  return CryptoJS.lib.WordArray.random(len).toString(CryptoJS.enc.Hex).slice(0, len * 2);
}

function getKey(): string {
  return (key ??= randomHex(AES_KEY_LEN));
}

function getIV(): string {
  return (iv ??= randomHex(AES_IV_LEN));
}

export function encryptAES(message: string): string {
  const result = CryptoJS.AES.encrypt(CryptoJS.enc.Utf8.parse(message), CryptoJS.enc.Utf8.parse(getKey()), {
    iv: CryptoJS.enc.Utf8.parse(getIV()),
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });
  return CryptoJS.enc.Base64.stringify(result.ciphertext);
}

export function decryptAES(content: string): string {
  const result = CryptoJS.AES.decrypt(content, CryptoJS.enc.Utf8.parse(getKey()), {
    iv: CryptoJS.enc.Utf8.parse(getIV()),
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });
  return result.toString(CryptoJS.enc.Utf8);
}

export function calculateSignature(url: string): string {
  return CryptoJS.SHA256(url + "1024").toString(CryptoJS.enc.Hex);
}

export function isEncryptedResponse(headers: Headers): boolean {
  return headers.get("encryption") === "1";
}

export function decryptResponseData(ciphertext: string): unknown {
  const text = decryptAES(ciphertext);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function applyGatewayEncryptConfig(config: GatewayEncryptConfig): Promise<void> {
  const pubkey = CryptoJS.enc.Base64.parse(config.public_key).toString(CryptoJS.enc.Utf8);
  const payload = JSON.stringify({ private_key: getKey(), iv: getIV() });
  const encrypted = await encryptRSA(payload, pubkey);
  if (!encrypted) throw new Error("RSA encryption failed");
  setEncryptionParameters(encrypted);
  setEncryptConfig(config);
}
