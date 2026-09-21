/**
 * 登录防爆破节流（内存计数，滑动窗口）。
 *
 * 为什么内存计数：单用户管理面，攻击者锁定的是「他自己的 IP」，不影响真实
 * 用户；实例重启计数丢失是已知局限——重启后多给它几次尝试机会而已，窗口
 * 仍在。要持久化计数需引入数据库写放大，对单人博客不成比例。
 *
 * 滑动窗口语义：锁定解除时间 = 最近一次失败时间 + windowSec。
 * 窗口内每次新失败都会顺延锁定点（而非固定窗口的重置）。
 * 判定基于完整失败历史（不先剪枝）——剪枝只服务内存上限，
 * 否则早期失败被剪掉会让「不足 max 次」的误判提前解锁。
 */

export interface LoginThrottle {
  /** 记录一次该 key 的登录失败 */
  registerFailure(key: string): void;
  /** 记录一次该 key 的登录成功：清零其失败历史 */
  registerSuccess(key: string): void;
  /** 该 key 当前是否处于锁定状态 */
  isLocked(key: string): boolean;
}

export interface LoginThrottleOptions {
  /** 允许的最大连续失败次数（默认 5） */
  max?: number;
  /** 锁定窗口秒数（默认 900 = 15 分钟） */
  windowSec?: number;
  /** 时钟源注入（测试用）；默认 Date.now */
  now?: () => number;
}

export function createLoginThrottle(options: LoginThrottleOptions = {}): LoginThrottle {
  const max = Math.max(1, Math.floor(options.max ?? 5));
  const windowMs = Math.max(1, (options.windowSec ?? 900) * 1000);
  const now = options.now ?? Date.now;

  /** key → 失败时间戳列表（升序）。只截尾保内存，不按时间剪——见文件头 */
  const failures = new Map<string, number[]>();
  const MAX_HISTORY = 100;

  return {
    registerFailure(key: string): void {
      const list = failures.get(key) ?? [];
      list.push(now());
      if (list.length > MAX_HISTORY) list.splice(0, list.length - MAX_HISTORY);
      failures.set(key, list);
    },

    registerSuccess(key: string): void {
      failures.delete(key);
    },

    isLocked(key: string): boolean {
      const list = failures.get(key);
      if (!list || list.length < max) return false;
      const lastFailure = list[list.length - 1];
      return now() < lastFailure + windowMs;
    },
  };
}
