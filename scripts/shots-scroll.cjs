// 滚动条与布局的目视验收截图：干净视图 + 右侧滚动条放大裁剪
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('./e2e/lib/playwright.cjs');
const BASE = 'http://localhost:5199';
const PW = process.env.ADMIN_PASSWORD;
if (!PW) throw new Error('缺少 ADMIN_PASSWORD');
const OUT = path.join(process.cwd(), '.wpscomate/scroll-shots');
fs.mkdirSync(OUT, { recursive: true });

const LONG = ['## 一、Actions', '', '这是一段用于撑高编辑器的正文内容。'.repeat(400), '', '```js', 'const a = 1;', '```'].join('\n');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(BASE + '/#/admin', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[placeholder="管理口令"]', { timeout: 20000 });
  await page.fill('input[placeholder="管理口令"]', PW);
  await page.press('input[placeholder="管理口令"]', 'Enter');
  await page.waitForSelector('.adm-ritem', { timeout: 20000 });
  await page.waitForTimeout(600);

  // 注入长内容，让容器真正溢出（本地假库仅 3 篇，否则没有滚动条可看）
  await page.evaluate(() => {
    const el = document.querySelector('.adm-pane');
    const spacer = document.createElement('div');
    spacer.id = 'visual-spacer';
    spacer.style.height = '1400px';
    el.appendChild(spacer);
    el.scrollTop = 260;
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: OUT + '/final-list-dark.png' });
  // 右侧滚动条放大裁剪（6px 在 2x 下约 12px 宽，裁 24px 便于目视）
  await page.screenshot({ path: OUT + '/final-scrollbar-dark.png', clip: { x: 1416, y: 200, width: 24, height: 420 } });

  // 编辑器分屏
  await page.evaluate(() => document.getElementById('visual-spacer')?.remove());
  await page.locator('.adm-ritem').first().click();
  await page.waitForSelector('.adm-dock', { timeout: 10000 });
  await page.fill('.adm-textarea--code', LONG);
  await page.waitForTimeout(400);
  await page.locator('.adm-dock button', { hasText: '分屏' }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: OUT + '/final-editor-split-dark.png' });
  await page.screenshot({ path: OUT + '/final-scrollbar-editor-dark.png', clip: { x: 1416, y: 200, width: 24, height: 420 } });

  // 浅色
  await page.evaluate(() => localStorage.setItem('theme', 'light'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.adm-ritem', { timeout: 20000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: OUT + '/final-list-light.png' });

  await browser.close();
  for (const f of ['final-list-dark', 'final-editor-split-dark', 'final-list-light', 'final-scrollbar-dark', 'final-scrollbar-editor-dark']) {
    console.log('OUTPUT=' + OUT + '/' + f + '.png');
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
