// 共享 e2e harness：把原先各脚本各自抄一份的样板集中到这里。
//
// ⚠ 合并的前提是「样板真的相同」。实测并非如此，所以下面几处**刻意保留差异**，
//   否则就成了「为了去重而改行为」：
//
//   · check 的相等语义有两种，故同时导出两个：
//       check       —— JSON.stringify 深比较（audit-local / smoke-audit-live 原用）
//       checkStrict —— === 严格比较（ui / scroll / content 原用）
//     两者对基本类型等价，对对象/数组不等价，不能混用。
//   · PW 只从环境变量读、**不给默认值**：ui / scroll / content / smoke-* 都有
//     `if (!PW) throw` 的守卫（口令不入库）。给默认值会把守卫架空，
//     让「忘了带口令」变成「静默用默认口令跑」。
//   · OUT 实际有 4 个不同目录（e2e-shots / scroll-shots / live-shots / demo-shots），
//     故 launch() 支持 outDir 覆盖，不强行统一。
//   · viewport 有 1440×900 与 1920×1080 两种，故 launch() 支持传入。
//   · report / 退出码语义各脚本不同（有的失败才 exit、有的总 exit），保留在各自脚本内。
const fs = require('node:fs');

const BASE = process.env.E2E_BASE || 'http://localhost:5199';
const OUT = 'C:/Users/admin/data/work/blog/mz-corner/.wpscomate/e2e-shots';
// 口令不入库：只从环境变量读
const PW = process.env.ADMIN_PASSWORD;

function requirePassword() {
  if (!PW) throw new Error('缺少 ADMIN_PASSWORD 环境变量（管理口令不写入仓库）');
  return PW;
}

let pass = 0;
let fail = 0;
const failures = [];

/** 深比较（逐字搬运自 e2e-admin-audit-local.cjs） */
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

/** 严格比较（语义搬运自 e2e-admin-ui.cjs） */
function checkStrict(name, expected, actual) {
  if (expected === actual) {
    console.log(`  ok   ${name}`);
    pass++;
  } else {
    console.log(`  FAIL ${name} → 期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
    fail++;
    failures.push(name);
  }
}

/**
 * 「选中态真的渲染出来了吗」——比较选中元素与未选中元素的**计算样式**。
 *
 * 教训：之前这里只断言 aria-selected 属性存在，属性是 React 输出的、永远是对的，
 * 而 CSS 选择器写成了 [aria-current] / [aria-pressed]，压根匹配不上 ——
 * 属性在、样式死，测试全绿，用户看到的却是零高亮。
 * 状态类断言必须落到 getComputedStyle 上，不能只看 DOM 属性。
 */
async function visualDiff(page, onSel, offSel, keys) {
  return page.evaluate(
    ({ onSel, offSel, keys }) => {
      const on = document.querySelector(onSel);
      const off = document.querySelector(offSel);
      // 对照项缺失是测试自身的问题，必须报出来，不能当成「无差异」
      if (!on || !off) return { error: `对照元素缺失 on=${!!on} off=${!!off}` };
      const read = (el) => {
        const cs = getComputedStyle(el);
        return {
          bg: cs.backgroundColor,
          color: cs.color,
          weight: cs.fontWeight,
          borderLeft: cs.borderLeftColor,
          borderColor: cs.borderTopColor,
          boxShadow: cs.boxShadow,
          outline: cs.outlineWidth + ' ' + cs.outlineColor,
        };
      };
      const a = read(on);
      const b = read(off);
      return { diff: keys.filter((k) => a[k] !== b[k]), on: a, off: b };
    },
    { onSel, offSel, keys },
  );
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** 起浏览器与页面。viewport / outDir 按脚本原值传入，保持行为不变。 */
async function launch({ viewport = { width: 1440, height: 900 }, outDir = OUT } = {}) {
  // 惰性加载：纯 API 脚本（content）也要用 check，不该被 playwright 拖累
  const { chromium } = require('./playwright.cjs');
  ensureDir(outDir);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  return { browser, ctx, page };
}

module.exports = {
  BASE, OUT, PW, requirePassword,
  check, checkStrict, visualDiff, launch, ensureDir,
  stats: () => ({ pass, fail, failures }),
};
