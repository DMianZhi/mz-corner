// 管理后台审计修复 —— 本地端到端自检（真实浏览器 + 内存假库，零生产风险）
//
// 覆盖：登录门 a11y(P2-7) / 次级信息对比度(P1) / 新建不落库(P0-2) / 草稿不丢(P0-1)
//       校验拦截零请求(P2-4,P2-5) / 键名 hint(P2-6) / 删除两步确认 / 控制台零错误
//
// 用法：ADMIN_PASSWORD=mz-local-e2e node scripts/e2e-admin-audit-local.cjs
// 前置：node scripts/local-unicloud-harness.mjs full 8900（带 ADMIN_PASSWORD）
//       DEV_PORT=5199 API_DEV_TARGET=http://127.0.0.1:8900/mz-api pnpm --filter @mz-corner/client dev
const fs = require('node:fs');
const { chromium } = require('C:/Users/admin/.wpscomate/agent/skills/custom/career-ops/node_modules/playwright');

const BASE = process.env.E2E_BASE || 'http://localhost:5199';
const PW = process.env.ADMIN_PASSWORD || 'mz-local-e2e';
const OUT = 'C:/Users/admin/data/work/blog/mz-corner/.wpscomate/e2e-shots';
fs.mkdirSync(OUT, { recursive: true });

let pass = 0;
let fail = 0;
const failures = [];
function check(name, expected, actual) {
  const ok = JSON.stringify(expected) === JSON.stringify(actual);
  if (ok) {
    console.log(`  ok   ${name}`);
    pass++;
  } else {
    console.log(`  FAIL ${name} → 期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
    fail++;
    failures.push(name);
  }
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const consoleErrors = [];
  const writes = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    // 会话探测：未登录时 /api/admin/session 返回 401 属预期，浏览器必然记一条资源错误
    if (text.includes('401') && text.includes('Unauthorized')) return;
    consoleErrors.push(text);
  });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  page.on('request', (r) => {
    if (r.method() !== 'GET' && r.url().includes('/api/')) writes.push(`${r.method()} ${r.url().split('/api/')[1]}`);
  });

  const apiCount = (collection) =>
    page.evaluate(async (c) => {
      const r = await fetch(`/api/admin/content/${c}`);
      const j = await r.json();
      return j.data ? j.data.total : -1;
    }, collection);

  const contrastOf = (selector) =>
    page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const parse = (c) => c.match(/[\d.]+/g).map(Number);
      const lum = (rgb) => {
        const [r, g, b] = rgb.slice(0, 3).map((v) => {
          const x = v / 255;
          return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      let node = el;
      let bg = null;
      while (node) {
        const c = getComputedStyle(node).backgroundColor;
        if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') {
          bg = parse(c);
          break;
        }
        node = node.parentElement;
      }
      const fg = parse(getComputedStyle(el).color);
      const L1 = lum(fg);
      const L2 = lum(bg || [0, 0, 0]);
      return {
        color: getComputedStyle(el).color,
        ratio: Math.round(((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)) * 100) / 100,
      };
    }, selector);

  // ── 1. 登录门 a11y（P2-7） ────────────────────────────────
  console.log('\n[1] 登录门 a11y');
  await page.goto(`${BASE}/#/admin`);
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload();
  const pwInput = page.locator('.adm-reveal input');
  await pwInput.waitFor({ timeout: 15000 });
  check('口令框自动聚焦', '管理口令', await page.evaluate(() => document.activeElement?.getAttribute('aria-label')));
  check('口令框 aria 名', '管理口令', await pwInput.getAttribute('aria-label'));
  check('口令框 autocomplete', 'current-password', await pwInput.getAttribute('autocomplete'));
  check('显隐切换入口存在', 1, await page.locator('.adm-reveal-btn').count());
  check('显隐切换有 aria 名', '显示口令', await page.locator('.adm-reveal-btn').getAttribute('aria-label'));
  await page.locator('.adm-reveal-btn').click();
  check('点切换 → type=text', 'text', await pwInput.getAttribute('type'));
  await page.locator('.adm-reveal-btn').click();
  check('再点 → type=password', 'password', await pwInput.getAttribute('type'));

  // ── 2. 登录进工作台 ──────────────────────────────────────
  console.log('\n[2] 登录');
  await pwInput.fill(PW);
  await page.locator('button[type="submit"]').click();
  await page.locator('.adm-topbar').waitFor({ timeout: 15000 });
  const articlesBefore = await apiCount('articles');
  check('文章数（假库种子）', 3, articlesBefore);
  check('默认落在文章 tab', 1, await page.locator('#adm-tabpanel-articles').count());

  // ── 3. 次级信息对比度（P1） ──────────────────────────────
  console.log('\n[3] 次级信息对比度（P1 目标 ≥4.5:1）');
  const darkTab = await contrastOf('[data-tab="projects"]');
  console.log(`       暗色 .adm-tab → ${darkTab.color}，对比度 ${darkTab.ratio}`);
  check('暗色对比度 ≥4.5', true, darkTab.ratio >= 4.5);
  await page.evaluate(() => {
    localStorage.setItem('theme', 'light');
    document.documentElement.classList.add('light');
  });
  await page.waitForTimeout(300);
  const lightTab = await contrastOf('[data-tab="projects"]');
  console.log(`       亮色 .adm-tab → ${lightTab.color}，对比度 ${lightTab.ratio}`);
  check('亮色对比度 ≥4.5', true, lightTab.ratio >= 4.5);
  await page.screenshot({ path: `${OUT}/audit-local-light.png` });
  await page.evaluate(() => {
    localStorage.setItem('theme', 'dark');
    document.documentElement.classList.remove('light');
  });
  await page.waitForTimeout(300);

  // ── 4. 新建不落库（P0-2） ────────────────────────────────
  console.log('\n[4] 新建不落库（P0-2）');
  const writesBeforeNew = writes.length;
  await page.locator('.adm-link:has-text("新建")').first().click();
  await page.waitForTimeout(600);
  check('新建后库内文章数不变', articlesBefore, await apiCount('articles'));
  check('新建未发出写请求', writesBeforeNew, writes.length);
  check('出现本地草稿标记', true, (await page.locator('.adm-ritem-t:has-text("本地草稿")').count()) > 0);
  await page.screenshot({ path: `${OUT}/audit-local-new-draft.png` });
  await page.locator('.adm-link:has-text("放弃")').first().click();
  await page.waitForTimeout(500);
  check('放弃后本地草稿消失', 0, await page.locator('.adm-ritem-t:has-text("本地草稿")').count());
  check('放弃后库内仍不变', articlesBefore, await apiCount('articles'));

  // ── 5. 草稿切走不丢 + 未保存徽标（P0-1 / P3） ────────────
  console.log('\n[5] 草稿不丢 + 未保存徽标');
  await page.locator('.adm-ritem').first().click();
  const titleInput = page.locator('.adm-input--title');
  await titleInput.waitFor({ timeout: 10000 });
  const originalTitle = await titleInput.inputValue();
  await titleInput.fill('E2E 草稿保留验证');
  await page.waitForTimeout(300);
  check('顶栏出现未保存徽标', true, (await page.locator('.adm-topbar .adm-badge:has-text("未保存")').count()) > 0);
  await page.locator('[data-tab="projects"]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-tab="articles"]').click();
  await page.waitForTimeout(500);
  await page.locator('.adm-ritem').first().click();
  await page.waitForTimeout(400);
  check('切走再回来草稿还在', 'E2E 草稿保留验证', await page.locator('.adm-input--title').inputValue());
  check('索引栏草稿点存在', true, (await page.locator('.adm-ritem-p').count()) > 0);
  // beforeunload 守卫（P3）：有草稿时 dispatch 一个可取消事件，handler 应 preventDefault
  const guarded = await page.evaluate(() => {
    const e = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(e);
    return e.defaultPrevented;
  });
  check('有草稿时关页被拦（beforeunload）', true, guarded);

  // ── 6. 客户端校验拦截，不发请求（P2-4 / P2-5） ───────────
  console.log('\n[6] 校验拦截零请求（P2-4 / P2-5）');
  await page.locator('.adm-input--title').fill('');
  await page.waitForTimeout(200);
  const writesBeforeSave = writes.length;
  await page.locator('.adm-btn:has-text("保存")').first().click();
  await page.waitForTimeout(700);
  check('空标题保存被拦下（无写请求）', writesBeforeSave, writes.length);
  check('字段级错误可见', true, (await page.locator('.adm-field-error').count()) > 0);
  check('焦点落到出错字段', true, await page.evaluate(() => document.activeElement?.classList.contains('adm-input--title') ?? false));
  const errText = await page.locator('.adm-field-error').first().textContent();
  console.log(`       错误文案：${(errText || '').trim()}`);
  await page.screenshot({ path: `${OUT}/audit-local-validation.png` });

  // 恢复标题，再走「放弃」入口（本轮补齐：已落库文章此前没有放弃按钮）
  await page.locator('.adm-input--title').fill(originalTitle);
  await page.waitForTimeout(200);
  await page.locator('.adm-link:has-text("放弃")').first().click();
  await page.waitForTimeout(400);
  check('放弃后未保存徽标消失', 0, await page.locator('.adm-topbar .adm-badge:has-text("未保存")').count());
  check('放弃后草稿点消失', 0, await page.locator('.adm-ritem-p').count());
  const guardedAfter = await page.evaluate(() => {
    const e = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(e);
    return e.defaultPrevented;
  });
  check('放弃后不再拦（beforeunload）', false, guardedAfter);

  // ── 7. 站点设置键名 hint（P2-6） ────────────────────────
  console.log('\n[7] 站点设置键名提示（P2-6）');
  await page.locator('[data-tab="site_config"]').click();
  await page.waitForTimeout(500);
  await page.locator('.adm-ritem').first().click();
  await page.waitForTimeout(400);
  const hints = await page.locator('.adm-field-hint').allTextContents();
  const keyHint = hints.find((h) => h.includes('按键名读取配置'));
  check('键名 hint 存在', true, Boolean(keyHint));
  if (keyHint) console.log(`       hint：${keyHint.trim()}`);

  // ── 8. 删除两步确认 ─────────────────────────────────────
  console.log('\n[8] 删除两步确认');
  await page.locator('[data-tab="articles"]').click();
  await page.waitForTimeout(500);
  const items = page.locator('.adm-ritem');
  const beforeDelete = await apiCount('articles');
  await items.nth(1).click();
  await page.waitForTimeout(400);
  const delBtn = page.locator('.adm-btn--danger:has-text("删除")').first();
  await delBtn.click();
  await page.waitForTimeout(200);
  check('首次点击 → 变为「确认删除」', true, (await page.locator('.adm-btn--danger:has-text("确认删除")').count()) > 0);
  await page.screenshot({ path: `${OUT}/audit-local-delete-armed.png` });
  check('首次点击未删库', beforeDelete, await apiCount('articles'));
  console.log('       等 3.3 秒看是否自动回退…');
  await page.waitForTimeout(3300);
  check('超时自动回退为「删除」', true, (await page.locator('.adm-btn--danger:has-text("确认删除")').count()) === 0);
  check('回退后仍未删库', beforeDelete, await apiCount('articles'));

  const writesBeforeDelete = writes.length;
  await page.locator('.adm-btn--danger:has-text("删除")').first().click();
  await page.waitForTimeout(250);
  await page.locator('.adm-btn--danger:has-text("确认删除")').first().click();
  await page.waitForTimeout(1200);
  check('二次确认后库内减少 1 条', beforeDelete - 1, await apiCount('articles'));
  check('删除请求已发出', true, writes.length > writesBeforeDelete);
  check('删除后回到空态或下一篇文章', true, (await page.locator('.adm-ritem').count()) === beforeDelete - 1);

  // ── 9. 控制台零错误 ────────────────────────────────────
  console.log('\n[9] 控制台');
  check('无控制台错误', 0, consoleErrors.length);
  if (consoleErrors.length) consoleErrors.slice(0, 5).forEach((e) => console.log(`       ${e}`));

  await browser.close();
  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  if (failures.length) console.log(`失败项：${failures.join('、')}`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((error) => {
  console.error('脚本异常：', error);
  process.exit(1);
});
