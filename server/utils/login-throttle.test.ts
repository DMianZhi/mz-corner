import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLoginThrottle } from "./login-throttle";

/**
 * 用假时钟测试窗口逻辑：不 sleep、不依赖真实时间。
 */
describe("createLoginThrottle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("失败未达上限 → 未锁定", () => {
    const t = createLoginThrottle();
    for (let i = 0; i < 4; i++) t.registerFailure("ip-1");
    expect(t.isLocked("ip-1")).toBe(false);
  });

  it("失败达到上限 → 锁定", () => {
    const t = createLoginThrottle();
    for (let i = 0; i < 5; i++) t.registerFailure("ip-1");
    expect(t.isLocked("ip-1")).toBe(true);
  });

  it("锁定后过窗口期 → 解除", () => {
    const t = createLoginThrottle({ windowSec: 900 });
    for (let i = 0; i < 5; i++) t.registerFailure("ip-1");
    expect(t.isLocked("ip-1")).toBe(true);
    vi.advanceTimersByTime(901 * 1000);
    expect(t.isLocked("ip-1")).toBe(false);
  });

  it("窗口内继续失败 → 锁定点顺延（滑动窗口）", () => {
    const t = createLoginThrottle({ windowSec: 900 });
    for (let i = 0; i < 4; i++) t.registerFailure("ip-1");
    vi.advanceTimersByTime(600 * 1000);
    t.registerFailure("ip-1"); // 第 5 次失败发生在 t=600s
    vi.advanceTimersByTime(400 * 1000); // t=1000s：距第 5 次失败 400s < 900s
    expect(t.isLocked("ip-1")).toBe(true);
    vi.advanceTimersByTime(501 * 1000); // 距第 5 次失败 901s
    expect(t.isLocked("ip-1")).toBe(false);
  });

  it("登录成功 → 清零", () => {
    const t = createLoginThrottle();
    for (let i = 0; i < 4; i++) t.registerFailure("ip-1");
    t.registerSuccess("ip-1");
    expect(t.isLocked("ip-1")).toBe(false);
    // 清零后再失败 4 次也不应锁定（证明计数确实归零而非累计）
    for (let i = 0; i < 4; i++) t.registerFailure("ip-1");
    expect(t.isLocked("ip-1")).toBe(false);
  });

  it("不同 key 互不影响", () => {
    const t = createLoginThrottle();
    for (let i = 0; i < 5; i++) t.registerFailure("ip-1");
    expect(t.isLocked("ip-2")).toBe(false);
  });

  it("自建实例间状态隔离（模块级不共享）", () => {
    const a = createLoginThrottle();
    const b = createLoginThrottle();
    for (let i = 0; i < 5; i++) a.registerFailure("ip-1");
    expect(b.isLocked("ip-1")).toBe(false);
  });
});
