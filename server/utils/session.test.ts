import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { SESSION_TTL_SEC, signSession, verifySession } from "./session";

const SECRET = "test-secret-for-vitest-only";
const NOW = 1_790_000_000; // 固定「当前时间」，避免测试依赖真实时钟

describe("signSession / verifySession", () => {
  it("签发后可校验通过，载荷字段一致", () => {
    const token = signSession("admin", SECRET, { nowSec: NOW });
    const payload = verifySession(token, SECRET, NOW + 60);
    expect(payload).not.toBeNull();
    expect(payload?.sub).toBe("admin");
    expect(payload?.iat).toBe(NOW);
    expect(payload?.exp).toBe(NOW + SESSION_TTL_SEC);
  });

  it("过期（超过容忍窗口）→ null", () => {
    // exp = NOW + TTL，把「当前时间」拨到 exp 之后 61 秒（漂移容忍 60 秒）→ 无效
    const token = signSession("admin", SECRET, { nowSec: NOW });
    expect(verifySession(token, SECRET, NOW + SESSION_TTL_SEC + 61)).toBeNull();
  });

  it("过期但在 60 秒漂移容忍窗口内 → 仍有效", () => {
    const token = signSession("admin", SECRET, { nowSec: NOW, ttlSec: 100 });
    expect(verifySession(token, SECRET, NOW + 100 + 60)).not.toBeNull();
  });

  it("篡改载荷（换 sub）→ null", () => {
    const token = signSession("admin", SECRET, { nowSec: NOW });
    const [h, , s] = token.split(".");
    const forgedPayload = Buffer.from(
      JSON.stringify({ sub: "attacker", iat: NOW, exp: NOW + SESSION_TTL_SEC }),
    ).toString("base64url");
    expect(verifySession(`${h}.${forgedPayload}.${s}`, SECRET, NOW)).toBeNull();
  });

  it("篡改签名 → null", () => {
    const token = signSession("admin", SECRET, { nowSec: NOW });
    const [h, p] = token.split(".");
    const badSig = Buffer.from("00".repeat(32), "hex").toString("base64url");
    expect(verifySession(`${h}.${p}.${badSig}`, SECRET, NOW)).toBeNull();
  });

  it("错误密钥 → null", () => {
    const token = signSession("admin", SECRET, { nowSec: NOW });
    expect(verifySession(token, "another-secret", NOW)).toBeNull();
  });

  it("格式损坏（段数不足/非 base64/非 JSON）→ null 而非抛异常", () => {
    expect(verifySession("not-a-jwt", SECRET, NOW)).toBeNull();
    expect(verifySession("a.b", SECRET, NOW)).toBeNull();
    expect(verifySession("!!!.???.*", SECRET, NOW)).toBeNull();
    const token = signSession("admin", SECRET, { nowSec: NOW });
    const [h, , s] = token.split(".");
    const garbage = Buffer.from("not-json").toString("base64url");
    expect(verifySession(`${h}.${garbage}.${s}`, SECRET, NOW)).toBeNull();
  });

  it("载荷缺字段（sub 缺失 / iat 非数字）→ null", () => {
    // 用正确签名签一个缺字段载荷：手工拼（header 固定，签名对 h.p 生效）
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ exp: NOW + 100 })).toString("base64url");
    const sig = createHmac("sha256", SECRET).update(`${header}.${payload}`).digest("base64url");
    const token = `${header}.${payload}.${sig}`;
    expect(verifySession(token, SECRET, NOW)).toBeNull();
  });

  it("空 sub 签发时直接抛错（调用方契约）", () => {
    expect(() => signSession("", SECRET, { nowSec: NOW })).toThrow();
  });
});
