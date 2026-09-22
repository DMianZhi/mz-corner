// 线上冒烟（只读）：验证新管理后台在真实环境可用。
//
// 红线：全程不点「保存」「删除」等任何写操作 —— 这是生产数据。
// 只验证「登录 → 四个面板能读到数据 → 编辑器可用 → 明暗主题」。
const fs = require('node:fs');
const { chromium } = require('C:/Users/admin/.wpscomate/agent/skills/custom/career-ops/node_modules/playwright');

// 站点地址不入库：仓库约定真实 space id 只留在本地 .env（该文件已 gitignore）。
// 取根目录 .env 的 UNICLOUD_STATIC_HOST，或显式用 SMOKE_BASE 覆盖。
function readLocalEnv(key) {
  try {
    const line = fs.readFileSync('.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith(key + '='));
    return line ? line.slice(key.length + 1).trim().replace(/^["']|["']$/g, '') : '';
  } catch {
    return '';
  }
}
const staticHost = process.env.SMOKE_BASE || readLocalEnv('UNICLOUD_STATIC_HOST');
if (!staticHost) throw new Error('缺少站点地址：请在根目录 .env 配置 UNICLOUD_STATIC_HOST，或设置 SMOKE_BASE');
const SITE = `${staticHost.replace(/\/$/, '')}/index.html#/admin`;
const PW = process.env.ADMIN_PASSWORD;
if (!PW) throw new Error('缺少 ADMIN_PASSWORD 环境变量');
const OUT = 'C:/Users/admin/data/work/blog/mz-corner/.wpscomate/live-shots';
fs.mkdirSync(OUT, { recursive: true });

let pass = 0;
let fail = 0;
const check = (name, expected, actual) => {
  if (expected === actual) {
    console.log(`  ok   ${name}`);
    pass++;
  } else {
    console.log(`  FAIL ${name} → 期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
    fail++;
  }
};

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
  const unauthorized = [];
  page.on('response', (res) => {
    if (res.status() === 401) unauthorized.push(new URL(res.url()).pathname);
  });

  console.log('── 线上：登录 ──────────────────────────────');
  await page.goto(SITE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[placeholder="管理口令"]', { timeout: 30000 });
  await page.fill('input[placeholder="管理口令"]', PW);
  await page.click('button:has-text("登录")');
  await page.waitForSelector('.adm-ritem', { timeout: 30000 });
  const rows = await page.locator('.adm-ritem').count();
  check('线上登录成功且文章索引有数据', true, rows > 0);
  console.log(`       （读到 ${rows} 篇文章）`);

  console.log('\n── 线上：编辑器（只读打开，不保存）─────────');
  await page.locator('.adm-ritem').first().click();
  await page.waitForSelector('input[placeholder="文章标题"]', { timeout: 20000 });
  const title = await page.locator('input[placeholder="文章标题"]').inputValue();
  check('编辑器带出标题', true, title.length > 0);

  // 方案 B 的骨架约束：左索引固定宽、两栏顶端对齐、整页不滚
  const geom = await page.evaluate(() => {
    const rail = document.querySelector('.adm-rail');
    const pane = document.querySelector('.adm-pane');
    if (!rail || !pane) return null;
    return {
      railW: Math.round(rail.getBoundingClientRect().width),
      sameTop: Math.abs(rail.getBoundingClientRect().top - pane.getBoundingClientRect().top) < 2,
      docOverflow: document.documentElement.scrollHeight - window.innerHeight,
    };
  });
  check('线上：左索引 320px', true, !!geom && geom.railW === 320);
  check('线上：两栏顶端对齐', true, !!geom && geom.sameTop);
  check('线上：整页无滚动', true, !!geom && geom.docOverflow <= 1);
  await page.screenshot({ path: `${OUT}/live-editor-dark.png` });

  await page.click('.adm-dock .adm-dock-btn:has-text("分屏")');
  await page.waitForSelector('.adm-preview', { timeout: 20000 });
  check('分屏预览可用', 1, await page.locator('.adm-pane-input').count());
  await page.screenshot({ path: `${OUT}/live-editor-split-dark.png` });

  console.log('\n── 线上：其余三个面板 ──────────────────────');
  for (const [label, file] of [
    ['项目', 'live-projects-dark'],
    ['评论', 'live-comments-dark'],
    ['站点设置', 'live-settings-dark'],
  ]) {
    await page.click(`.adm-tabs .adm-tab:has-text("${label}")`);
    await page.waitForTimeout(1500);
    const text = await page.locator('.adm-pane').innerText();
    check(`${label} 面板读到数据`, true, text.trim().length > 40);
    await page.screenshot({ path: `${OUT}/${file}.png` });
  }

  console.log('\n── 线上：浅色主题 ──────────────────────────');
  await page.click('button[aria-label="切换主题"]');
  await page.waitForTimeout(900);
  check('切到浅色主题', true, await page.evaluate(() => document.documentElement.classList.contains('light')));
  await page.screenshot({ path: `${OUT}/live-settings-light.png` });
  await page.click('.adm-tabs .adm-tab:has-text("文章")');
  await page.waitForSelector('.adm-ritem', { timeout: 20000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/live-articles-light.png` });

  console.log('\n── 线上：控制台洁净度 ──────────────────────');
  const expected401 = /^\/mz-api\/api\/admin\/(session|login)$/;
  check('401 只出现在会话探测端点', 0, unauthorized.filter((p) => !expected401.test(p)).length);
  // 浏览器对任何 401 响应都会自动打一条 console error；只要全部 401 都落在
  // 会话探测端点（未登录态），即为设计使然，不算错误。
  const all401Expected = unauthorized.every((p) => expected401.test(p));
  const meaningful = consoleErrors.filter((t) => {
    if (/favicon/i.test(t)) return false;
    if (/status of 401/.test(t) && all401Expected) return false;
    return true;
  });
  if (meaningful.length > 0) console.log('  错误：\n' + meaningful.map((t) => '    · ' + t).join('\n'));
  check('无控制台错误', 0, meaningful.length);

  await browser.close();
  console.log(`\n══ 线上冒烟：${pass} 通过 / ${fail} 失败 ══`);
  if (fail > 0) process.exit(1);
})().catch((e) => {
  console.error('脚本异常：', e);
  process.exit(2);
});
