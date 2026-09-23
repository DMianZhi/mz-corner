// 线上冒烟（审计修复验证）：真实环境 + 真实数据，零写库。
//
// 红线：除「新建 → 放弃」与「删除 → 只点一次后等它自动回退」这类
//       不产生写请求的动作外，不点任何会落库的按钮。全程断言「写请求数 = 0」。
//
// 用法：ADMIN_PASSWORD=<线上口令> node scripts/smoke-admin-audit-live.cjs
// 站点地址与 API 地址取自本地 .env / client/.env.production.local（均已 gitignore）。
const fs = require('node:fs');
const { chromium } = require('C:/Users/admin/.wpscomate/agent/skills/custom/career-ops/node_modules/playwright');

function readEnvFile(file, key) {
  try {
    const line = fs
      .readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .find((l) => l.startsWith(key + '='));
    return line ? line.slice(key.length + 1).trim().replace(/^["']|["']$/g, '') : '';
  } catch {
    return '';
  }
}

const staticHost = process.env.SMOKE_BASE || readEnvFile('.env', 'UNICLOUD_STATIC_HOST');
const apiBase = (readEnvFile('.env', 'UNICLOUD_URL_BASE') || readEnvFile('client/.env.production.local', 'VITE_API_BASE')).replace(/\/$/, '');
if (!staticHost) throw new Error('缺少站点地址：请在根目录 .env 配置 UNICLOUD_STATIC_HOST');
if (!apiBase) throw new Error('缺少 API 地址：请在根目录 .env 配置 UNICLOUD_URL_BASE');
const PW = process.env.ADMIN_PASSWORD;
if (!PW) throw new Error('缺少 ADMIN_PASSWORD 环境变量');

const SITE = `${staticHost.replace(/\/$/, '')}/index.html#/admin`;
const OUT = 'C:/Users/admin/data/work/blog/mz-corner/.wpscomate/live-shots';
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

/** 线上文章总数（公开接口，只读；不依赖管理会话） */
async function publicCount() {
  const res = await fetch(`${apiBase}/api/blog/posts?page=1&pageSize=50`);
  const json = await res.json();
  const items = (json.data && json.data.items) || json.posts || json.items || [];
  return items.length;
}

(async () => {
  const total = await publicCount();
  console.log(`线上文章总数：${total}`);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const consoleErrors = [];
  const writes = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    // 会话探测：未登录时 /api/admin/session 返回 401 属预期，浏览器必然记一条资源错误
    if (text.includes('401')) return;
    consoleErrors.push(text);
  });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  // 只统计「内容写」：登录/会话/登出本身是 POST，不算数据写入
  page.on('request', (r) => {
    const path = r.url().split('/api/')[1] || '';
    const isAuth = path.startsWith('admin/login') || path.startsWith('admin/session') || path.startsWith('admin/logout');
    if (r.method() !== 'GET' && r.url().includes('/api/') && !isAuth) writes.push(`${r.method()} ${path}`);
  });

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

  // ── 0. 线上构建版本 ─────────────────────────────────────
  console.log('\n[0] 线上构建');
  const html = await (await fetch(`${staticHost.replace(/\/$/, '')}/index.html`)).text();
  const bundle = (html.match(/assets\/index-[A-Za-z0-9_-]+\.js/) || [''])[0];
  console.log(`       bundle：${bundle}`);
  check('bundle 存在', true, bundle.length > 0);

  // ── 1. 登录门 a11y（P2-7） ──────────────────────────────
  console.log('\n[1] 登录门 a11y');
  await page.goto(SITE);
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload();
  const pwInput = page.locator('.adm-reveal input');
  await pwInput.waitFor({ timeout: 20000 });
  check('口令框自动聚焦', '管理口令', await page.evaluate(() => document.activeElement?.getAttribute('aria-label')));
  check('口令框 aria 名', '管理口令', await pwInput.getAttribute('aria-label'));
  check('口令框 autocomplete', 'current-password', await pwInput.getAttribute('autocomplete'));
  check('显隐切换入口存在', 1, await page.locator('.adm-reveal-btn').count());
  check('显隐切换有 aria 名', '显示口令', await page.locator('.adm-reveal-btn').getAttribute('aria-label'));
  await page.locator('.adm-reveal-btn').click();
  check('点切换 → type=text', 'text', await pwInput.getAttribute('type'));
  await page.locator('.adm-reveal-btn').click();
  check('再点 → type=password', 'password', await pwInput.getAttribute('type'));

  // ── 2. 登录 ─────────────────────────────────────────────
  console.log('\n[2] 登录');
  await pwInput.fill(PW);
  await page.locator('button[type="submit"]').click();
  await page.locator('.adm-topbar').waitFor({ timeout: 20000 });
  check('默认落在文章 tab', 1, await page.locator('#adm-tabpanel-articles').count());
  check('tabpanel 关联 tab（a11y）', 'adm-tab-articles', await page.locator('#adm-tabpanel-articles').getAttribute('aria-labelledby'));
  check('tab 按钮有 id（a11y）', 1, await page.locator('#adm-tab-articles').count());

  // ── 3. 次级信息对比度（P1） ─────────────────────────────
  console.log('\n[3] 次级信息对比度（P1 目标 ≥4.5:1）');
  const darkTab = await contrastOf('[data-tab="projects"]');
  console.log(`       暗色 → ${darkTab.color}，对比度 ${darkTab.ratio}`);
  check('暗色对比度 ≥4.5', true, darkTab.ratio >= 4.5);
  await page.evaluate(() => {
    localStorage.setItem('theme', 'light');
    document.documentElement.classList.add('light');
  });
  await page.waitForTimeout(300);
  const lightTab = await contrastOf('[data-tab="projects"]');
  console.log(`       亮色 → ${lightTab.color}，对比度 ${lightTab.ratio}`);
  check('亮色对比度 ≥4.5', true, lightTab.ratio >= 4.5);
  await page.screenshot({ path: `${OUT}/live-audit-light.png` });
  await page.evaluate(() => {
    localStorage.setItem('theme', 'dark');
    document.documentElement.classList.remove('light');
  });
  await page.waitForTimeout(300);

  // ── 4. 新建不落库（P0-2） ───────────────────────────────
  console.log('\n[4] 新建不落库（P0-2）');
  const writesBeforeNew = writes.length;
  await page.locator('.adm-link:has-text("新建")').first().click();
  await page.waitForTimeout(600);
  check('新建未发出写请求', writesBeforeNew, writes.length);
  check('出现本地草稿标记', true, (await page.locator('.adm-ritem-t:has-text("本地草稿")').count()) > 0);
  await page.screenshot({ path: `${OUT}/live-audit-new-draft.png` });
  await page.locator('.adm-link:has-text("放弃")').first().click();
  await page.waitForTimeout(500);
  check('放弃后本地草稿消失', 0, await page.locator('.adm-ritem-t:has-text("本地草稿")').count());
  check('放弃后线上文章数不变', total, await publicCount());

  // ── 5. 草稿切走不丢 + 未保存徽标（P0-1 / P3） ───────────
  console.log('\n[5] 草稿不丢 + 未保存徽标');
  await page.locator('.adm-ritem').first().click();
  const titleInput = page.locator('.adm-input--title');
  await titleInput.waitFor({ timeout: 15000 });
  const originalTitle = await titleInput.inputValue();
  await titleInput.fill('冒烟草稿（不保存）');
  await page.waitForTimeout(300);
  check('顶栏出现未保存徽标', true, (await page.locator('.adm-topbar .adm-badge:has-text("未保存")').count()) > 0);
  await page.locator('[data-tab="projects"]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-tab="articles"]').click();
  await page.waitForTimeout(500);
  await page.locator('.adm-ritem').first().click();
  await page.waitForTimeout(400);
  check('切走再回来草稿还在', '冒烟草稿（不保存）', await page.locator('.adm-input--title').inputValue());
  check('索引栏草稿点存在', true, (await page.locator('.adm-ritem-p').count()) > 0);

  // ── 6. 客户端校验拦截，不发请求（P2-4 / P2-5） ──────────
  console.log('\n[6] 校验拦截零请求（P2-4 / P2-5）');
  await page.locator('.adm-input--title').fill('');
  await page.waitForTimeout(200);
  const writesBeforeSave = writes.length;
  await page.locator('.adm-btn:has-text("保存")').first().click();
  await page.waitForTimeout(800);
  check('空标题保存被拦下（无写请求）', writesBeforeSave, writes.length);
  check('字段级错误可见', true, (await page.locator('.adm-field-error').count()) > 0);
  check('焦点落到出错字段', true, await page.evaluate(() => document.activeElement?.classList.contains('adm-input--title') ?? false));
  const errText = await page.locator('.adm-field-error').first().textContent();
  console.log(`       错误文案：${(errText || '').trim()}`);
  await page.screenshot({ path: `${OUT}/live-audit-validation.png` });
  // 恢复原标题（改回原值 → 草稿内容与线上一致，不留脏草稿）
  await page.locator('.adm-input--title').fill(originalTitle);
  await page.waitForTimeout(200);
  await page.locator('.adm-link:has-text("放弃")').first().click();
  await page.waitForTimeout(400);

  // ── 7. 站点设置键名 hint（P2-6） ────────────────────────
  console.log('\n[7] 站点设置键名提示（P2-6）');
  await page.locator('[data-tab="site_config"]').click();
  await page.waitForTimeout(500);
  await page.locator('.adm-ritem').first().click();
  await page.waitForTimeout(400);
  const hints = await page.locator('.adm-field-hint').allTextContents();
  const keyHint = hints.find((h) => h.includes('按键名读取配置'));
  check('键名 hint 存在', true, Boolean(keyHint));

  // ── 8. 删除两步确认（只点一次，等它自动回退） ───────────
  console.log('\n[8] 删除两步确认（线上只验证「武装 + 自动回退」，不执行删除）');
  await page.locator('[data-tab="articles"]').click();
  await page.waitForTimeout(500);
  await page.locator('.adm-ritem').nth(1).click();
  await page.waitForTimeout(400);
  const writesBeforeDelete = writes.length;
  const delBtn = page.locator('.adm-btn--danger:has-text("删除")').first();
  await delBtn.click();
  await page.waitForTimeout(200);
  check('首次点击 → 变为「确认删除」', true, (await page.locator('.adm-btn--danger:has-text("确认删除")').count()) > 0);
  await page.screenshot({ path: `${OUT}/live-audit-delete-armed.png` });
  check('首次点击未发出写请求', writesBeforeDelete, writes.length);
  console.log('       等 3.3 秒看是否自动回退…');
  await page.waitForTimeout(3300);
  check('超时自动回退为「删除」', 0, await page.locator('.adm-btn--danger:has-text("确认删除")').count());
  check('全程零写请求', 0, writes.length);
  check('线上文章数不变', total, await publicCount());
  if (writes.length) console.log(`       写请求明细：${writes.join(' | ')}`);

  // ── 9. 控制台 ───────────────────────────────────────────
  console.log('\n[9] 控制台');
  check('无控制台错误', 0, consoleErrors.length);
  if (consoleErrors.length) console.log(`       ${consoleErrors.slice(0, 5).join('\n       ')}`);

  await browser.close();
  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  if (failures.length) console.log(`失败项：${failures.join('、')}`);
  process.exit(fail ? 1 : 0);
})().catch((error) => {
  console.error('脚本异常：', error);
  process.exit(2);
});
