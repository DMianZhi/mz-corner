import { describe, expect, it } from "vitest";
import { checkAdminToken, resolveAdminAuth } from "./admin-auth";

/**
 * resolveAdminAuth 真值表：三通道决策纯函数。
 * 通道优先级：管理员会话（x-admin-session）> Cookie 同值 > 旧 seed 令牌头。
 * 返回值映射 HTTP：ok→放行；unauthorized→401；forbidden→403；hidden→404。
 */
describe("resolveAdminAuth", () => {
  const base = {
    adminConfigured: true,
    seedConfigured: true,
    sessionProvided: false,
    sessionValid: false,
    seedProvided: false,
    seedValid: false,
  };

  it("会话有效 → ok（其它通道无关）", () => {
    expect(resolveAdminAuth({ ...base, sessionProvided: true, sessionValid: true })).toBe("ok");
    expect(resolveAdminAuth({ ...base, sessionProvided: true, sessionValid: true, seedProvided: true, seedValid: false })).toBe("ok");
  });

  it("提供了会话但无效 → unauthorized（401：请重新登录）", () => {
    expect(resolveAdminAuth({ ...base, sessionProvided: true, sessionValid: false })).toBe("unauthorized");
  });

  it("新守卫语义：admin 已配 + 无会话 → unauthorized（401），即使 seed 令牌正确", () => {
    // 管理后台已激活后，写端点统一走会话语义；seed 头不再作为旁路
    expect(resolveAdminAuth({ ...base, seedProvided: true, seedValid: true })).toBe("unauthorized");
  });

  it("admin 未配但 SEED_TOKEN 已配：有效 seed 头 → ok（向后兼容）", () => {
    expect(
      resolveAdminAuth({ ...base, adminConfigured: false, seedProvided: true, seedValid: true }),
    ).toBe("ok");
    expect(resolveAdminAuth({ ...base, adminConfigured: false })).toBe("unauthorized");
    // 语义解释：adminConfigured=false + session 提供但无效 → 仍 401
    expect(
      resolveAdminAuth({ ...base, adminConfigured: false, sessionProvided: true, sessionValid: false }),
    ).toBe("unauthorized");
  });

  it("两者皆未配置 → hidden（404：端点不存在）", () => {
    expect(
      resolveAdminAuth({ ...base, adminConfigured: false, seedConfigured: false }),
    ).toBe("hidden");
    expect(
      resolveAdminAuth({
        adminConfigured: false,
        seedConfigured: false,
        sessionProvided: true,
        sessionValid: true,
        seedProvided: true,
        seedValid: true,
      }),
    ).toBe("hidden");
  });

  it("seed 配置存在但提供错误令牌 → forbidden（403）", () => {
    expect(
      resolveAdminAuth({ ...base, adminConfigured: false, seedProvided: true, seedValid: false }),
    ).toBe("forbidden");
  });
});

/**
 * 直接测纯函数 checkAdminToken：状态机的三个分支（ok / disabled / invalid）
 * 加上边界（空白、trim、前缀、后缀、大小写）。
 * HTTP 层（404 vs 403 的映射）由 requireAdminToken 负责，逻辑只有一行映射，
 * 交给本地 harness 的真机验证覆盖（见 deploy/unicloud/README.md 的自检清单）。
 */
describe("checkAdminToken", () => {
  describe("未配置令牌（服务端没设 SEED_TOKEN）→ disabled", () => {
    it("空字符串", () => {
      expect(checkAdminToken("", "anything")).toBe("disabled");
    });

    it("只有空白也视为未配置（配置了一个空格等于没配）", () => {
      expect(checkAdminToken("   ", "anything")).toBe("disabled");
      expect(checkAdminToken("\t\n", "anything")).toBe("disabled");
    });

    it("disabled 优先级最高：即使请求头也为空，仍返回 disabled 而非 invalid", () => {
      expect(checkAdminToken("", "")).toBe("disabled");
    });
  });

  describe("已配置令牌", () => {
    const TOKEN = "s3cret-token-value";

    it("完全匹配 → ok", () => {
      expect(checkAdminToken(TOKEN, TOKEN)).toBe("ok");
    });

    it("两侧各自的空白被 trim 后匹配 → ok（防手滑：配置或请求头带了空格）", () => {
      expect(checkAdminToken(` ${TOKEN} `, `  ${TOKEN}\n`)).toBe("ok");
    });

    it("为空 → invalid（没带请求头）", () => {
      expect(checkAdminToken(TOKEN, "")).toBe("invalid");
      expect(checkAdminToken(TOKEN, "   ")).toBe("invalid");
    });

    it("错误令牌 → invalid", () => {
      expect(checkAdminToken(TOKEN, "wrong-token")).toBe("invalid");
    });

    it("只差大小写 → invalid（令牌区分大小写）", () => {
      expect(checkAdminToken(TOKEN, TOKEN.toUpperCase())).toBe("invalid");
    });

    it("前缀/后缀/子串都不行 → invalid（防渐进式猜解）", () => {
      expect(checkAdminToken(TOKEN, TOKEN.slice(0, -1))).toBe("invalid");
      expect(checkAdminToken(TOKEN, `${TOKEN}x`)).toBe("invalid");
      expect(checkAdminToken(TOKEN, TOKEN.slice(1, -1))).toBe("invalid");
    });

    it("长令牌配短请求（或反之）→ invalid，不抛异常", () => {
      expect(() => checkAdminToken(TOKEN, "a")).not.toThrow();
      expect(checkAdminToken(TOKEN, "a")).toBe("invalid");
      expect(() => checkAdminToken("a", TOKEN)).not.toThrow();
      expect(checkAdminToken("a", TOKEN)).toBe("invalid");
    });
  });
});
