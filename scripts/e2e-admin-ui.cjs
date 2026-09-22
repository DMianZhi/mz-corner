// 管理后台 UI 端到端自检（真实浏览器 + 本地 harness 假库）。
//
// 验证的不只是「画出来了」：登录门、工作台骨架（左索引 + 右详情，整页不滚）、
// 编辑三态、真实保存落库、四个内容面板、明暗双主题，以及全程零控制台错误。
const fs = require('node:fs');
const { chromium } = require('C:/Users/admin/.wpscomate/agent/skills/custom/career-ops/node_modules/playwright');

const BASE = process.env.E2E_BASE || 'http://localhost:5199';
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
  // 顶部标签必须限定在 .adm-tabs 内点：索引栏条目文本可能撞上标签名
  // （例如评论正文里出现「项目」），Playwright 严格模式会直接报错
  const clickTab = (label) => page.click(`.adm-tabs .adm-tab:has-text("${label}")`);
  const clickDock = (label) => page.click(`.adm-dock .adm-dock-btn:has-text("${label}")`);

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
  await page.waitForSelector('.adm-tabs', { timeout: 15000 });
  await page.waitForSelector('.adm-ritem', { timeout: 15000 });
  const rowCount = await page.locator('.adm-ritem').count();
  check('登录后进入文章索引（有数据）', true, rowCount > 0);
  await shot('03-articles-dark');

  console.log('\n── 2. 工作台骨架（左索引 + 右详情）──────────');
  const geom = await page.evaluate(() => {
    const rail = document.querySelector('.adm-rail');
    const pane = document.querySelector('.adm-pane');
    const wb = document.querySelector('.adm-workbench');
    const de = document.documentElement;
    return {
      railW: rail ? Math.round(rail.getBoundingClientRect().width) : -1,
      railH: rail ? Math.round(rail.getBoundingClientRect().height) : -1,
      paneW: pane ? Math.round(pane.getBoundingClientRect().width) : -1,
      paneScrolls: pane ? getComputedStyle(pane).overflowY : null,
      // 整页不该出现滚动条：滚动只发生在 rail-list / pane 两个容器内
      docOverflow: de.scrollHeight - window.innerHeight,
      // 索引栏与详情栏顶端对齐（demo 里头部 49px 的落地形态）
      sameTop: rail && pane ? Math.abs(rail.getBoundingClientRect().top - pane.getBoundingClientRect().top) < 2 : false,
      wbFills: wb ? Math.round(wb.getBoundingClientRect().bottom) : -1,
      winH: window.innerHeight,
    };
  });
  check('左索引宽度 320px', 320, geom.railW);
  check('左索引占满视口高（不是卡片式短栏）', true, geom.railH > 700);
  check('右详情是独立滚动容器', 'auto', geom.paneScrolls);
  check('整页无滚动（不随内容长短抖动）', true, geom.docOverflow <= 1);
  check('左右两栏顶端对齐', true, geom.sameTop);
  check('工作台吃满视口底部', true, geom.wbFills >= geom.winH - 2);

  // 点第二条索引，右栏标题必须跟着换（主从联动）
  await page.locator('.adm-ritem').nth(1).click();
  await page.waitForSelector('input[placeholder="文章标题"]', { timeout: 10000 });
  const secondTitle = await page.locator('input[placeholder="文章标题"]').inputValue();
  const railTitle = (await page.locator('.adm-ritem').nth(1).locator('.adm-ritem-t').textContent())?.trim();
  check('点索引后右栏切到该条', secondTitle, railTitle);
  await page.locator('.adm-ritem').first().click();
  await page.waitForTimeout(300);

  console.log('\n── 3. 编辑器三态（浮动 dock）────────────────');
  const titleInput = page.locator('input[placeholder="文章标题"]');
  const originalTitle = await titleInput.inputValue();
  check('打开文章带入原值', true, originalTitle.length > 0);

  // 铺满右栏：详情列卡 max-width 会让宽屏右侧空出一大片（1920 下曾空 880px）
  const fill = await page.evaluate(() => {
    const pane = document.querySelector('.adm-pane');
    const detail = document.querySelector('.adm-detail');
    const cs = getComputedStyle(detail);
    const pad = parseFloat(cs.paddingRight) + parseFloat(cs.paddingLeft);
    const fields = document.querySelector('.adm-fields');
    const rows = [...document.querySelectorAll('.adm-fields > .adm-fv')];
    const full = rows.find((r) => r.classList.contains('adm-fv--full'));
    const short = rows.find((r) => !r.classList.contains('adm-fv--full'));
    return {
      rightGap: Math.round(pane.getBoundingClientRect().width - detail.getBoundingClientRect().width),
      maxWidth: cs.maxWidth,
      cols: getComputedStyle(fields).gridTemplateColumns.split(' ').length,
      fullSpans: full ? Math.round(full.getBoundingClientRect().width) : -1,
      // 用 clientWidth：.adm-pane 有 scrollbar-gutter: stable，会预留约 10px
      contentW: Math.round(pane.clientWidth - pad),
      shortW: short ? Math.round(short.getBoundingClientRect().width) : -1,
    };
  });
  check('详情列无 max-width 上限', 'none', fill.maxWidth);
  check('详情列铺满右栏（右侧无大片空白）', true, fill.rightGap <= 40);
  check('字段区两列', 2, fill.cols);
  check('多行字段横跨两列', true, fill.fullSpans >= fill.contentW - 2);
  check('短字段只占一列（不被拉成长条）', true, fill.shortW < fill.contentW * 0.6);
  await shot('04-editor-edit-dark');

  await clickDock('分屏');
  await page.waitForSelector('.adm-preview', { timeout: 10000 });
  check('分屏态 = 编辑器 + 预览并存', 1, await page.locator('.adm-pane-input').count());
  // 切到分屏必须把正文带到视野里，否则「点了分屏却只看到表单」
  const splitView = await page.evaluate(() => {
    const pane = document.querySelector('.adm-pane');
    const ta = document.querySelector('.adm-pane-input');
    return { paneScrollTop: Math.round(pane.scrollTop), taTop: Math.round(ta.getBoundingClientRect().top), winH: window.innerHeight };
  });
  check('分屏态：容器已滚到正文区', true, splitView.paneScrollTop > 100);
  check('分屏态：正文顶部在视野内', true, splitView.taTop > 0 && splitView.taTop < splitView.winH * 0.6);
  // 分屏/编辑都铺满右栏；只有预览锁 --content-w 居中（预览要跟站点正文同宽）
  const wideW = await page.evaluate(() => {
    const el = document.querySelector('.adm-detail');
    const pane = document.querySelector('.adm-pane');
    return el ? Math.round(pane.getBoundingClientRect().width - el.getBoundingClientRect().width) : -1;
  });
  check('分屏态详情列同样铺满', true, wideW <= 40);
  await shot('05-editor-split-dark');

  await clickDock('预览');
  await page.waitForTimeout(500);
  check(
    '预览态 = 只剩预览',
    '0/1',
    `${await page.locator('.adm-pane-input').count()}/${await page.locator('.adm-preview').count()}`,
  );
  const previewW = await page.evaluate(() => {
    const el = document.querySelector('.adm-detail');
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return { maxWidth: cs.maxWidth, left: Math.round(r.left), right: Math.round(window.innerWidth - r.right) };
  });
  check('预览态锁站点正文宽度', '1080px', previewW.maxWidth);
  check('预览态居中（左右留白对称）', true, Math.abs(previewW.left - previewW.right) <= 340);
  await shot('06-editor-preview-dark');

  console.log('\n── 4. 真实保存落库 ─────────────────────────');
  await clickDock('编辑');
  const marker = `UI 自检 ${Date.now()}`;
  await titleInput.fill(marker);
  const dirtyBadge = await page.locator('text=未保存').count();
  check('改动后出现「未保存」标记', true, dirtyBadge > 0);
  await page.click('.adm-dock button:has-text("保存")');
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
  await page.click('.adm-dock button:has-text("保存")');
  await page.waitForTimeout(1200);

  console.log('\n── 5. 四个内容面板 ─────────────────────────');
  for (const [label, file] of [
    ['项目', '08-projects-dark'],
    ['评论', '09-comments-dark'],
    ['站点设置', '10-settings-dark'],
  ]) {
    await clickTab(label);
    await page.waitForTimeout(700);
    // 切标签后右栏必须已有内容（默认选中第一条）—— 只验「文字够长」会放过空栏
    const fieldRows = await page.locator('.adm-fv').count();
    const railItems = await page.locator('.adm-ritem').count();
    check(`${label} 面板：索引有数据且右栏默认展开`, true, fieldRows >= 1 && railItems >= 1);
    await shot(file);
  }
  // 站点设置：选中一项 → 右栏出现字段行，贴底保存条在位
  await page.locator('.adm-ritem').first().click();
  await page.waitForTimeout(400);
  check('站点设置详情有字段行', true, (await page.locator('.adm-fv').count()) >= 3);
  check('站点设置贴底保存条在位', 1, await page.locator('.adm-sticky-bar').count());

  console.log('\n── 6. 浅色主题 ─────────────────────────────');
  await page.click('button[aria-label="切换主题"]');
  await page.waitForTimeout(600);
  const isLight = await page.evaluate(() => document.documentElement.classList.contains('light'));
  check('切到浅色主题', true, isLight);
  await shot('11-settings-light');

  await clickTab('文章');
  await page.waitForSelector('.adm-ritem', { timeout: 10000 });
  await page.locator('.adm-ritem').first().click();
  await page.waitForSelector('input[placeholder="文章标题"]', { timeout: 10000 });
  await page.waitForTimeout(400);
  await shot('12-articles-light');

  await clickDock('分屏');
  await page.waitForTimeout(700);
  await shot('13-editor-split-light');

  console.log('\n── 7. 窄屏降级（索引条挪到上方）─────────────');
  await page.setViewportSize({ width: 760, height: 900 });
  await page.waitForTimeout(500);
  const narrow = await page.evaluate(() => {
    const rail = document.querySelector('.adm-rail');
    const pane = document.querySelector('.adm-pane');
    return {
      railW: rail ? Math.round(rail.getBoundingClientRect().width) : -1,
      railH: rail ? Math.round(rail.getBoundingClientRect().height) : -1,
      paneH: pane ? Math.round(pane.getBoundingClientRect().height) : -1,
      fieldCols: document.querySelector('.adm-fields')
        ? getComputedStyle(document.querySelector('.adm-fields')).gridTemplateColumns.split(' ').length
        : -1,
      dockCenter: (() => {
        const d = document.querySelector('.adm-dock');
        if (!d) return -1;
        const r = d.getBoundingClientRect();
        return Math.round(r.left + r.width / 2 - window.innerWidth / 2);
      })(),
    };
  });
  check('窄屏索引条横向铺满', true, narrow.railW > 700);
  check('窄屏索引条不压满屏（详情仍有空间）', true, narrow.paneH > 300);
  check('窄屏字段回落单列', 1, narrow.fieldCols);
  check('窄屏工具条回到视口居中', true, Math.abs(narrow.dockCenter) <= 4);
  await shot('14-narrow-light');
  await page.setViewportSize({ width: 1440, height: 900 });

  console.log('\n── 8. 控制台洁净度 ─────────────────────────');
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
