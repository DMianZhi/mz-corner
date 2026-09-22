// 管理后台 UI 端到端自检（真实浏览器 + 本地 harness 假库）。
//
// 验证的不只是「画出来了」：登录门、四个内容面板、编辑三态、真实保存落库、
// 明暗双主题，以及全程零控制台错误。
const fs = require('node:fs');
const { chromium } = require('C:/Users/admin/.wpscomate/agent/skills/custom/career-ops/node_modules/playwright');

const BASE = 'http://localhost:5199';
const API = 'http://127.0.0.1:8900/mz-api';
// 口令不入库：从环境变量读（export ADMIN_PASSWORD=... 后运行）
const PW = process.env.ADMIN_PASSWORD;
if (!PW) throw new Error('缺少 ADMIN_PASSWORD 环境变量（管理口令不写入仓库）');
const OUT = 'C:/Users/admin/data/work/blog/mz-corner/.wpscomate/e2e-shots';
fs.mkdirSync(OUT, { recursive: true });

let pass = 0;
let fail = 0;
const failures = [];
function check(name, expected, actual) {
  if (expected === actual) {
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
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
  // 控制台只给「401」不给 URL，光看文案无法判断是预期探测还是真出错，
  // 因此另抓响应做归因
  const unauthorizedPaths = [];
  page.on('response', (res) => {
    if (res.status() === 401) unauthorizedPaths.push(new URL(res.url()).pathname);
  });

  const shot = async (name) => {
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${OUT}/${name}.png` });
  };

  console.log('── 1. 登录门 ───────────────────────────────');
  await page.goto(`${BASE}/#/admin`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[placeholder="管理口令"]', { timeout: 15000 });
  await shot('01-login-dark');
  check('登录页渲染', true, true);

  // 错误口令：必须给出人话提示，不能是 "UNAUTHORIZED"
  await page.fill('input[placeholder="管理口令"]', 'definitely-wrong');
  await page.click('button:has-text("登录")');
  await page.waitForSelector('.adm-field-error', { timeout: 10000 });
  const errText = (await page.locator('.adm-field-error').textContent())?.trim();
  check('错误口令提示是人话', '口令不正确', errText);
  await shot('02-login-error-dark');

  // 正确口令
  await page.fill('input[placeholder="管理口令"]', PW);
  await page.click('button:has-text("登录")');
  await page.waitForSelector('text=站点设置', { timeout: 15000 });
  await page.waitForSelector('.adm-row', { timeout: 15000 });
  const rowCount = await page.locator('.adm-row').count();
  check('登录后进入文章列表（有数据）', true, rowCount > 0);
  await shot('03-articles-dark');

  console.log('\n── 2. 沉浸式编辑器三态 ─────────────────────');
  await page.locator('.adm-row').first().click();
  await page.waitForSelector('input[placeholder="文章标题"]', { timeout: 10000 });
  const titleInput = page.locator('input[placeholder="文章标题"]');
  const originalTitle = await titleInput.inputValue();
  check('打开文章带入原值', true, originalTitle.length > 0);
  await shot('04-editor-edit-dark');

  await page.click('button:has-text("分屏")');
  await page.waitForSelector('.adm-preview', { timeout: 10000 });
  check('分屏态 = 编辑器 + 预览并存', 1, await page.locator('.adm-pane-input').count());
  await shot('05-editor-split-dark');

  await page.click('button:has-text("预览")');
  await page.waitForTimeout(500);
  check(
    '预览态 = 只剩预览',
    '0/1',
    `${await page.locator('.adm-pane-input').count()}/${await page.locator('.adm-preview').count()}`,
  );
  await shot('06-editor-preview-dark');

  console.log('\n── 3. 真实保存落库 ─────────────────────────');
  await page.click('button:has-text("编辑")');
  const marker = `UI 自检 ${Date.now()}`;
  await titleInput.fill(marker);
  const dirtyBadge = await page.locator('text=未保存').count();
  check('改动后出现「未保存」标记', true, dirtyBadge > 0);
  await page.click('button:has-text("保存")');
  await page.waitForSelector('text=已保存', { timeout: 10000 });
  check('保存后出现成功提示', true, true);

  // 绕过 UI 直接查库，确认真的落库了（不是只弹了个 toast）
  const token = await page.evaluate(() => localStorage.getItem('mz_admin_session_token'));
  const listed = await fetch(`${API}/api/admin/content/articles`, {
    headers: { 'x-admin-session': token },
  }).then((r) => r.json());
  const persisted = (listed.data.items || []).some((item) => item.title === marker);
  check('标题已落库（API 复核）', true, persisted);
  await shot('07-editor-saved-dark');

  // 还原标题，避免污染后续截图与假库
  await titleInput.fill(originalTitle);
  await page.click('button:has-text("保存")');
  await page.waitForTimeout(1200);

  console.log('\n── 4. 四个内容面板 ─────────────────────────');
  await page.click('button:has-text("返回列表")');
  await page.waitForSelector('.adm-row', { timeout: 10000 });

  for (const [label, file] of [
    ['项目', '08-projects-dark'],
    ['评论', '09-comments-dark'],
    ['站点设置', '10-settings-dark'],
  ]) {
    await page.click(`button:has-text("${label}")`);
    await page.waitForTimeout(700);
    const bodyText = await page.locator('.adm-page').innerText();
    check(`${label} 面板有内容`, true, bodyText.trim().length > 40);
    await shot(file);
  }

  console.log('\n── 5. 浅色主题 ─────────────────────────────');
  await page.click('button[aria-label="切换主题"]');
  await page.waitForTimeout(600);
  const isLight = await page.evaluate(() => document.documentElement.classList.contains('light'));
  check('切到浅色主题', true, isLight);
  await shot('11-settings-light');

  await page.click('button:has-text("文章")');
  await page.waitForSelector('.adm-row', { timeout: 10000 });
  await shot('12-articles-light');

  await page.locator('.adm-row').first().click();
  await page.waitForSelector('input[placeholder="文章标题"]', { timeout: 10000 });
  await page.click('button:has-text("分屏")');
  await page.waitForTimeout(700);
  await shot('13-editor-split-light');

  console.log('\n── 6. 控制台洁净度 ─────────────────────────');
  // 未登录时探测会话、以及本轮故意输错口令，这两个端点回 401 是设计行为
  const expected401 = /^\/mz-api\/api\/admin\/(session|login)$/;
  const unexpected401 = unauthorizedPaths.filter((p) => !expected401.test(p));
  check('401 只出现在会话探测/登录端点', 0, unexpected401.length);

  const meaningful = consoleErrors.filter((text) => {
    if (/favicon/i.test(text)) return false; // 环境噪音，与本次改动无关
    if (/401 \(Unauthorized\)/.test(text) && unexpected401.length === 0) return false;
    return true;
  });
  if (meaningful.length > 0) console.log('  控制台错误：\n' + meaningful.map((t) => '    · ' + t).join('\n'));
  check('无控制台错误', 0, meaningful.length);

  await browser.close();
  console.log(`\n══ 结果：${pass} 通过 / ${fail} 失败 ══`);
  if (fail > 0) {
    console.log('失败项：' + failures.join(' | '));
    process.exit(1);
  }
})().catch((err) => {
  console.error('脚本异常：', err);
  process.exit(2);
});
