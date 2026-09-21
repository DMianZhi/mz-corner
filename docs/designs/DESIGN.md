# 李四 · 项目导向型个人主页 — 视觉设计规范

> 版本：v2.0（项目导向重构，替代 v1 博客版式）
> 适用工程：`client/`（React 19 + Tailwind CSS 4 + shadcn/ui）
> 本文件是唯一视觉决策依据；实现时不得偏离数值，如需调整先回本文件修订。

---

## 1. 设计理念与记忆点策略

### 1.1 一句话概念

**「暗室色标 / Color Index」**——全站是一间深色画廊，没有长篇自我介绍，用户进入即见项目；每个项目被提炼为一枚**高饱和标志色方块**，用户关掉页面后记得的是"那个橙色方块做的工具"，而不是一段文字。

### 1.2 设计原则

1. **直奔主题**：首屏 Hero 仅保留姓名 + 一句头衔宣言（≤20 字），1 屏之内必须出现第一个项目。砍掉旧版的大段 About、统计卡片、装饰性插图。
2. **简洁是双刃剑**：布局极简，因此记忆点必须由三件事承担——标志色方块、超大号非对称字体、顺滑的物理感动效。
3. **高信息展示率**：不建项目详情页。一张项目卡承载"名称 + 简介 + 技术栈 + 链接 + 色标"全部信息，滑动即浏览全部项目。
4. **立体感演进**：用 CSS 3D transform + 鼠标视差让卡片脱离二维平面，但不引入 Three.js 等重型库。

### 1.3 参考案例融合（选定 4 种，不堆叠）

| 案例 | 借鉴手法 | 在本站的落点 |
|---|---|---|
| Seventeen Agency | 项目标志色方块，牺牲少量可读性换辨识度 | 每个项目一枚纯色方块封面（emoji/首字母居中），色值入库随项目数据走 |
| Stefan Vitasovic | 高信息展示率，滑动完成全部项目浏览 | 首页"项目长廊"：纵向滚动驱动横向位移，一卡看完一个项目所有信息 |
| Justine Soulie | 卡片位移 + 鼠标微动效（视差/倾斜） | 项目卡 3D 倾斜（±5°）+ Hero 多层视差 + 磁性按钮 |
| Obys | 非对称排版，前卫个性 | Hero 姓名两行错位缩进、超大索引数字、描边水印字 |

**手感基准**（非独立手法）：所有过渡对标 Camille Mormal 的顺滑度——统一使用 ease-out-expo 曲线 + lerp 插值平滑，杜绝生硬的 linear/ease 默认曲线。

### 1.4 记忆点自检清单（验收用）

- [ ] 首屏 3 秒内能看到：姓名大字、一句宣言、第一枚彩色方块
- [ ] 不看文字，仅凭色块能区分任意两个项目
- [ ] 鼠标划过项目卡时有可感知的 3D 倾斜反馈
- [ ] 全站无一张位图图片，视觉完全由色块、字体、动效构成

---

## 2. 色彩系统

### 2.1 深色基底（默认）

```css
:root {
  /* 基底 */
  --bg: #0A0A0B;            /* 页面主背景，近黑带极微蓝 */
  --bg-raised: #131316;     /* 抬升层（导航毛玻璃下的内容、页脚） */
  --bg-card: #17171B;       /* 卡片背景 */
  --bg-hover: #1E1E24;      /* 卡片/行 hover 背景 */

  /* 边框（用 rgba 以便叠在任意底色上） */
  --border: rgba(255, 255, 255, 0.08);
  --border-strong: rgba(255, 255, 255, 0.16);

  /* 文字 */
  --text-1: #F5F5F4;        /* 主文字 */
  --text-2: #A6A6AD;        /* 次要文字、简介 */
  --text-3: #5F5F66;        /* 索引号、时间戳、占位 */

  /* 站点信号色（酸性黄绿，仅用于：导航激活态、链接 hover、进度条、按钮、选区） */
  --accent: #C8F542;
  --accent-ink: #141800;    /* accent 底色上的文字色 */
  --accent-dim: rgba(200, 245, 66, 0.14);

  /* 功能色（尽量只在文章正文/提示中使用） */
  --danger: #FF5C5C;
  --success: #3DD68C;
}
```

### 2.2 浅色方案（`html.light` 或 `prefers-color-scheme: light` 且未手动选深色时）

```css
html.light {
  --bg: #FAFAF8;
  --bg-raised: #FFFFFF;
  --bg-card: #FFFFFF;
  --bg-hover: #F1F1EC;
  --border: rgba(20, 20, 22, 0.10);
  --border-strong: rgba(20, 20, 22, 0.20);
  --text-1: #141416;
  --text-2: #55555C;
  --text-3: #9B9BA1;
  --accent: #6E9E06;
  --accent-ink: #141800;
  --accent-dim: rgba(110, 158, 6, 0.12);
  --danger: #D93636;
  --success: #1F9D63;
}
```

### 2.3 项目标志色体系（核心）

项目数据中带 `color` 字段（hex）。预设 6 色，新增项目从中取用，保证任意相邻项目不同色：

| 令牌 | hex | 深色下卡片投影 | 浅色下卡片投影 |
|---|---|---|---|
| `--proj-ember` | `#FF5C38` | `rgba(255,92,56,0.45)` | `rgba(255,92,56,0.30)` |
| `--proj-indigo` | `#4D6BFE` | `rgba(77,107,254,0.45)` | `rgba(77,107,254,0.30)` |
| `--proj-teal` | `#2DD4BF` | `rgba(45,212,191,0.40)` | `rgba(45,212,191,0.28)` |
| `--proj-violet` | `#A78BFA` | `rgba(167,139,250,0.45)` | `rgba(167,139,250,0.30)` |
| `--proj-amber` | `#FFB020` | `rgba(255,176,32,0.40)` | `rgba(255,176,32,0.28)` |
| `--proj-rose` | `#FF6EA9` | `rgba(255,110,169,0.45)` | `rgba(255,110,169,0.30)` |

**标志色的 4 个使用层级**（以色值 `#FF5C38` 为例，实现时用 JS 把 hex 转 rgb 通道注入内联变量 `--pc` / `--pc-rgb`）：

1. **色块封面**：100% 纯色方块，上方居中放置项目 emoji 或首字母。这是唯一允许大面积纯色的位置。
2. **彩色投影**：色块下方 `box-shadow: 0 24px 64px -16px rgba(var(--pc-rgb), 0.45)`，让色块"浮"在暗底上。
3. **hover 染色**：项目卡 hover 时边框变为 `rgba(var(--pc-rgb), 0.40)`，卡内标题文字渐变为项目色。
4. **进度指示**：项目长廊底部的进度条当前段、计数器当前数字使用当前可视项目的颜色。

**禁止**：项目色与站点信号色 `--accent` 混用在同一元素上；项目色不得用作正文文字色（对比度不可控）。

### 2.4 shadcn/ui 令牌桥接（必须覆写，消除 oklch）

工程现有 `global.css` 中 shadcn 令牌为 oklch，必须用以下 hex 覆写（直接放 `:root`，**禁止包进 `@layer`**）：

```css
:root {
  --background: #0A0A0B;  --foreground: #F5F5F4;
  --card: #17171B;        --card-foreground: #F5F5F4;
  --popover: #1E1E24;     --popover-foreground: #F5F5F4;
  --primary: #C8F542;     --primary-foreground: #141800;
  --secondary: #1E1E24;   --secondary-foreground: #F5F5F4;
  --muted: #1E1E24;       --muted-foreground: #A6A6AD;
  --accent: #1E1E24;      --accent-foreground: #F5F5F4;
  --destructive: #FF5C5C; --destructive-foreground: #0A0A0B;
  --border: #26262B;      --input: #26262B;  --ring: #C8F542;
  --radius: 0.75rem;
}
html.light {
  --background: #FAFAF8;  --foreground: #141416;
  --card: #FFFFFF;        --card-foreground: #141416;
  --popover: #FFFFFF;     --popover-foreground: #141416;
  --primary: #6E9E06;     --primary-foreground: #FFFFFF;
  --secondary: #F1F1EC;   --secondary-foreground: #141416;
  --muted: #F1F1EC;       --muted-foreground: #55555C;
  --accent: #F1F1EC;      --accent-foreground: #141416;
  --destructive: #D93636; --destructive-foreground: #FFFFFF;
  --border: #E4E4E0;      --input: #E4E4E0;  --ring: #6E9E06;
}
```

> 注：桥接块的 `--accent` 是 shadcn 语义（hover 底色），与第 2.1 节站点信号色同名变量冲突时，**以组件局部作用域覆盖解决**：站点级元素（导航、链接、按钮）显式消费 `var(--accent)` 信号色，shadcn 组件内部走桥接值。实现时把信号色改名为 `--brand` 亦可，二选一，落地后回本文件同步。

---

## 3. 字体排版系统

### 3.1 字体栈（无网络字体，全系统栈）

```css
:root {
  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
               "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif;
  --font-mono: ui-monospace, "SF Mono", "Cascadia Mono", "JetBrains Mono",
               Consolas, "Liberation Mono", monospace;
}
```

分工：**sans 承担标题与正文；mono 承担索引号、标签、时间、按钮、导航链接**——mono 的机械感是本站个性的组成部分。

### 3.2 字阶（桌面→移动用 clamp 连续缩放，不单设断点值）

| 层级 | 字号 | 行高 | 字距 | 字重 | 用途 |
|---|---|---|---|---|---|
| Display | `clamp(64px, 13vw, 176px)` | 0.92 | -0.03em（仅拉丁） | 800 | Hero 姓名 |
| H1 | `clamp(40px, 7vw, 96px)` | 1.0 | -0.02em（仅拉丁） | 800 | 区块大标题（项目/文章/关于） |
| H2 | `clamp(30px, 4.5vw, 56px)` | 1.05 | -0.01em | 700 | 项目名、文章详情标题 |
| H3 | 24px | 1.25 | 0 | 700 | 卡片内小节 |
| Body-L | 18px | 1.7 | 0 | 400 | Hero 宣言、项目简介 |
| Body | 16px | 1.7 | 0 | 400 | 正文 |
| Small | 14px | 1.6 | 0 | 400 | 辅助说明 |
| Label | 12–13px | 1 | +0.14em（拉丁大写） | 500 | mono 索引、导航、标签、按钮 |

**中文排版规则**：中文不加 letter-spacing；中英文混排时拉丁自动落入系统字体差异即可，不做额外 font-feature 处理；Display/H1 级别标题如为纯中文，weight 用 700（系统黑体 800 在部分平台缺字重会合成加粗发虚）。

### 3.3 装饰性大字

- **描边水印字**（Hero 背景）：`font-size: clamp(120px, 18vw, 320px)`，`color: transparent`，`-webkit-text-stroke: 1px rgba(255,255,255,0.07)`（浅色模式 `rgba(20,20,22,0.06)`），内容如 "FULL-STACK"，绝对定位 `right: -2vw; bottom: 6vh`，`pointer-events: none`，`user-select: none`。
- **超大索引号**（项目卡/文章行）：mono，`clamp(48px, 6vw, 88px)`，`color: var(--text-3)`，透明度 0.5。

---

## 4. 布局系统

### 4.1 全局骨架

```css
:root {
  --gutter: clamp(20px, 4.5vw, 72px);   /* 页面左右边距 */
  --container: 1520px;                   /* 内容最大宽 */
  --nav-h: 64px;                         /* 移动端 56px */
}
```

间距刻度（px）：`4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96 / 128`，对应 Tailwind `1/2/3/4/6/8/12/16/24/32`。区块之间垂直间距统一 `clamp(96px, 14vh, 160px)`。

### 4.2 首页 `/`（四段，无多余板块）

```
┌ Nav（fixed，h 64px）
├ ① Hero（min-height: 100svh）
├ ② 项目长廊 Projects（核心，sticky 横向滚动区）
├ ③ 文章入口 Articles（精简，3 行最新文章）
└ ④ Footer / 联系
```

**① Hero（非对称，Obys 手法）**
- 布局：相对定位满屏容器，padding 为 `var(--gutter)`。
- 姓名「李四」分两行：第一行左对齐；第二行**缩进 `clamp(40px, 12vw, 200px)`**（错位即个性）。拉丁名 "LI SI" 以 Label 规格置于姓名右下方，旋转 0° 不放纵排。
- 宣言：Body-L，`color: var(--text-2)`，最大宽 560px，位于第二行姓名下方 32px。文案示例："全栈开发者，把想法做成能跑的产品。"
- 右上：mono 状态徽章（如 `OPEN TO WORK`，12px，圆点 8px 用 `--success`，呼吸动画 opacity 0.4↔1，2s ease-in-out infinite）。
- 底部 meta 行（距底 32px）：三列非对称分布——左侧 mono 坐标/城市（Label，`text-3`），中间滚动提示（↓ 箭头 + `SCROLL`，箭头上下浮动 8px，1.6s ease-in-out infinite），右侧当前时间或时区（mono）。中间列在移动端隐藏。
- 背景：右下描边水印字（见 3.3）+ 一枚 `--accent` 小方块 16×16px 绝对定位在姓名第一行左侧 -40px 处（品牌锚点，全站复用此方块作为 favicon/Logo 图形）。

**② 项目长廊（Stefan Vitasovic 手法，全站核心）**
- 结构：外层 section 高度由 JS 计算（`= 轨道宽度 - 视口宽 + 100vh`），内层 `position: sticky; top: 0; height: 100svh; overflow: hidden`，横向轨道 `display: flex; gap: clamp(24px, 4vw, 64px)`，纵向滚动进度映射为轨道 `translateX`（参数见 §5.2）。
- 区块头（滚动前固定显示一次）：kicker `01 — SELECTED WORKS`（Label，`--accent` 序号 + `text-3` 文字）+ H1「项目」。区块头独立于横向轨道，位于 sticky 区上方。
- 每个项目面板：宽 `min(78vw, 1040px)`，高 `min(72svh, 640px)`，垂直居中于 sticky 视口。面板内部 12 列网格：左 5 列放色块封面 + 索引，右 7 列放文字信息。**一卡即全部信息，无详情页**。
- 底部 UI（sticky 区内，距底 32px）：进度条（宽 200px，高 2px，底 `--border-strong`，已走段填充当前项目色）+ 计数器（mono 13px，`03 / 06`，当前数字用当前项目色）。
- 移动端（<1024px）：退化为纵向流式大卡，每张卡 `min-height: 70svh`，`scroll-snap-align: start`（容器 `scroll-snap-type: y proximity`），无横向轨道。

**③ 文章入口**
- kicker `02 — WRITING` + H1「文章」+ 右侧「查看全部 →」（mono Label，链接）。
- 3 行最新文章（行规格见 §6.4 文章行），取现有多维表数据按时间倒序。
- 不多做：无卡片网格、无封面图、无摘要截断——标题即入口。

**④ Footer / 联系**
- 上区：H1 级「联系我」（`clamp(48px, 9vw, 120px)`），下方邮箱链接（H3 规格，underline 动画，见 §5.5）。
- 下区：1px `--border` 分隔后，mono Label 行：`© 2026 李四` / `DESIGNED & BUILT BY LI SI` / `回到顶部 ↑`（点击 smooth scroll 至顶，600ms）。

### 4.3 文章列表页 `/articles`

- 头部：kicker + H1「文章」+ 计数（mono，`text-3`，如 `24 POSTS`）。
- 标签过滤行：标签 chips（§6.5），横向可滚动，选中态填充 `--accent` + `--accent-ink` 文字。
- 列表：文章行（§6.4）纵向排列，`padding: 22px 0`，行间 1px `--border`。
- 页面顶部进入动画：标题 translateY 24px→0 + opacity，500ms。

### 4.4 文章详情页 `/post/:id`

- 正文容器：`max-width: var(--content-w)`（1080px，与列表/归档/关于同宽），居中，padding 左右 `var(--gutter)`。
  不再单设阅读宽度：详情页比信息页窄 320px 时，跨页跳转内容边缘错位、观感割裂。
- 顶部：返回链接（mono，`← 文章列表`）→ 标题（H2 级）→ meta 行（日期 / 分类 / 阅读时长，mono Label，`text-3`）。
- 阅读进度条：`position: fixed; top: 0; left: 0; height: 2px; background: var(--accent); transform-origin: left; scaleX = 阅读进度`。
- 正文排版：Body 16px/1.8，段落间距 24px；`h2/h3` 上间距 48px/32px；代码块背景 `--bg-card`，边框 `--border`，radius 12px，mono 14px/1.6；行内代码 `--accent-dim` 底 + `--accent` 文字（深色）。
- 底部：上一篇/下一篇导航行（mono Label，箭头位移 hover）。

### 4.5 归档页 `/archive` 与关于页 `/about`

- 归档：按年份分组。年份用 mono `clamp(32px, 5vw, 48px)`、`text-3`，下方文章行紧凑版（`py-3`，标题 18px）。月份不显示，只显示 `MM-DD`。
- 关于：非对称双栏——左 5 列一枚 `--accent` 纯色方块（aspect-ratio 3/4，radius 20px，中央 emoji 👤 或"李"字，Display 规格）作为肖像占位；右 7 列：H1「关于」+ Body-L 自述（≤120 字）+ 技能标签云（§6.5 chips 平铺）+ 经历时间线（mono 年份 + Body 事件，行间 16px）。

---

## 5. 核心交互规格

### 5.1 动效令牌

```css
:root {
  --ease-standard: cubic-bezier(0.16, 1, 0.3, 1);    /* ease-out-expo，绝大多数过渡 */
  --ease-emphasis: cubic-bezier(0.83, 0, 0.17, 1);   /* 强进出，用于退场 */
  --ease-spring:   cubic-bezier(0.34, 1.56, 0.64, 1);/* 回弹，磁性按钮、hover 上浮 */
  --dur-fast: 150ms;   /* 微反馈：hover 变色 */
  --dur-med: 300ms;    /* 常规：位移、展开 */
  --dur-slow: 600ms;   /* 重过渡：卡片入场、页面切换 */
}
```

原则：**只动 `transform` 与 `opacity`**；入场动画触发用 IntersectionObserver（threshold 0.2，触发一次即断开）。

### 5.2 项目长廊：滚动驱动横向位移

- 映射：`progress = clamp(0, (viewportTop - sectionTop) / (sectionHeight - 100vh), 1)`；`targetX = -(trackWidth - viewportWidth + gutter*2) * progress`。
- 平滑（lerp，关键手感）：每帧 `currentX += (targetX - currentX) * 0.075`，rAF 驱动；`|targetX - currentX| < 0.5px` 时停帧省电。
- 卡内视差：色块封面额外 `translateX = (卡片中心偏离视口中心) * -0.06`（最大 ±24px），索引数字同向 `* -0.03`——滚动时色块与文字产生层次差。
- 卡片入场：进入 sticky 区时各卡 `opacity 0→1, translateY 40px→0`，700ms `--ease-standard`，按顺序 stagger 90ms。
- 实现约束：不得使用 scroll-behavior 劫持或阻止默认滚动；全部用 transform 映射原生滚动进度。

### 5.3 卡片 3D 倾斜（Cipher 轻量版 + Justine Soulie 视差）

仅桌面端（≥1024px 且 `pointer: fine`）启用，作用于项目面板卡：

- 容器 `perspective: 1200px`。
- 追踪中：`rotateY = (relX - 0.5) * 10deg`（即最大 ±5°），`rotateX = -(relY - 0.5) * 10deg`（最大 ±5°），`scale: 1.015`；transition 设为 `transform 100ms linear`（追踪期低延迟），rAF 写入。
- 高光层：卡面叠加 `radial-gradient(600px circle at var(--mx) var(--my), rgba(255,255,255,0.08), transparent 40%)`，`--mx/--my` 为卡内光标坐标。
- 离开：`transition: transform 500ms var(--ease-standard)`，回 `rotate 0 / scale 1`。
- 禁用条件：`prefers-reduced-motion: reduce`、触摸设备、<1024px——三条件任一命中即完全不初始化（不注册监听）。

### 5.4 Hero 鼠标视差与磁性按钮

- Hero 视差：三层 `data-depth`——色块锚点 0.06（最大位移 ±18px）、宣言文字 0.03（±8px）、水印字 0.015（±5px）。位移 = `(光标 - 视口中心) * depth * 2`，rAF + lerp 0.06 平滑。
- 磁性按钮（Footer 邮箱、主按钮）：以按钮中心为原点，光标进入按钮外扩 64px 半径后，按钮 `translate = (光标 - 中心) * 0.35`（最大 8px）；离开后 400ms `--ease-spring` 回弹归零。
- 滚动提示箭头：`translateY 0→8px→0`，1.6s ease-in-out infinite。

### 5.5 链接与行级 hover

- 下划线动画：`background-image: linear-gradient(currentColor, currentColor); background-size: 0% 2px; background-position: 0 100%; background-repeat: no-repeat;` hover 时 `background-size: 100% 2px`，280ms `--ease-standard`。用于正文链接、邮箱。
- 文章行 hover（250ms `--ease-standard`，多属性同帧）：
  - 背景 → `var(--bg-hover)`（padding 左右各 16px 负 margin 补偿，制造面片感）
  - 标题 `translateX: +8px`
  - 尾部箭头 `translateX: +6px`，颜色 `text-3 → var(--accent)`
- 导航链接 hover：`color: var(--text-3) → var(--text-1)`，150ms；当前页为 2px `--accent` 下划线（offset 6px）。

### 5.6 页面/路由过渡

- 入场：`opacity 0→1, translateY 16px→0`，450ms `--ease-standard`，延迟 60ms。
- 退场：`opacity→0, translateY 8px`，200ms `--ease-emphasis`。
- HashRouter 下用 location key 包裹 `<main>` 做 key 切换即可，不引入过渡库。

### 5.7 动效降级

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

reduced-motion 下：横向长廊退化为普通纵向卡片流（JS 判断后不加 sticky），倾斜/视差/磁性全部不初始化，仅保留即时状态变化。

---

## 6. 组件设计

### 6.1 导航 Nav

- `position: fixed; top: 0; z-index: 50; height: var(--nav-h); width: 100%`
- 背景：`rgba(10,10,11,0.55)` + `backdrop-filter: blur(12px)`（浅色 `rgba(250,250,248,0.6)`），底边 1px `--border`。滚动 0px 时背景透明，滚动 >8px 后渐变出背景（transition 300ms）。
- 左：16×16px `--accent` 方块（radius 4px）+ 「李四」（16px/700）+ mono `LI SI`（11px，`text-3`，<640px 隐藏）。
- 右：链接组 `项目 / 文章 / 归档 / 关于`，mono Label 13px，大写拉丁或中文原样，间距 32px（移动端 16px、字号 12px）。
- 右侧最末：主题切换按钮（日/月 emoji 或自绘 16px 图标，点击切换 `html.light` 并写 localStorage）。

### 6.2 项目卡 Project Panel（首页长廊单元）

```
┌──────────────────────────────────────────────┐
│ [色块 168px]   01 ──────────────  (索引 mono)  │
│  +彩色投影      项目名（H2，hover 染项目色）      │
│                简介（Body-L，text-2，≤80字）     │
│                [React] [Nitro] [WPS]（标签行）   │
│                访问项目 → （mono Label 链接）     │
└──────────────────────────────────────────────┘
```

- 卡面：bg `--bg-card`，border 1px `--border`，radius 20px，padding `clamp(28px, 4vw, 56px)`。
- 色块：正方形 `clamp(96px, 14vw, 168px)`，radius 16px，内居中 emoji/首字母 `clamp(40px, 6vw, 72px)`；`box-shadow: 0 24px 64px -16px rgba(var(--pc-rgb), 0.45)`。
- hover（250ms `--ease-standard`）：边框 → `rgba(var(--pc-rgb), 0.4)`；卡面 `translateY: -4px`；标题色 → 项目色。叠加 §5.3 的 3D 倾斜。
- 状态徽章（可选）：`LIVE`/`WIP` mono 10px，圆角 999px，边框 1px，置于卡面右上角。
- 移动端：整卡宽度 `100%`，radius 16px，padding 24px，色块 72px，文字信息在色块下方。

### 6.3 项目数据模型（交付给前端的字段约定）

```ts
interface Project {
  id: string;
  name: string;            // 项目名，≤12 字
  tagline: string;         // 一句话简介，≤40 字
  description?: string;    // 补充说明，≤80 字
  tech: string[];          // 技术栈，≤5 个，单个 ≤12 字符
  link?: string;           // 外部链接，缺省则不渲染链接行
  color: string;           // 标志色 hex，取自 §2.3 预设
  symbol: string;          // 封面 emoji 或首字母（1 个字符）
  order: number;           // 排序，升序
  status?: 'live' | 'wip' | 'archived';
}
```

### 6.4 文章行 Article Row（首页入口与 /articles 共用）

- 网格：`grid-template-columns: 48px 1fr auto 24px; gap: 16px; align-items: baseline; padding: 22px 0; border-top: 1px solid var(--border);`
- 列内容：mono 索引号（13px，`text-3`）→ 标题（20px/600，`text-1`）→ 日期（mono 12px，`text-3`，格式 `2026-09-17`）→ 箭头 `→`（16px，`text-3`）。
- hover 见 §5.5。整行为 `<a>` 可点击。
- 移动端：索引列宽 32px，日期换行至标题下方（grid 改两行）。

### 6.5 标签 chip / 按钮

- 技术栈标签：mono 12px，`padding: 5px 10px`，radius 999px，border 1px `--border`，`color: var(--text-2)`，bg 透明；hover：border → `--border-strong`，color → `--text-1`，150ms。
- 过滤标签（/articles）：同上，选中态：bg `--accent`，color `--accent-ink`，border-color transparent。
- 主按钮：radius 999px，height 48px，`padding: 0 28px`，bg `--accent`，color `--accent-ink`，15px/600。hover：`translateY(-2px)` + `box-shadow: 0 8px 24px -8px rgba(200,245,66,0.5)`；active：`translateY(0) scale(0.98)`；全部 200ms `--ease-spring`。叠加 §5.4 磁性效果。
- 幽灵按钮：同尺寸，bg 透明，border 1px `--border-strong`，color `--text-1`；hover bg `--bg-hover`。
- focus-visible（全站统一）：`outline: 2px solid var(--accent); outline-offset: 3px;`

### 6.6 页脚 Footer

规格见 §4.2 ④。补充：社交链接行（GitHub / 邮箱 / 博客）用 mono Label + 下划线动画，间距 24px，置于大标题与底栏之间。

---

## 7. 响应式断点

沿用 Tailwind 默认断点，行为分档：

| 断点 | 宽度 | 关键行为 |
|---|---|---|
| <640px | 手机 | gutter 20px；nav 56px 高、隐藏拉丁副名；Hero 宣言 16px；项目卡纵向流 + scroll-snap；文章行两行布局；水印字隐藏 |
| 640–1023 | 平板 | gutter 32px；项目卡纵向流但色块 120px；倾斜/视差关闭 |
| ≥1024 | 桌面 | 横向长廊激活；3D 倾斜 + 鼠标视差激活；gutter 至 72px |
| ≥1520 | 宽屏 | 内容封顶 1520px 居中，两侧留白为背景色 |

触摸检测用 `matchMedia('(pointer: coarse)')`，触摸设备一律按"无鼠标微动效"处理，与断点判定相互独立。

---

## 8. 实现约束核对表（与硬性技术约束逐条对应）

- [x] 无外部网络资源：字体全系统栈（§3.1），视觉无位图、色块/emoji 全本地渲染，不引任何 CDN。
- [x] CSS 变量直接定义在 `:root` / `html.light`，不包 `@layer`；全站仅用 hex / rgb / rgba，无 `oklch()`、无 `color-mix()`（§2 全部色值合规；shadcn oklch 令牌按 §2.4 覆写）。
- [x] 动效 = CSS transition/transform + 少量 JS（rAF + lerp + IntersectionObserver + 光标坐标监听），估算增量 JS < 4KB，不引入动画库/Three.js（§5）。
- [x] 深色为默认基底，浅色完整变量备选（§2.1/§2.2），移动端响应式（§7）。
- [x] 项目数据字段与 §6.3 模型一致：名称/简介/技术栈数组/链接/标志色(hex)/封面 emoji 或首字母/排序。

## 9. 性能与可访问性底线

- 动画只触 `transform`/`opacity`；`will-change` 仅用于倾斜中卡片，离开即移除。
- 毛玻璃仅限导航一处；`backdrop-filter` 不叠加使用。
- 对比度：正文 `--text-1`/`--text-2` 对 `--bg` 均 ≥ 7:1；`--text-3` 仅用于非关键装饰性信息（索引、水印）。
- 所有交互元素可键盘到达，focus-visible 样式统一（§6.5）；横向长廊不劫持滚动，键盘与读屏按 DOM 顺序访问全部项目。
- 首屏 LCP 目标：系统字体 + 无位图，LCP 元素为 Hero 文字，预算 < 1.5s。
