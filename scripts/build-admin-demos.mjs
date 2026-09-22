// 生成三套管理后台「非编辑页」布局 demo（方案 A/B/C）。
// 数据取自线上真实文章（.wpscomate/demo-data.json），避免用编造数据做设计评审。
// 用法：node scripts/build-admin-demos.mjs
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.join(process.cwd(), 'demo');
const articles = JSON.parse(fs.readFileSync(path.join(process.cwd(), '.wpscomate/demo-data.json'), 'utf8'));

// 项目 / 评论 / 站点设置：后台真实数据需要鉴权，demo 用站点实际内容构造
const projects = [
  { i: 1, title: 'mz-corner', sub: '个人博客 · Nitro + uniCloud', meta: '2026-09-20', status: '已上线' },
  { i: 2, title: 'casefront', sub: '测试用例助手 · 插件 + Skill', meta: '2026-09-22', status: '已上线' },
  { i: 3, title: 'wps-webhook-bot', sub: 'WPS 群机器人 SDK', meta: '2026-10-30', status: '已上线' },
  { i: 4, title: 'uni-cloud 工具集', sub: '部署脚本与自检', meta: '2026-08-14', status: '维护中' },
];
const comments = [
  { i: 1, title: '写得很清楚，正好在踩同一个坑', sub: '从踩坑记录到知识库 · 匿名访客', meta: '2026-11-13', status: '待审' },
  { i: 2, title: '请问 OPFS 在 Safari 的兼容性如何？', sub: '浏览器存储全解析 · 张同学', meta: '2026-11-11', status: '待审' },
  { i: 3, title: '多维表那段帮我省了两天', sub: '多维表：低成本的个人数据中台 · 李工', meta: '2026-11-09', status: '已通过' },
  { i: 4, title: '链接好像失效了', sub: 'CLI 工具设计 · 匿名访客', meta: '2026-11-05', status: '已通过' },
  { i: 5, title: '期待后续的性能系列', sub: '前端性能优化实战 · 王同学', meta: '2026-10-28', status: '已通过' },
  { i: 6, title: 'Unity 版本建议标注一下', sub: 'Unity 零基础入门 · 匿名访客', meta: '2026-10-22', status: '已通过' },
];
const configs = [
  { i: 1, title: 'site_title', sub: '本地自检', meta: '基础', status: '已设置' },
  { i: 2, title: 'site_author', sub: '郭敏智', meta: '基础', status: '已设置' },
  { i: 3, title: 'hero_kicker', sub: 'PORTFOLIO / 2026', meta: '首页', status: '已设置' },
  { i: 4, title: 'hero_intro', sub: '把踩过的坑写成可复用的工具', meta: '首页', status: '已设置' },
  { i: 5, title: 'social_github', sub: 'github.com/DMianZhi', meta: '社交', status: '已设置' },
  { i: 6, title: 'icp_beian', sub: '—', meta: '页脚', status: '未设置' },
  { i: 7, title: 'footer_note', sub: 'Built with Nitro + uniCloud', meta: '页脚', status: '已设置' },
  { i: 8, title: 'seo_keywords', sub: '前端, 测试开发, 工程笔记', meta: 'SEO', status: '已设置' },
  { i: 9, title: 'analytics_id', sub: '—', meta: 'SEO', status: '未设置' },
  { i: 10, title: 'comment_moderation', sub: '先审后发', meta: '评论', status: '已设置' },
];

/* ── 共用：站点令牌 + Nav + 纸纹 + 基础排版 ─────────────────────── */

const TOKENS = `
:root{
  --radius:.75rem;
  --bg:#0A0A0B; --bg-raised:#131316; --bg-card:#17171B; --bg-hover:#1E1E24;
  --border-soft:rgba(255,255,255,.08); --border-strong:rgba(255,255,255,.16);
  --text-1:#F5F5F4; --text-2:#A6A6AD; --text-3:#5F5F66;
  --brand:#C8F542; --brand-ink:#141800; --brand-dim:rgba(200,245,66,.14);
  --danger:#FF5C5C; --success:#3DD68C;
  --font-sans:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC",sans-serif;
  --font-mono:ui-monospace,"SF Mono","Cascadia Mono","JetBrains Mono",Consolas,"Liberation Mono",monospace;
  --gutter:clamp(20px,4.5vw,72px); --container:1520px; --content-w:1080px; --nav-h:64px;
  --bg-nav-scrolled:rgba(10,10,11,.55);
  --ease:cubic-bezier(.16,1,.3,1);
}
html.light{
  --bg:#EFEFEA; --bg-raised:#fff; --bg-card:#fff; --bg-hover:#E6E6E0;
  --bg-nav-scrolled:rgba(239,239,234,.7);
  --border-soft:rgba(20,20,22,.1); --border-strong:rgba(20,20,22,.2);
  --text-1:#141416; --text-2:#55555C; --text-3:#9B9BA1;
  --brand:#6E9E06; --brand-ink:#fff; --brand-dim:rgba(110,158,6,.12);
  --danger:#D93636; --success:#1F9D63;
}
*{box-sizing:border-box}
html,body{margin:0}
body{
  background:var(--bg); color:var(--text-1); font-family:var(--font-sans);
  -webkit-font-smoothing:antialiased; font-size:15px;
}
button{font:inherit;color:inherit;background:none;border:0;cursor:pointer}
a{color:inherit;text-decoration:none}
.mono{font-family:var(--font-mono)}
.sp{flex:1}
/* 亮色下的纸纹肌理（与站点同一处理） */
.grain{display:none}
html.light .grain{
  display:block;position:fixed;inset:0;z-index:9999;pointer-events:none;opacity:.55;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='.32'/%3E%3C/svg%3E");
}
/* ── 站点 Nav（与线上同构） ── */
.site-nav{
  position:fixed;top:0;left:0;z-index:50;width:100%;height:var(--nav-h);
  background:var(--bg-nav-scrolled);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
  border-bottom:1px solid var(--border-soft);
}
.nav-inner{max-width:var(--container);margin:0 auto;height:100%;padding:0 var(--gutter);display:flex;align-items:center;justify-content:space-between}
.nav-brand{display:flex;align-items:center;gap:10px}
.nav-mark{width:22px;height:22px;border-radius:6px;background:var(--brand);display:block}
.nav-name{font-size:15px;font-weight:700;letter-spacing:-.01em}
.nav-mono{font-family:var(--font-mono);font-size:10px;letter-spacing:.18em;color:var(--text-3)}
.nav-links{display:flex;align-items:center;gap:26px}
.nav-links a{font-size:13.5px;color:var(--text-2);transition:color .15s var(--ease)}
.nav-links a:hover,.nav-links a.on{color:var(--text-1)}
.nav-theme{width:34px;height:34px;border-radius:50%;border:1px solid var(--border-soft);display:grid;place-items:center;color:var(--text-2);transition:border-color .15s var(--ease),color .15s var(--ease)}
.nav-theme:hover{border-color:var(--border-strong);color:var(--text-1)}
/* ── 演示页公共 ── */
.kicker{font-family:var(--font-mono);font-size:13px;letter-spacing:.14em;color:var(--text-3)}
.kicker b{color:var(--brand);font-weight:400;margin-right:8px}
h1.big{font-size:clamp(34px,4.2vw,52px);line-height:1;font-weight:800;letter-spacing:-.02em;margin:0}
.cnt{font-family:var(--font-mono);font-size:12px;letter-spacing:.12em;color:var(--text-3)}
.act{
  font-family:var(--font-mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;
  padding:9px 15px;border-radius:999px;background:var(--brand);color:var(--brand-ink);font-weight:500;
  transition:transform .15s var(--ease),filter .15s var(--ease);
}
.act:hover{transform:translateY(-1px);filter:brightness(1.06)}
.st{display:inline-flex;align-items:center;gap:6px;font-family:var(--font-mono);font-size:11px;letter-spacing:.06em;color:var(--text-3);white-space:nowrap}
.st i{width:5px;height:5px;border-radius:50%;background:var(--brand);display:block}
.st.draft i{background:transparent;border:1px solid var(--text-3)}
.st.warn{color:var(--brand)}
.st.warn i{background:var(--brand)}
/* 顶部操作条 */
.bar{position:sticky;top:var(--nav-h);z-index:40;background:var(--bg-nav-scrolled);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-bottom:1px solid var(--border-soft)}
.bar-inner{max-width:var(--container);margin:0 auto;padding:0 var(--gutter);height:52px;display:flex;align-items:center;gap:22px}
.bar-brand{display:flex;align-items:center;gap:8px;font-family:var(--font-mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--text-2)}
.bar-brand svg{color:var(--brand)}
.tabs{display:flex;align-items:center;gap:20px}
.tab{font-family:var(--font-mono);font-size:11.5px;letter-spacing:.1em;color:var(--text-3);padding:4px 0;position:relative;transition:color .15s var(--ease)}
.tab:hover{color:var(--text-2)}
.tab.on{color:var(--text-1)}
.tab.on::after{content:"";position:absolute;left:0;right:0;bottom:-2px;height:1.5px;background:var(--brand)}
.tab em{font-style:normal;color:var(--text-3);margin-left:5px;font-size:10.5px}
.tlink{font-family:var(--font-mono);font-size:11px;letter-spacing:.08em;color:var(--text-3);transition:color .15s var(--ease)}
.tlink:hover{color:var(--text-1)}
/* 滚动容器：整页不滚，仅内容区滚（沿用已修好的模型） */
.page{height:calc(100dvh - var(--nav-h) - 52px);overflow-y:auto;overflow-x:hidden;scrollbar-gutter:stable}
.page::-webkit-scrollbar{width:6px}
.page::-webkit-scrollbar-track{background:transparent}
.page::-webkit-scrollbar-thumb{background:rgba(255,255,255,.26);border-radius:999px}
html.light .page::-webkit-scrollbar-thumb{background:rgba(20,20,22,.22)}
.foot{font-family:var(--font-mono);font-size:11px;letter-spacing:.08em;color:var(--text-3);padding:22px 0 0}
`;

const NAV = `
<nav class="site-nav">
  <div class="nav-inner">
    <a class="nav-brand" href="#/">
      <span class="nav-mark"></span>
      <span class="nav-name">本地自检</span>
      <span class="nav-mono">MIN ZHI</span>
    </a>
    <div class="nav-links">
      <a href="#/">项目</a><a href="#/articles" class="on">文章</a><a href="#/archive">归档</a><a href="#/about">关于</a>
      <button class="nav-theme" id="themeBtn" aria-label="切换主题">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg>
      </button>
    </div>
  </div>
</nav>`;

const SCRIPT_COMMON = `
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
// 主题：跟随系统 + 手动覆盖，与站点同一 key
const saved = localStorage.getItem('theme');
if (saved === 'light' || (!saved && window.matchMedia('(prefers-color-scheme: light)').matches)) {
  document.documentElement.classList.add('light');
}
$('#themeBtn').addEventListener('click', () => {
  const on = document.documentElement.classList.toggle('light');
  localStorage.setItem('theme', on ? 'light' : 'dark');
});
// 顶部操作条在滚动后加深（与站点 Nav 同一逻辑）
const page = $('.page');
if (page) page.addEventListener('scroll', () => {
  document.body.classList.toggle('scrolled', page.scrollTop > 8);
}, { passive: true });
`;

const TABS_JS = `
const TABS = [
  { key:'articles',   n:'03', en:'MANAGE',      h1:'文章',     unit:'POSTS',    items: ARTICLES },
  { key:'projects',   n:'04', en:'PROJECTS',    h1:'项目',     unit:'PROJECTS', items: PROJECTS },
  { key:'comments',   n:'05', en:'COMMENTS',    h1:'评论',     unit:'COMMENTS', items: COMMENTS },
  { key:'site_config',n:'06', en:'SITE CONFIG', h1:'站点设置', unit:'ENTRIES',  items: CONFIGS },
];
`;

export { TOKENS, NAV, SCRIPT_COMMON, TABS_JS, articles, projects, comments, configs, OUT };
// 追加：三套布局方案的模板与生成逻辑
const pickDemo = `
<div class="picker">
  <span class="mono">方案</span>
  <a href="admin-A-editorial.html" class="A">A 编辑部目录</a>
  <a href="admin-B-workbench.html" class="B">B 主编工作台</a>
  <a href="admin-C-ledger.html" class="C">C 密集账册</a>
</div>`;

const PICKER_CSS = `
.shell{height:100dvh;padding-top:var(--nav-h);display:flex;flex-direction:column}
.picker{
  position:fixed;right:18px;bottom:18px;z-index:60;display:flex;align-items:center;gap:2px;
  padding:5px 6px;border-radius:999px;background:var(--bg-card);border:1px solid var(--border-strong);
  box-shadow:0 18px 40px -24px rgba(0,0,0,.7);font-size:11.5px;
}
.picker .mono{font-size:10px;letter-spacing:.12em;color:var(--text-3);padding:0 6px 0 4px}
.picker a{padding:6px 11px;border-radius:999px;color:var(--text-2);white-space:nowrap;transition:background .15s var(--ease),color .15s var(--ease)}
.picker a:hover{background:var(--bg-hover);color:var(--text-1)}
.picker a.cur{background:var(--brand);color:var(--brand-ink)}
`;

const RENDER_JS = `
// 统一行数据：articles 用 分类/日期/阅读，其余用 副标题/日期
function norm(tab) {
  return tab.items.map((it, i) => ({
    idx: String(i + 1).padStart(2, '0'),
    title: it.title,
    a: tab.key === 'articles' ? it.category : it.sub,
    b: tab.key === 'articles' ? it.date : it.meta,
    c: tab.key === 'articles' ? String(it.views) : '',
    status: it.status,
    raw: it,
  }));
}
function stHtml(s) {
  if (s === 'published' || s === '已上线' || s === '已设置' || s === '已通过')
    return '<span class="st"><i></i>' + (s === 'published' ? '已发布' : s) + '</span>';
  if (s === 'draft' || s === '未设置' || s === '维护中')
    return '<span class="st draft"><i></i>' + (s === 'draft' ? '草稿' : s) + '</span>';
  return '<span class="st warn"><i></i>' + s + '</span>';
}
`;

/* ── 方案 A：编辑部目录（沿用站点编辑体语言，宽度收敛到 --content-w） ── */
const CSS_A = `
.wrap{max-width:var(--content-w);margin:0 auto;padding:0 var(--gutter)}
.head{padding:54px 0 0}
.hrow{display:flex;align-items:baseline;gap:14px;margin-top:18px}
.filters{display:flex;flex-wrap:wrap;gap:8px;margin-top:24px}
.chip{font-family:var(--font-mono);font-size:11.5px;letter-spacing:.06em;padding:5px 11px;border-radius:999px;border:1px solid var(--border-soft);color:var(--text-2);transition:all .15s var(--ease)}
.chip:hover{border-color:var(--border-strong);color:var(--text-1)}
.chip.on{background:var(--brand);border-color:transparent;color:var(--brand-ink)}
.list{margin-top:26px;border-bottom:1px solid var(--border-soft)}
.row{display:grid;grid-template-columns:42px minmax(0,1fr) 78px 92px 52px 74px 16px;gap:14px;align-items:baseline;padding:15px 12px;margin:0 -12px;border-top:1px solid var(--border-soft);transition:background .15s var(--ease)}
.row:hover{background:var(--bg-hover)}
.idx{font-family:var(--font-mono);font-size:12px;color:var(--text-3);transition:color .15s var(--ease)}
.row:hover .idx{color:var(--brand)}
.ttl{font-size:17px;font-weight:600;letter-spacing:-.01em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;transition:transform .2s var(--ease)}
.row:hover .ttl{transform:translateX(4px)}
.m{font-family:var(--font-mono);font-size:11.5px;color:var(--text-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.m.r{text-align:right}
.arw{color:var(--text-3);font-size:14px;transition:transform .2s var(--ease),color .15s var(--ease)}
.row:hover .arw{transform:translateX(3px);color:var(--brand)}
`;
const HTML_A = (d) => `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>方案 A · 编辑部目录 — 管理后台 demo</title>
<style>${TOKENS}${PICKER_CSS}${CSS_A}</style>
</head>
<body>
<div class="grain"></div>
${NAV}
<div class="shell">
  <header class="bar">
    <div class="bar-inner">
      <span class="bar-brand">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg>
        管理后台
      </span>
      <nav class="tabs" id="tabs"></nav>
      <span class="sp"></span>
      <button class="tlink">导出全库</button>
      <button class="tlink">退出</button>
    </div>
  </header>
  <main class="page">
    <div class="wrap">
      <div class="head">
        <div class="kicker"><b id="knum">03</b><span id="ken">MANAGE</span></div>
        <div class="hrow">
          <h1 class="big" id="h1">文章</h1>
          <span class="cnt" id="cnt">23 POSTS</span>
          <span class="sp"></span>
          <button class="act" id="primary">＋ 新建文章</button>
        </div>
        <div class="filters" id="filters"></div>
      </div>
      <div class="list" id="list"></div>
      <div class="foot" id="foot"></div>
    </div>
  </main>
</div>
${pickDemo}
<script>
const ARTICLES = ${JSON.stringify(d.articles)};
const PROJECTS = ${JSON.stringify(d.projects)};
const COMMENTS = ${JSON.stringify(d.comments)};
const CONFIGS = ${JSON.stringify(d.configs)};
${SCRIPT_COMMON}
${TABS_JS}
${RENDER_JS}
const cats = ['全部'].concat(Array.from(new Set(ARTICLES.map(a => a.category))));
let tab = TABS[0], cat = '全部';

function renderTabs() {
  $('#tabs').innerHTML = TABS.map(t =>
    '<button class="tab' + (t.key === tab.key ? ' on' : '') + '" data-k="' + t.key + '">' +
    t.h1 + '<em>' + t.items.length + '</em></button>').join('');
  $$('#tabs .tab').forEach(b => b.addEventListener('click', () => {
    tab = TABS.find(x => x.key === b.dataset.k); cat = '全部'; render();
  }));
}
function renderFilters() {
  const f = $('#filters');
  if (tab.key !== 'articles') { f.innerHTML = ''; return; }
  f.innerHTML = cats.map(c => {
    const n = c === '全部' ? ARTICLES.length : ARTICLES.filter(a => a.category === c).length;
    return '<button class="chip' + (c === cat ? ' on' : '') + '" data-c="' + c + '">' + c + ' ' + n + '</button>';
  }).join('');
  $$('#filters .chip').forEach(b => b.addEventListener('click', () => { cat = b.dataset.c; render(); }));
}
function render() {
  const rows = norm(tab).filter(r => tab.key !== 'articles' || cat === '全部' || r.a === cat);
  renderTabs(); renderFilters();
  $('#knum').textContent = tab.n; $('#ken').textContent = tab.en;
  $('#h1').textContent = tab.h1;
  $('#cnt').textContent = rows.length + ' ' + tab.unit;
  $('#primary').textContent = '＋ 新建' + (tab.key === 'articles' ? '文章' : tab.key === 'projects' ? '项目' : '条目');
  $('#list').innerHTML = rows.map(r =>
    '<a class="row" href="#">' +
      '<span class="idx">' + r.idx + '</span>' +
      '<span class="ttl">' + r.title + '</span>' +
      '<span class="m">' + r.a + '</span>' +
      '<span class="m">' + r.b + '</span>' +
      '<span class="m r">' + r.c + '</span>' +
      stHtml(r.status) +
      '<span class="arw">→</span>' +
    '</a>').join('');
  const views = ARTICLES.reduce((s, a) => s + a.views, 0);
  $('#foot').textContent = tab.key === 'articles'
    ? '共 ' + ARTICLES.length + ' 篇 · 已发布 ' + ARTICLES.filter(a => a.status === 'published').length +
      ' · 草稿 ' + ARTICLES.filter(a => a.status === 'draft').length + ' · 累计阅读 ' + views.toLocaleString()
    : '共 ' + tab.items.length + ' 条';
}
render();
</script>
</body>
</html>`;

export { HTML_A, CSS_A };
/* ── 方案 B：主编工作台（左索引 + 右详情，宽屏铺满，详情列限 720px） ── */
const CSS_B = `
.wb{flex:1;min-height:0;display:grid;grid-template-columns:296px minmax(0,1fr)}
.rail{border-right:1px solid var(--border-soft);display:flex;flex-direction:column;min-height:0}
.rail-head{flex-shrink:0;padding:18px 20px 10px;display:flex;align-items:baseline;gap:10px;border-bottom:1px solid var(--border-soft)}
.rail-head h2{margin:0;font-size:15px;font-weight:700;letter-spacing:-.01em}
.rail-list{flex:1;min-height:0;overflow-y:auto;padding:6px 0 28px}
.ritem{display:grid;grid-template-columns:26px minmax(0,1fr) 8px;gap:10px;align-items:center;width:100%;text-align:left;padding:10px 18px;border-left:2px solid transparent;transition:background .15s var(--ease)}
.ritem:hover{background:var(--bg-hover)}
.ritem.on{background:var(--bg-hover);border-left-color:var(--brand)}
.ritem .n{font-family:var(--font-mono);font-size:11px;color:var(--text-3)}
.ritem .t{font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ritem .d{width:5px;height:5px;border-radius:50%;background:var(--brand)}
.ritem .d.draft{background:transparent;border:1px solid var(--text-3)}
.pane{min-height:0;overflow-y:auto;scrollbar-gutter:stable}
.detail{max-width:720px;padding:46px 48px 110px}
.detail h2{font-size:30px;font-weight:700;letter-spacing:-.02em;line-height:1.22;margin:14px 0 0}
.dmeta{display:flex;gap:16px;margin-top:14px;font-family:var(--font-mono);font-size:11.5px;color:var(--text-3)}
.dbody{margin-top:26px;padding-top:26px;border-top:1px solid var(--border-soft);font-size:15.5px;line-height:1.78;color:var(--text-2)}
.dbody p{margin:0 0 15px}
.fv{display:grid;grid-template-columns:130px minmax(0,1fr);gap:10px;padding:11px 0;border-bottom:1px solid var(--border-soft);align-items:baseline}
.fv .k{font-family:var(--font-mono);font-size:11.5px;letter-spacing:.06em;color:var(--text-3)}
.fv .v{font-size:14.5px;overflow:hidden;text-overflow:ellipsis}
.dockbar{position:sticky;bottom:0;margin-top:30px;padding:14px 0;display:flex;gap:10px;background:linear-gradient(transparent,var(--bg) 34%)}
.btn{font-family:var(--font-mono);font-size:11px;letter-spacing:.08em;padding:9px 14px;border-radius:999px;border:1px solid var(--border-strong);color:var(--text-2);transition:all .15s var(--ease)}
.btn:hover{border-color:var(--text-3);color:var(--text-1)}
.btn.pri{background:var(--brand);border-color:transparent;color:var(--brand-ink);font-weight:500}
@media (max-width:900px){
  .wb{grid-template-columns:1fr;grid-template-rows:minmax(0,38%) minmax(0,1fr)}
  .rail{border-right:0;border-bottom:1px solid var(--border-soft)}
  .detail{padding:28px 24px 90px}
}
`;
const HTML_B = (d) => `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>方案 B · 主编工作台 — 管理后台 demo</title>
<style>${TOKENS}${PICKER_CSS}${CSS_B}</style>
</head>
<body>
<div class="grain"></div>
${NAV}
<div class="shell">
  <header class="bar">
    <div class="bar-inner">
      <span class="bar-brand">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg>
        管理后台
      </span>
      <nav class="tabs" id="tabs"></nav>
      <span class="sp"></span>
      <button class="tlink">导出全库</button>
      <button class="tlink">退出</button>
    </div>
  </header>
  <div class="wb">
    <aside class="rail">
      <div class="rail-head">
        <h2 id="railTitle">文章</h2>
        <span class="cnt" id="railCnt">23</span>
        <span class="sp"></span>
        <button class="tlink" id="railNew">＋ 新建</button>
      </div>
      <div class="rail-list" id="railList"></div>
    </aside>
    <section class="pane" id="pane"></section>
  </div>
</div>
${pickDemo}
<script>
const ARTICLES = ${JSON.stringify(d.articles)};
const PROJECTS = ${JSON.stringify(d.projects)};
const COMMENTS = ${JSON.stringify(d.comments)};
const CONFIGS = ${JSON.stringify(d.configs)};
${SCRIPT_COMMON}
${TABS_JS}
${RENDER_JS}
let tab = TABS[0], sel = 0;

function renderTabs() {
  $('#tabs').innerHTML = TABS.map(t =>
    '<button class="tab' + (t.key === tab.key ? ' on' : '') + '" data-k="' + t.key + '">' +
    t.h1 + '<em>' + t.items.length + '</em></button>').join('');
  $$('#tabs .tab').forEach(b => b.addEventListener('click', () => {
    tab = TABS.find(x => x.key === b.dataset.k); sel = 0; render();
  }));
}
function detailHtml(r) {
  const it = r.raw;
  if (tab.key === 'articles') {
    return '<div class="kicker"><b>' + tab.n + '</b>' + tab.en + '</div>' +
      '<h2>' + it.title + '</h2>' +
      '<div class="dmeta"><span>' + it.category + '</span><span>' + it.date + '</span><span>' + it.views + ' 次阅读</span>' + stHtml(it.status) + '</div>' +
      '<div class="dbody"><p>' + (it.summary || '（暂无摘要）这篇记录了从问题出现到定位根因的完整过程，以及最后沉淀下来的可复用做法。') + '</p>' +
      '<p>正文在编辑页里以沉浸模式书写，这里只呈现摘要与元信息，避免在索引视图里塞入大段文本。</p></div>' +
      '<div class="dbody" style="margin-top:24px">' +
        '<div class="fv"><span class="k">分类</span><span class="v">' + it.category + '</span></div>' +
        '<div class="fv"><span class="k">发布日期</span><span class="v">' + it.date + '</span></div>' +
        '<div class="fv"><span class="k">状态</span><span class="v">' + stHtml(it.status) + '</span></div>' +
        '<div class="fv"><span class="k">阅读量</span><span class="v">' + it.views + '</span></div>' +
      '</div>' +
      '<div class="dockbar"><button class="btn pri">编辑正文</button><button class="btn">预览</button><span class="sp"></span><button class="btn">删除</button></div>';
  }
  return '<div class="kicker"><b>' + tab.n + '</b>' + tab.en + '</div>' +
    '<h2>' + it.title + '</h2>' +
    '<div class="dmeta"><span>' + it.sub + '</span><span>' + it.meta + '</span>' + stHtml(it.status) + '</div>' +
    '<div class="dbody" style="margin-top:26px">' +
      '<div class="fv"><span class="k">分组</span><span class="v">' + it.meta + '</span></div>' +
      '<div class="fv"><span class="k">说明</span><span class="v">' + it.sub + '</span></div>' +
      '<div class="fv"><span class="k">状态</span><span class="v">' + stHtml(it.status) + '</span></div>' +
    '</div>' +
    '<div class="dockbar"><button class="btn pri">保存修改</button><span class="sp"></span><button class="btn">删除</button></div>';
}
function render() {
  renderTabs();
  const rows = norm(tab);
  if (sel >= rows.length) sel = 0;
  $('#railTitle').textContent = tab.h1;
  $('#railCnt').textContent = rows.length;
  $('#railNew').textContent = '＋ 新建' + (tab.key === 'articles' ? '文章' : '条目');
  $('#railList').innerHTML = rows.map((r, i) =>
    '<button class="ritem' + (i === sel ? ' on' : '') + '" data-i="' + i + '">' +
      '<span class="n">' + r.idx + '</span>' +
      '<span class="t">' + r.title + '</span>' +
      '<span class="d' + (r.status === 'draft' || r.status === '未设置' ? ' draft' : '') + '"></span>' +
    '</button>').join('');
  $$('#railList .ritem').forEach(b => b.addEventListener('click', () => {
    sel = Number(b.dataset.i); render();
  }));
  $('#pane').innerHTML = '<div class="detail">' + detailHtml(rows[sel]) + '</div>';
}
render();
</script>
</body>
</html>`;

/* ── 方案 C：密集账册（表格式，38px 行高，一屏约 20 行） ── */
const CSS_C = `
.ledger{max-width:1320px;margin:0 auto;padding:0 var(--gutter)}
.head{padding:34px 0 0}
.hrow{display:flex;align-items:baseline;gap:14px;margin-top:12px}
.tools{display:flex;align-items:center;gap:8px;margin-top:18px;flex-wrap:wrap}
.search{
  font-family:var(--font-mono);font-size:12px;padding:7px 12px;min-width:230px;
  background:transparent;border:1px solid var(--border-soft);border-radius:8px;color:var(--text-1);
}
.search::placeholder{color:var(--text-3)}
.search:focus{outline:none;border-color:var(--border-strong)}
.chip{font-family:var(--font-mono);font-size:11px;letter-spacing:.06em;padding:6px 10px;border-radius:999px;border:1px solid var(--border-soft);color:var(--text-2);transition:all .15s var(--ease)}
.chip:hover{border-color:var(--border-strong);color:var(--text-1)}
.chip.on{background:var(--brand);border-color:transparent;color:var(--brand-ink)}
.grid{margin-top:20px}
.grow{display:grid;grid-template-columns:34px minmax(0,1fr) 96px 92px 58px 78px 52px;gap:12px;align-items:center;padding:9px 8px;margin:0 -8px}
.ghead{border-bottom:1px solid var(--border-strong);font-family:var(--font-mono);font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-3)}
.lrow{border-bottom:1px solid var(--border-soft);font-size:14.5px;transition:background .15s var(--ease);cursor:pointer}
.lrow:hover{background:var(--bg-hover)}
.lrow .idx{font-family:var(--font-mono);font-size:11.5px;color:var(--text-3)}
.lrow .ttl{font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lrow:hover .ttl{color:var(--brand)}
.lrow .m{font-family:var(--font-mono);font-size:11.5px;color:var(--text-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lrow .m.r{text-align:right}
.lrow .ops{display:flex;gap:10px;justify-content:flex-end;opacity:0;transition:opacity .15s var(--ease)}
.lrow:hover .ops{opacity:1}
.lrow .ops button{font-family:var(--font-mono);font-size:11px;color:var(--text-3)}
.lrow .ops button:hover{color:var(--brand)}
`;
const HTML_C = (d) => `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>方案 C · 密集账册 — 管理后台 demo</title>
<style>${TOKENS}${PICKER_CSS}${CSS_C}</style>
</head>
<body>
<div class="grain"></div>
${NAV}
<div class="shell">
  <header class="bar">
    <div class="bar-inner">
      <span class="bar-brand">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg>
        管理后台
      </span>
      <nav class="tabs" id="tabs"></nav>
      <span class="sp"></span>
      <button class="tlink">导出全库</button>
      <button class="tlink">退出</button>
    </div>
  </header>
  <main class="page">
    <div class="ledger">
      <div class="head">
        <div class="kicker"><b id="knum">03</b><span id="ken">MANAGE</span></div>
        <div class="hrow">
          <h1 class="big" id="h1" style="font-size:clamp(26px,3vw,34px)">文章</h1>
          <span class="cnt" id="cnt">23 POSTS</span>
          <span class="sp"></span>
          <button class="act" id="primary">＋ 新建文章</button>
        </div>
        <div class="tools">
          <input class="search" id="q" placeholder="搜索标题 / 分类…">
          <span class="sp"></span>
          <span id="chips" style="display:flex;gap:8px;flex-wrap:wrap"></span>
        </div>
      </div>
      <div class="grid">
        <div class="grow ghead">
          <span>#</span><span>标题</span><span>分类</span><span>日期</span><span class="m r">阅读</span><span>状态</span><span></span>
        </div>
        <div id="rows"></div>
      </div>
      <div class="foot" id="foot"></div>
    </div>
  </main>
</div>
${pickDemo}
<script>
const ARTICLES = ${JSON.stringify(d.articles)};
const PROJECTS = ${JSON.stringify(d.projects)};
const COMMENTS = ${JSON.stringify(d.comments)};
const CONFIGS = ${JSON.stringify(d.configs)};
${SCRIPT_COMMON}
${TABS_JS}
${RENDER_JS}
const cats = ['全部'].concat(Array.from(new Set(ARTICLES.map(a => a.category))));
let tab = TABS[0], cat = '全部', q = '';

function renderTabs() {
  $('#tabs').innerHTML = TABS.map(t =>
    '<button class="tab' + (t.key === tab.key ? ' on' : '') + '" data-k="' + t.key + '">' +
    t.h1 + '<em>' + t.items.length + '</em></button>').join('');
  $$('#tabs .tab').forEach(b => b.addEventListener('click', () => {
    tab = TABS.find(x => x.key === b.dataset.k); cat = '全部'; q = ''; $('#q').value = ''; render();
  }));
}
function renderChips() {
  if (tab.key !== 'articles') { $('#chips').innerHTML = ''; return; }
  $('#chips').innerHTML = cats.map(c => {
    const n = c === '全部' ? ARTICLES.length : ARTICLES.filter(a => a.category === c).length;
    return '<button class="chip' + (c === cat ? ' on' : '') + '" data-c="' + c + '">' + c + ' ' + n + '</button>';
  }).join('');
  $$('#chips .chip').forEach(b => b.addEventListener('click', () => { cat = b.dataset.c; render(); }));
}
function render() {
  renderTabs(); renderChips();
  let rows = norm(tab).filter(r => tab.key !== 'articles' || cat === '全部' || r.a === cat);
  if (q) rows = rows.filter(r => (r.title + r.a).toLowerCase().includes(q.toLowerCase()));
  $('#knum').textContent = tab.n; $('#ken').textContent = tab.en;
  $('#h1').textContent = tab.h1;
  $('#cnt').textContent = rows.length + ' ' + tab.unit;
  $('#primary').textContent = '＋ 新建' + (tab.key === 'articles' ? '文章' : '条目');
  $('#rows').innerHTML = rows.map(r =>
    '<div class="grow lrow">' +
      '<span class="idx">' + r.idx + '</span>' +
      '<span class="ttl">' + r.title + '</span>' +
      '<span class="m">' + r.a + '</span>' +
      '<span class="m">' + r.b + '</span>' +
      '<span class="m r">' + r.c + '</span>' +
      stHtml(r.status) +
      '<span class="ops"><button>编辑</button><button>删除</button></span>' +
    '</div>').join('');
  const views = ARTICLES.reduce((s, a) => s + a.views, 0);
  $('#foot').textContent = tab.key === 'articles'
    ? '共 ' + ARTICLES.length + ' 篇 · 累计阅读 ' + views.toLocaleString() + ' · 列表可键盘上下切换'
    : '共 ' + tab.items.length + ' 条';
}
$('#q').addEventListener('input', e => { q = e.target.value; render(); });
render();
</script>
</body>
</html>`;

/* ── 输出 ─────────────────────────────────────────────────────── */

// 让状态有差异，便于评审时看清两种状态样式
articles.forEach((a, i) => {
  if (i >= articles.length - 2) a.status = 'draft';
});
const data = { articles, projects, comments, configs };

fs.mkdirSync(OUT, { recursive: true });
const files = [
  ['admin-A-editorial.html', HTML_A(data)],
  ['admin-B-workbench.html', HTML_B(data)],
  ['admin-C-ledger.html', HTML_C(data)],
];
for (const [name, html] of files) {
  const p = path.join(OUT, name);
  fs.writeFileSync(p, html);
  const back = fs.readFileSync(p, 'utf8');
  if (back.length !== html.length) throw new Error('写入被截断：' + name);
  console.log('OUTPUT=' + p);
}
console.log('数据：文章 ' + articles.length + ' / 项目 ' + projects.length + ' / 评论 ' + comments.length + ' / 配置 ' + configs.length);
