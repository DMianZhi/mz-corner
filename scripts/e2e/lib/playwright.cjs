// playwright 解析：原先 7 个脚本都硬编码了
// C:/Users/admin/.wpscomate/agent/skills/custom/career-ops/node_modules/playwright
// —— 项目测试基建耦合在一个无关 skill 的安装目录上，那个 skill 一升级或卸载，
// 全部浏览器测试立刻失效。这里按优先级解析，全部失败时报明确错误。
//
// PLAYWRIGHT_PATH 是**独占覆盖**：一旦设置就只用它，不再回退。
// 这样「显式指定了却指错」会立刻报错，而不是悄悄用别的副本跑过 —— 静默回退会让
// 人在错误的路径上排查半天。默认（未设置）才走下面两条候选。
const path = require('node:path');

const CANDIDATES = process.env.PLAYWRIGHT_PATH
  ? [process.env.PLAYWRIGHT_PATH]
  : [
      path.join(__dirname, '../../../node_modules/playwright'),
      'C:/Users/admin/.wpscomate/agent/skills/custom/career-ops/node_modules/playwright',
    ];

let chromium = null;
const tried = [];
for (const candidate of CANDIDATES) {
  try {
    ({ chromium } = require(candidate));
    break;
  } catch (error) {
    tried.push(`  ${candidate} → ${error.code || error.message}`);
  }
}

if (!chromium) {
  console.error('找不到 playwright。已尝试：');
  console.error(tried.join('\n'));
  console.error('设置 PLAYWRIGHT_PATH 环境变量指向 playwright 的安装目录，或在项目里安装它。');
  process.exit(2);
}

module.exports = { chromium };
