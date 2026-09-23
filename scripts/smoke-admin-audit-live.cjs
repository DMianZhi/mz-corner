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

/** 本地 dist 产物名（用于验证线上真的跑的是刚构建的那份） */
function localDistAssets() {
  const html = fs.readFileSync('client/dist/index.html', 'utf8');
  return {
    js: (html.match(/index-[A-Za-z0-9_-]+\.js/) || [])[0] || '',
    css: (html.match(/index-[A-Za-z0-9_-]+\.css/) || [])[0] || '',
  };
}
const DIST = localDistAssets();

// 关键：index.html 在 CDN 上有缓存（实测 age 381 / cachetime 1119，回源前一直是旧 bundle）。
// 冒烟必须带 cache-buster，否则测的是上一版前端 —— 2026-09-23 就是这么漏掉一次「部署了但没生效」。
const SITE = `${staticHost.replace(/\/$/, '')}/index.html?v=${encodeURIComponent(DIST.js)}#/admin`;
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
  // 之前只断言 bundle 存在 —— 那怕线上跑的是半年前的旧包也照样绿。
  // 改成：回源（带 cache-buster）拿 index.html，比对它引用的产物名与本地 dist 是否一致。
  // 这一步能同时抳住两种事故：① 忘了传静态托管；② 传了但 CDN 还在发旧 index.html。
  console.log('\n[0] 线上构建与本地 dist 一致性');
  {
    const bust = `${staticHost.replace(/\/$/, '')}/index.html?cb=${Date.now()}`;
    const html = await (await fetch(bust)).text();
    const liveJs = (html.match(/index-[A-Za-z0-9_-]+\.js/) || [''])[0];
    const liveCss = (html.match(/index-[A-Za-z0-9_-]+\.css/) || [''])[0];
    check('本地 dist 产物名可读', true, Boolean(DIST.js && DIST.css));
    check('线上 index.html 引用的 JS = 本地构建', DIST.js, liveJs);
    check('线上 index.html 引用的 CSS = 本地构建', DIST.css, liveCss);
    console.log(`       本地 ${DIST.js} / ${DIST.css}`);
    console.log(`       线上 ${liveJs} / ${liveCss}`);
    // 裸 URL（无 cache-buster）是真实用户拿到的入口，可能被 CDN 缓存住 —— 单独提示，不算失败
    const plain = await (await fetch(`${staticHost.replace(/\/$/, '')}/index.html`)).text();
    const plainJs = (plain.match(/index-[A-Za-z0-9_-]+\.js/) || [''])[0];
    if (plainJs !== DIST.js) {
      console.log(`  warn 裸 /index.html 仍被 CDN 缓存（${plainJs}）—— 真实用户会晚一步拿到新版，等缓存过期或控制台刷新缓存`);
    } else {
      console.log('  ok   裸 /index.html 已是新版（CDN 已回源）');
      pass++;
    }
    // 新 CSS 是否真的含本轮修复（防“传了但传的是旧 dist”）
    const cssText = await (await fetch(`${staticHost.replace(/\/$/, '')}/assets/${liveCss}`)).text();
    // 压缩器会把 [aria-selected='true'] 去引号成 [aria-selected=true]，所以按语义匹配
    check('线上 CSS 含 [aria-selected] 选中态规则', true, /\[aria-selected=?["']?true["']?\]/.test(cssText));
    check('线上 CSS 含 [aria-pressed] 激活态规则', true, /\[aria-pressed=?["']?true["']?\]/.test(cssText));
    // 只看选择器本体，不用裸词匹配 —— 注释里出现这个词不算问题（构建会去注释，但别赌）
    check('线上 CSS 已无死选择器 [aria-current]', false, /\[aria-current[\]=]/.test(cssText));
    check('线上 CSS 已无死选择器 .adm-dock-btn[aria-selected]', false, /\.adm-dock-btn\[aria-selected/.test(cssText));
  }
  console.log(`       实际运行 bundle：${DIST.js}`);

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
  // 真正在跑的是哪份 bundle —— 前面是“线上文件对不对”，这里是“浏览器实际执行的那份对不对”
  check('浏览器实际加载的 JS = 本地构建', true, await page.evaluate(
    (want) => [...document.querySelectorAll('script[src]')].some((s) => s.getAttribute('src').includes(want)),
    DIST.js,
  ));
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
  // 页签键盘可达性：四个全部可 Tab（原先 roving 只 1 个停靠点，用户反馈「体验割裂」）
  check('四个页签全部可 Tab', 4, await page.locator('.adm-tab[tabindex="0"]').count());
  // 回归：方向键必须焦点跟随选中（原 listRef 是死 ref，focus() 空操作）
  await page.locator('#adm-tab-articles').focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300);
  check('方向键切换后焦点跟随选中项', true, await page.evaluate(() =>
    document.activeElement === document.querySelector('[role=tab][aria-selected=true]'),
  ));
  await page.locator('#adm-tab-articles').click();
  await page.waitForTimeout(300);

  // dock 内圆角/高度统一（用户实测截图指出「dock 栏的按钮的圆角不统一」）
  // 改前实测：容器 14 / 编辑·分屏·预览 9 / 删除 8 / 保存 999（胶囊），高度 28/30/32
  {
    const metrics = await page.evaluate(() =>
      [...document.querySelectorAll('.adm-dock .adm-dock-btn, .adm-dock .adm-btn')].map((el) => ({
        name: el.textContent.trim().slice(0, 4),
        radius: getComputedStyle(el).borderTopLeftRadius,
        h: Math.round(el.getBoundingClientRect().height),
      })),
    );
    check('dock 内按钮圆角统一', 1, [...new Set(metrics.map((m) => m.radius))].length);
    check('dock 内按钮高度统一', 1, [...new Set(metrics.map((m) => m.h))].length);
    check('dock 按钮圆角与容器同心', true, await page.evaluate(() => {
      const cs = getComputedStyle(document.querySelector('.adm-dock'));
      const btn = document.querySelector('.adm-dock .adm-dock-btn');
      return (
        Math.round(parseFloat(cs.borderTopLeftRadius) - parseFloat(cs.paddingTop)) ===
        parseFloat(getComputedStyle(btn).borderTopLeftRadius)
      );
    }));
    console.log(`       实测：${metrics.map((m) => `${m.name} ${m.radius}/h${m.h}`).join(' · ')}`);
  }

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

  // ── 3.5 选中态是否真的渲染（死选择器回归防护）───────────
  // 上一轮教训：只断言 aria-selected 属性存在 → 属性在、CSS 选择器写错（[aria-current]）
  // → 样式根本不生效，测试全绿而用户看到零高亮。状态断言必须落到 getComputedStyle。
  console.log('\n[3.5] 选中态渲染（属性在 ≠ 画出来了）');
  {
    const diff = await page.evaluate(() => {
      const on = document.querySelector('.adm-ritem[aria-selected="true"]');
      const off = document.querySelector('.adm-ritem[aria-selected="false"]');
      if (!on || !off) return { error: `对照缺失 on=${!!on} off=${!!off}` };
      const read = (el) => {
        const cs = getComputedStyle(el);
        return {
          bg: cs.backgroundColor,
          weight: cs.fontWeight,
          borderLeft: cs.borderLeftColor,
        };
      };
      const a = read(on);
      const b = read(off);
      return { diff: ['bg', 'weight', 'borderLeft'].filter((k) => a[k] !== b[k]), on: a, off: b };
    });
    check('左栏对照元素齐全（≥2 条）', undefined, diff.error);
    check('左栏选中项背景已着色', true, (diff.diff || []).includes('bg'));
    check('左栏选中项左强调条已着色', true, (diff.diff || []).includes('borderLeft'));
    console.log(`       选中项 bg=${diff.on?.bg} / 未选中 bg=${diff.off?.bg}`);
    check('顶部页签选中态已渲染', true, await page.evaluate(() => {
      const on = document.querySelector('#adm-tab-articles');
      const off = document.querySelector('#adm-tab-projects');
      if (!on || !off) return false;
      const a = getComputedStyle(on);
      const b = getComputedStyle(off);
      return a.backgroundColor !== b.backgroundColor || a.color !== b.color || a.fontWeight !== b.fontWeight;
    }));
  }

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
  const titleBorderNormal = await page.evaluate(
    () => getComputedStyle(document.querySelector('.adm-input--title')).borderBottomColor,
  );
  await page.locator('.adm-input--title').fill('');
  await page.waitForTimeout(200);
  const writesBeforeSave = writes.length;
  await page.locator('.adm-btn:has-text("保存")').first().click();
  await page.waitForTimeout(800);
  check('空标题保存被拦下（无写请求）', writesBeforeSave, writes.length);
  check('字段级错误可见', true, (await page.locator('.adm-field-error').count()) > 0);
  // 红边是否真的画出来了：class 在 ≠ 样式生效。
  // 而且要比「出错前 vs 出错后」的实际边框色，不能只看类名存不存在。
  {
    const after = await page.evaluate(
      () => getComputedStyle(document.querySelector('.adm-input--title')).borderBottomColor,
    );
    check('出错标题框底线变红', true, after !== titleBorderNormal && after !== 'rgba(0, 0, 0, 0)');
    console.log(`       标题底线：正常 ${titleBorderNormal} → 出错 ${after}`);
  }
  // 通用字段（SchemaForm 字段）的红框同样落到计算样式。
  // 注意：标题现在也带 .adm-fv--error（自定义字段的红边在 CSS 里单独处理，
  // border-top 按设计就是透明的），所以不能只看 border-top —— 要看该字段
  // 到底有没有红色提示（通用字段是四边红框，标题是红色底线）。
  check('每个报错字段都有红色视觉提示', true, await page.evaluate(() => {
    const wrappers = [...document.querySelectorAll('.adm-fv--error')];
    if (!wrappers.length) return false;
    // 用探针元素把 var(--danger) 归一成 rgb，不硬编码颜色
    const probe = document.createElement('span');
    probe.style.color = 'var(--danger)';
    document.body.appendChild(probe);
    const danger = getComputedStyle(probe).color;
    probe.remove();
    return wrappers.every((w) => {
      const el = w.querySelector('.adm-input, .adm-textarea');
      if (!el) return false;
      const cs = getComputedStyle(el);
      return cs.borderBottomColor === danger || cs.borderTopColor === danger;
    });
  }));
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
