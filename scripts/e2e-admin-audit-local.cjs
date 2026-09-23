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
  // 品牌色作「文本/链接」的对比度（P1 剩余项：原 #6E9E06 只有 2.78:1）
  const lightBrand = await contrastOf('.adm-link--brand');
  console.log(`       亮色品牌链接 → ${lightBrand.color}，对比度 ${lightBrand.ratio}`);
  check('亮色品牌链接 ≥4.5', true, lightBrand.ratio >= 4.5);
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
  // 自建一条再删：早期版本直接删左栏第 2 条，删掉的是 fixture 文章，
  // 把假库从 3 条改成 2 条，污染了之后跑的内容 API 套件（实测踩过：文章条数 3≠2）。
  // 现在自己造、自己删，跑完假库回到原样。
  const baseline = await apiCount('articles');
  await page.locator('.adm-link:has-text("新建")').first().click();
  await page.waitForTimeout(300);
  await page.locator('.adm-input--title').fill('E2E 待删除文章');
  await page.waitForTimeout(200);
  await page.locator('.adm-btn:has-text("保存")').first().click();
  await page.waitForTimeout(1200);
  check('自建一条供删除', baseline + 1, await apiCount('articles'));
  await page.locator('.adm-ritem:has-text("E2E 待删除文章")').first().click();
  await page.waitForTimeout(400);
  const items = page.locator('.adm-ritem');
  const beforeDelete = await apiCount('articles');
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

  // ── 10. 第二轮补漏：语义 / 键盘 / 一致性 ───────────────
  console.log('\n[10] 第二轮补漏');
  await page.locator('#adm-tab-articles').click();
  await page.waitForTimeout(400);

  // 页面级标题 + 跳转主内容（P4）
  check('存在页面级 h1', '管理后台', (await page.locator('h1').first().textContent())?.trim());
  await page.locator('.adm-skip').focus();
  const skipTop = await page.locator('.adm-skip').evaluate((el) => el.getBoundingClientRect().top);
  check('跳转链接聚焦后浮出视口', true, skipTop >= 0);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  check('跳转后焦点落到主内容', 'adm-main', await page.evaluate(() => document.activeElement?.id || ''));
  // 回归：HashRouter 下跳转链接不能把路由带跑（曾实测跳出 /admin）
  check('路由未被跳转链接改掉', true, page.url().includes('#/admin'));

  // 左栏键盘导航：roving tabindex + 方向键（P4：24 条 = 24 个 Tab 停靠点）
  check('左栏只有一个 Tab 停靠点', 1, await page.locator('.adm-ritem[tabindex="0"]').count());
  const railCount = await page.locator('.adm-ritem').count();
  const firstTitle = (await page.locator('.adm-ritem-t').first().textContent())?.trim();
  await page.locator('.adm-ritem').first().focus();
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(350);
  const secondTitle = (await page.locator('.adm-ritem-t').nth(1).textContent())?.trim();
  check('↓ 移动到第 2 条并选中', secondTitle, (await page.locator('.adm-ritem[aria-selected="true"] .adm-ritem-t').first().textContent())?.trim());
  check('焦点跟随条目', true, await page.evaluate(() => document.activeElement?.classList.contains('adm-ritem')));
  await page.keyboard.press('End');
  await page.waitForTimeout(350);
  check('End 跳到末条', railCount, await page.evaluate(() => Array.from(document.querySelectorAll('.adm-ritem')).findIndex((el) => el.getAttribute('aria-selected') === 'true') + 1));
  await page.keyboard.press('Home');
  await page.waitForTimeout(350);
  check('Home 回到首条', firstTitle, (await page.locator('.adm-ritem[aria-selected="true"] .adm-ritem-t').first().textContent())?.trim());

  // 文章排序（P3-8）：左栏顺序 == 发布日期倒序
  const railTitles = (await page.locator('.adm-ritem-t').allTextContents()).map((t) => t.trim());
  const expectedOrder = await page.evaluate(async () => {
    const r = await fetch('/api/admin/content/articles');
    const j = await r.json();
    return (j.data?.items ?? [])
      .slice()
      .sort((a, b) => {
        const da = String(a.publishDate || '');
        const db = String(b.publishDate || '');
        if (da !== db) return db.localeCompare(da);
        return String(b._id || '').localeCompare(String(a._id || ''));
      })
      .map((d) => String(d.title || '（未命名）').trim());
  });
  check('索引顺序 == 发布日期倒序', JSON.stringify(expectedOrder), JSON.stringify(railTitles));

  // 初始高亮（P3-7）：切到评论/项目后，恰好一条亮着
  await page.locator('#adm-tab-comments').click();
  await page.waitForTimeout(400);
  check('评论首屏恰好 1 条高亮', 1, await page.locator('.adm-ritem[aria-selected="true"]').count());
  await page.locator('#adm-tab-projects').click();
  await page.waitForTimeout(400);
  check('项目首屏恰好 1 条高亮', 1, await page.locator('.adm-ritem[aria-selected="true"]').count());

  // 站点设置：保存入口统一成浮动 dock（P4）
  await page.locator('#adm-tab-site_config').click();
  await page.waitForTimeout(400);
  check('站点设置保存入口是 dock', 1, await page.locator('.adm-dock:has-text("保存全部")').count());
  check('旧吸附条已移除', 0, await page.locator('.adm-sticky-bar').count());

  // Ctrl+S 绑定（P4）：此前只有文章编辑器响应，站点设置/项目/评论按了没反应
  await page.locator('.adm-ritem').first().click();
  await page.waitForTimeout(300);
  // 先制造改动：站点设置的 save 在无改动时直接 return（正确行为，不是 bug），
  // 直接按 Ctrl+S 不会发请求，断言会假失败。
  // 注意必须填「不同的值」：React 受控输入会把「值没变」的 input 事件吃掉，
  // 填回原值不会触发 onChange，draftStore 收不到草稿 —— 实测踩过一次。
  const valueInput = page.locator('[data-field="value"]').first();
  await valueInput.fill(`${await valueInput.inputValue()}·e2e`);
  await page.waitForTimeout(250);
  check('改动后左栏出现草稿点', 1, await page.locator('.adm-ritem-p').count());
  const writesBeforeShortcut = writes.length;
  await page.keyboard.press('Control+s');
  await page.waitForTimeout(1200);
  check('站点设置 Ctrl+S 触发保存', true, writes.length > writesBeforeShortcut);
  check('保存后草稿点清除', 0, await page.locator('.adm-ritem-p').count());

  // 新建自动聚焦标题（P0-2 补漏）
  await page.locator('#adm-tab-articles').click();
  await page.waitForTimeout(300);
  await page.locator('.adm-link:has-text("新建")').first().click();
  await page.waitForTimeout(700);
  const focusedClass = await page.evaluate(() => document.activeElement?.className || '');
  check('新建后焦点落在标题框', true, focusedClass.includes('adm-input--title'));
  // 本地草稿只有「放弃」没有「删除」——先放弃草稿、选中一篇真实文章再量命中区
  await page.locator('.adm-dock .adm-link:has-text("放弃")').first().click();
  await page.waitForTimeout(500);
  await page.locator('.adm-ritem').first().click();
  await page.waitForTimeout(700);

  // 危险动作命中区（P4：原 16×16）
  const dangerBox = await page.locator('.adm-btn--danger').first().boundingBox();
  console.log(`       删除按钮命中区 ${Math.round(dangerBox.width)}×${Math.round(dangerBox.height)}`);
  check('删除按钮命中区 ≥24×24', true, dangerBox.width >= 24 && dangerBox.height >= 24);

  // 标签 × 命中区（P4：审计实测视觉 16×16 / 图标 10px）
  let chipHit = null;
  const railN = await page.locator('.adm-ritem').count();
  for (let i = 0; i < railN && !chipHit; i += 1) {
    await page.locator('.adm-ritem').nth(i).click();
    await page.waitForTimeout(500);
    chipHit = await page.evaluate(() => {
      const el = document.querySelector('.adm-chip-x');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const hit = (x, y) => document.elementFromPoint(x, y) === el;
      return {
        visual: Math.round(r.width) + '×' + Math.round(r.height),
        left: hit(r.left - 4, r.top + r.height / 2),
        right: hit(r.right + 4, r.top + r.height / 2),
        top: hit(r.left + r.width / 2, r.top - 4),
        bottom: hit(r.left + r.width / 2, r.bottom + 4),
      };
    });
  }
  console.log(`       标签 × 视觉 ${chipHit ? chipHit.visual : '未找到'}，热区外扩 4px 命中：${chipHit ? [chipHit.left, chipHit.right, chipHit.top, chipHit.bottom].join('/') : '-'}`);
  check('标签 × 热区已扩到 24×24', true, Boolean(chipHit) && chipHit.left && chipHit.right && chipHit.top && chipHit.bottom);

  // 窄屏 900×784（P4：索引条 298px、dock 盖住整行字段）
  await page.setViewportSize({ width: 900, height: 784 });
  await page.waitForTimeout(500);
  const railBox = await page.locator('.adm-rail').boundingBox();
  const dockBox = await page.locator('.adm-dock').first().boundingBox();
  console.log(`       900px 索引条高 ${Math.round(railBox.height)}px，dock 底边 ${Math.round(dockBox.y + dockBox.height)}px`);
  check('窄屏索引条 ≤220px', true, railBox.height <= 220);
  check('窄屏 dock 未溢出视口', true, dockBox.y + dockBox.height <= 784 && dockBox.x >= 0 && dockBox.x + dockBox.width <= 900);
  // dock 不该换行（fixed + left:50% 时可用宽度只剩一半，曾实测被挤成两行）
  check('窄屏 dock 保持单行', true, dockBox.height <= 48);
  // 滚到底后，最后一个字段不应藏在 dock 后面（detail 的 padding-bottom 是否够）
  await page.evaluate(() => {
    const pane = document.querySelector('.adm-pane');
    if (pane) pane.scrollTop = pane.scrollHeight;
    window.scrollTo(0, document.body.scrollHeight);
  });
  await page.waitForTimeout(500);
  const cover = await page.evaluate(() => {
    const dock = document.querySelector('.adm-dock').getBoundingClientRect();
    const rows = Array.from(document.querySelectorAll('.adm-detail .adm-fv'));
    const last = rows[rows.length - 1];
    return { dockTop: Math.round(dock.top), lastBottom: last ? Math.round(last.getBoundingClientRect().bottom) : -1 };
  });
  console.log(`       滚到底：末字段底 ${cover.lastBottom}px，dock 顶 ${cover.dockTop}px`);
  check('滚到底末字段未被 dock 遮挡', true, cover.lastBottom <= cover.dockTop);
  await page.screenshot({ path: `${OUT}/audit-local-900.png` });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(300);

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
