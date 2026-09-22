// 给三套 demo 出明暗截图 + 收集控制台报错
const { chromium } = require('C:/Users/admin/.wpscomate/agent/skills/custom/career-ops/node_modules/playwright');
const path = require('node:path');
const OUT = path.join(process.cwd(), '.wpscomate/demo-shots');

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const demos = [
    ['A', 'admin-A-editorial.html'],
    ['B', 'admin-B-workbench.html'],
    ['C', 'admin-C-ledger.html'],
  ];
  for (const [tag, file] of demos) {
    for (const theme of ['dark', 'light']) {
      const p = await ctx.newPage();
      const errs = [];
      p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
      p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
      await p.addInitScript((t) => localStorage.setItem('theme', t), theme);
      await p.goto('file://' + path.join(process.cwd(), 'demo', file), { waitUntil: 'load' });
      await p.waitForTimeout(400);
      const info = await p.evaluate(() => {
        const h1el = document.querySelector('h1');
        return {
          rows: document.querySelectorAll('.row,.lrow,.ritem').length,
          docScrollable: document.documentElement.scrollHeight > window.innerHeight + 1,
          h1: h1el ? h1el.textContent : '',
        };
      });
      await p.screenshot({ path: path.join(OUT, tag + '-' + theme + '.png') });
      console.log(tag + ' ' + theme + ' → 行 ' + info.rows + ' | h1=' + info.h1 + ' | 整页可滚=' + info.docScrollable + ' | 报错 ' + errs.length + (errs.length ? ' :: ' + errs[0] : ''));
      await p.close();
    }
  }
  await b.close();
  for (const [tag] of demos) for (const t of ['dark', 'light']) console.log('OUTPUT=' + path.join(OUT, tag + '-' + t + '.png'));
})();
