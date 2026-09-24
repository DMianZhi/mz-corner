// 滚动专项自检：确认管理后台不再有整页滚动（抖动根因），改为容器内滚动 + 细滚动条。
//
// 方案 B 之后滚动容器有两个（左索引 .adm-rail-list / 右详情 .adm-pane），
// 整页依然必须零滚动。口令不入库：从环境变量读（export ADMIN_PASSWORD=... 后运行）
const { BASE, checkStrict: check, ensureDir, launch, requirePassword, stats } = require('./e2e/lib/harness.cjs');
// 口令不入库：从环境变量读（export ADMIN_PASSWORD=... 后运行）
const PW = requirePassword();
const OUT = 'C:/Users/admin/data/work/blog/mz-corner/.wpscomate/scroll-shots';
ensureDir(OUT);
function report() {
  const { pass, fail, failures } = stats();
  console.log('');
  console.log('══ 滚动自检：' + pass + ' 通过 / ' + fail + ' 失败 ══');
  if (failures.length) console.log('失败项：\n  · ' + failures.join('\n  · '));
}

// 采集当前页面的滚动相关度量（两个容器都要看：索引栏与详情栏）
function metrics(page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    const pane = document.querySelector('.adm-pane');
    const railList = document.querySelector('.adm-rail-list');
    const topbar = document.querySelector('.adm-topbar');
    const tb = topbar ? topbar.getBoundingClientRect() : null;
    return {
      docScrollH: de.scrollHeight,
      bodyScrollH: document.body.scrollHeight,
      winH: window.innerHeight,
      winW: window.innerWidth,
      paneOverflowY: pane ? getComputedStyle(pane).overflowY : null,
      railOverflowY: railList ? getComputedStyle(railList).overflowY : null,
      paneScrollH: pane ? pane.scrollHeight : 0,
      paneClientH: pane ? pane.clientHeight : 0,
      // 注意：offsetWidth-clientWidth 含 scrollbar-gutter 预留，不等于滚动条渲染宽度，
      // 故直接查伪元素的计算样式。
      barPseudo: pane ? getComputedStyle(pane, '::-webkit-scrollbar').width : null,
      thumbRadius: pane ? getComputedStyle(pane, '::-webkit-scrollbar-thumb').borderRadius : null,
      // 索引栏条目的右边界：整页滚动条一旦出现/消失，它就会左右跳 —— 横向抖动的直接证据
      rowRight: (() => {
        const row = document.querySelector('.adm-ritem');
        return row ? Math.round(row.getBoundingClientRect().right) : -1;
      })(),
      topbarLeft: tb ? Math.round(tb.left) : -1,
      topbarWidth: tb ? Math.round(tb.width) : -1,
      topbarTop: tb ? Math.round(tb.top) : -1,
    };
  });
}

(async () => {
  const { browser, ctx, page } = await launch({ viewport: { width: 1440, height: 900 }, outDir: OUT });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errs.push(m.text());
  });

  console.log('── 登录 ──────────────────────────────────');
  await page.goto(BASE + '/#/admin', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[placeholder="管理口令"]', { timeout: 20000 });
  await page.fill('input[placeholder="管理口令"]', PW);
  await page.press('input[placeholder="管理口令"]', 'Enter');
  await page.waitForSelector('.adm-ritem', { timeout: 20000 });
  check('已进入管理后台', true, true);

  // 工作台视图：两个容器各自滚动、整页不滚
  console.log('');
  console.log('── 工作台：整页不滚 + 容器内滚 ───────────');
  const m1 = await metrics(page);
  check('文档不产生滚动', true, m1.docScrollH <= m1.winH + 1);
  check('body 不产生滚动', true, m1.bodyScrollH <= m1.winH + 1);
  check('.adm-pane 是滚动容器', 'auto', m1.paneOverflowY);
  check('.adm-rail-list 是滚动容器', 'auto', m1.railOverflowY);
  check('滚动条为细条（6px）', '6px', m1.barPseudo);
  check('滚动条为药丸形', '999px', m1.thumbRadius);

  // 尝试滚动窗口：应当纹丝不动
  const yAfter = await page.evaluate(() => {
    window.scrollTo(0, 9999);
    return window.scrollY;
  });
  check('窗口无法被滚动（scrollY 恒为 0）', 0, yAfter);

  // 本地假库只有 3 篇，天然不溢出 —— 注入占位块强制溢出后再验滚动与抖动。
  // 关键是「溢出前后内容右边界不变」：这正是过去整页滚动条伸缩造成的横向抖动。
  const before = await metrics(page);
  const ov = await page.evaluate(() => {
    const el = document.querySelector('.adm-pane');
    const spacer = document.createElement('div');
    spacer.id = 'e2e-spacer';
    spacer.style.height = '2000px';
    el.appendChild(spacer);
    const overflowed = el.scrollHeight > el.clientHeight + 100;
    el.scrollTop = 400;
    return { overflowed, moved: el.scrollTop };
  });
  const after = await metrics(page);
  check('容器内可溢出', true, ov.overflowed);
  check('容器内可滚动', true, ov.moved > 300);
  check('溢出后整页仍不滚', true, after.docScrollH <= after.winH + 1);
  check('溢出前后内容右边界不变（无横向抖动）', before.rowRight, after.rowRight);
  check('滚动时 topbar 不位移', before.topbarTop, after.topbarTop);
  await page.screenshot({ path: OUT + '/scroll-list-dark.png' });
  await page.evaluate(() => document.getElementById('e2e-spacer').remove());

  // 其它三个面板
  console.log('');
  console.log('── 其余面板：整页不滚 ────────────────────');
  for (const label of ['项目', '评论', '站点设置']) {
    await page.click('.adm-tabs .adm-tab:has-text("' + label + '")');
    await page.waitForTimeout(450);
    const m = await metrics(page);
    check(label + '：整页不滚', true, m.docScrollH <= m.winH + 1);
    check(label + '：topbar 宽度不变（无横向抖动）', m1.topbarWidth, m.topbarWidth);
  }

  // 编辑器：整页不滚，滚动仍由 .adm-pane 承担；正文自动增高，不产生第二根滚动条
  console.log('');
  console.log('── 编辑器：单一容器滚动 + 正文自动增高 ───');
  await page.click('.adm-tabs .adm-tab:has-text("文章")');
  await page.waitForSelector('.adm-ritem');
  await page.locator('.adm-ritem').first().click();
  await page.waitForSelector('.adm-dock', { timeout: 10000 });

  const edInfo = () =>
    page.evaluate(() => {
      const pane = document.querySelector('.adm-pane');
      const ta = document.querySelector('.adm-textarea--code, .adm-split > textarea');
      const prev = document.querySelector('.adm-split > .adm-preview, .adm-card.adm-preview');
      const dock = document.querySelector('.adm-dock');
      const pick = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return {
          h: Math.round(r.height),
          scrollH: el.scrollHeight,
          clientH: el.clientHeight,
          innerScroll: el.scrollHeight > el.clientHeight + 2,
          overflowY: getComputedStyle(el).overflowY,
        };
      };
      return {
        ta: pick(ta),
        prev: pick(prev),
        dockTop: Math.round(dock.getBoundingClientRect().top),
        paneOverflow: pane.scrollHeight > pane.clientHeight + 2,
        paneOvY: getComputedStyle(pane).overflowY,
        docH: document.documentElement.scrollHeight,
        winH: window.innerHeight,
      };
    });

  // 本地假库首篇正文只有 16 字 —— 先灌一段长正文，才验得出增高与容器滚动
  // 必须远超 46vh（900px 视口下约 414px），否则验不出「自动增高突破下限」
  const LONG = ['## 一、Actions', '', '这是一段用于撑高编辑器的正文内容。'.repeat(400), '', '```js', 'const a = 1;', '```', '', '结尾段落。'.repeat(200)].join('\n');
  const e0 = await edInfo(); // 灌长正文之前：高度受 46vh 下限托底
  await page.fill('.adm-textarea--code', LONG);
  await page.waitForTimeout(400);

  const e1 = await edInfo();
  check('编辑态：容器仍是滚动容器', 'auto', e1.paneOvY);
  check('编辑态：长正文使容器溢出', true, e1.paneOverflow);
  check('编辑态：textarea 自动增高（无内部滚动条）', false, e1.ta.innerScroll);
  check('编辑态：自动增高突破 46vh 下限', true, e1.ta.h > e0.ta.h + 100);
  check('编辑态：高度随内容长到千 px 级', true, e1.ta.h > 900);
  check('编辑态：整页仍不滚', true, e1.docH <= e1.winH + 1);
  await page.screenshot({ path: OUT + '/scroll-editor-edit-dark.png' });

  await page.locator('.adm-dock button', { hasText: '分屏' }).click();
  await page.waitForTimeout(500);
  const e2 = await edInfo();
  check('分屏态：两栏等高', true, Math.abs(e2.ta.h - e2.prev.h) <= 2);
  check('分屏态：两栏均无内部滚动条', true, !e2.ta.innerScroll && !e2.prev.innerScroll);
  check('分屏态：容器承担滚动', true, e2.paneOverflow);
  check('分屏态：整页不滚', true, e2.docH <= e2.winH + 1);
  await page.screenshot({ path: OUT + '/scroll-editor-split-dark.png' });

  await page.locator('.adm-dock button', { hasText: '预览' }).click();
  await page.waitForTimeout(500);
  const e3 = await edInfo();
  check('预览态：卡片无内部滚动条', false, e3.prev.innerScroll);
  check('预览态：容器承担滚动', true, e3.paneOverflow);
  check('预览态：整页不滚', true, e3.docH <= e3.winH + 1);
  await page.screenshot({ path: OUT + '/scroll-editor-preview-dark.png' });

  // 浅色主题
  console.log('');
  console.log('── 浅色主题 ──────────────────────────────');
  await page.evaluate(() => {
    localStorage.setItem('theme', 'light');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.adm-ritem', { timeout: 20000 });
  await page.waitForTimeout(700);
  const lt = await metrics(page);
  check('浅色：整页不滚', true, lt.docScrollH <= lt.winH + 1);
  check('浅色：细滚动条', '6px', lt.barPseudo);
  await page.screenshot({ path: OUT + '/scroll-list-light.png' });

  // 窄屏：同一套模型（容器滚动），只是索引栏挪到了上方
  console.log('');
  console.log('── 窄屏（800px）──────────────────────────');
  await page.setViewportSize({ width: 800, height: 700 });
  await page.waitForTimeout(400);
  await page.locator('.adm-ritem').first().click();
  await page.waitForSelector('.adm-dock', { timeout: 10000 });
  await page.fill('.adm-textarea--code', LONG);
  await page.waitForTimeout(400);
  const nw = await page.evaluate(() => {
    const pane = document.querySelector('.adm-pane');
    const railList = document.querySelector('.adm-rail-list');
    const ta = document.querySelector('.adm-textarea--code, .adm-split > textarea');
    const rail = document.querySelector('.adm-rail');
    return {
      paneOvY: getComputedStyle(pane).overflowY,
      overflow: pane.scrollHeight > pane.clientHeight + 2,
      taInner: ta ? ta.scrollHeight > ta.clientHeight + 2 : null,
      taDiff: ta ? ta.scrollHeight - ta.clientHeight : -1,
      taBorderY: ta
        ? parseFloat(getComputedStyle(ta).borderTopWidth) + parseFloat(getComputedStyle(ta).borderBottomWidth)
        : -1,
      docH: document.documentElement.scrollHeight,
      winH: window.innerHeight,
      railW: Math.round(rail.getBoundingClientRect().width),
      winW: window.innerWidth,
      railOvY: getComputedStyle(railList).overflowY,
    };
  });
  check('窄屏：容器滚动', 'auto', nw.paneOvY);
  check('窄屏：容器确实溢出', true, nw.overflow);
  if (nw.taInner) console.log(`       窄屏正文 textarea：scrollH-clientH 差值 ${nw.taDiff}px（边框 ${nw.taBorderY}px）`);
  check('窄屏：正文仍无内部滚动条', false, nw.taInner);
  check('窄屏：整页不滚', true, nw.docH <= nw.winH + 1);
  check('窄屏：索引栏横向铺满', true, nw.railW >= nw.winW - 2);
  check('窄屏：索引栏自身仍可滚', 'auto', nw.railOvY);
  await page.screenshot({ path: OUT + '/scroll-narrow-light.png' });

  // 控制台洁净度
  console.log('');
  console.log('── 控制台 ────────────────────────────────');
  const real = errs.filter((t) => !/favicon|status of 401/i.test(t));
  check('无控制台错误', 0, real.length);
  if (real.length) console.log('  ' + real.slice(0, 5).join('\n  '));

  report();
  await browser.close();
  process.exit(stats().fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error('运行失败：', e);
  report();
  process.exit(2);
});
