// 管理后台 UI 基元 · 标签与左索引栏。
//
// 约定（颜色/圆角全走 styles/admin.css 的 adm-* 类、不出现颜色字面量；图标一律内联 SVG；
// 单 props 参数 + 内联类型、不用 useMemo/useCallback）见 ./index.ts。
import { useRef, type ReactNode } from 'react';

/* ── 标签（下划线式）──────────────────────────────────── */

export function Tabs<T extends string>(props: {
  value: T;
  options: Array<{ value: T; label: string; count?: number; panelId?: string }>;
  onChange: (value: T) => void;
}) {
  // 键盘可达性：四个页签全部进 Tab 序列。
  //
  // 上一版照 WAI-ARIA tabs 规范做了 roving tabindex（Tab 只进一次、靠方向键切换）。
  // 用户实测反馈「tab 只能定位到文章，其他三个只能用方向键，这不是体验割裂吗」——
  // 判断成立：roving 对 20+ 项的长列表是净收益，对 4 项控件却是净损失。省下
  // 3 个 Tab 停靠点，代价是零可发现性（不知道有方向键的人根本到不了另外三个），
  // 而且和顶栏那组「Tab 走遍全部」的导航链接行为不一致。
  // 现在：Tab 走遍全部；方向键保留为快捷方式，两条路都能到。
  //
  // 顺带修一个死 ref：listRef 原来声明了却从没挂到 <nav> 上，于是下面那句
  // focus() 永远是空操作 —— 方向键只改选中、焦点不动，实测「焦点跟随: false」，
  // 而且焦点会停在 tabindex=-1 的旧项上，状态自相矛盾。
  const listRef = useRef<HTMLElement | null>(null);
  const move = (current: T, offset: 1 | -1) => {
    const index = props.options.findIndex((option) => option.value === current);
    if (index < 0) return;
    const next = props.options[(index + offset + props.options.length) % props.options.length];
    props.onChange(next.value);
    // 方向键切换时焦点跟随选中项（否则焦点留在旧页签上，与选中态脱节）
    listRef.current
      ?.querySelector<HTMLButtonElement>(`[data-tab="${next.value}"]`)
      ?.focus();
  };
  return (
    <nav ref={listRef} className="adm-tabs" role="tablist">
      {props.options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          id={`adm-tab-${option.value}`}
          data-tab={option.value}
          className="adm-tab"
          aria-selected={props.value === option.value}
          aria-controls={option.panelId}
          tabIndex={0}
          onClick={() => props.onChange(option.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowRight') {
              event.preventDefault();
              move(props.value, 1);
            } else if (event.key === 'ArrowLeft') {
              event.preventDefault();
              move(props.value, -1);
            }
          }}
        >
          {option.label}
          {typeof option.count === 'number' ? (
            <em className="adm-tab-count">{option.count}</em>
          ) : null}
        </button>
      ))}
    </nav>
  );
}

/* ── 左索引栏 ─────────────────────────────────────────── */

/** 工作台左栏：标题 + 计数 + 可选动作（新建），下面是可滚动的条目列表 */
export function Rail(props: {
  title: string;
  count: number;
  action?: ReactNode;
  filter?: ReactNode;
  children: ReactNode;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);

  // 方向键导航（审计 P4）：24 条 = 24 个 Tab 停靠点，键盘用户换文档得按 20 多次。
  // 改成 roving tabindex：Tab 只进一次，↑↓ 在条目间移动**并选中**（与鼠标一致），
  // Home/End 跳首尾 —— listbox 的常规键盘契约。
  const focusAt = (index: number) => {
    const items = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('.adm-ritem') ?? []);
    if (!items.length) return;
    const target = items[(index + items.length) % items.length];
    target.focus();
    target.click();
  };
  const move = (offset: 1 | -1) => {
    const items = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('.adm-ritem') ?? []);
    if (!items.length) return;
    const focused = items.findIndex((el) => el === document.activeElement);
    const selected = items.findIndex((el) => el.getAttribute('aria-selected') === 'true');
    focusAt((focused >= 0 ? focused : Math.max(selected, 0)) + offset);
  };

  return (
    <aside className="adm-rail">
      <div className="adm-rail-head">
        <h2 className="adm-rail-title">{props.title}</h2>
        <span className="adm-rail-count">{props.count}</span>
        <span style={{ flex: 1 }} />
        {props.action}
      </div>
      {props.filter ? <div className="adm-rail-filter">{props.filter}</div> : null}
      <div
        ref={listRef}
        className="adm-rail-list"
        role="listbox"
        aria-label={`${props.title}列表`}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            move(1);
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            move(-1);
          } else if (event.key === 'Home') {
            event.preventDefault();
            focusAt(0);
          } else if (event.key === 'End') {
            event.preventDefault();
            focusAt(-1);
          }
        }}
      >
        {props.children}
      </div>
    </aside>
  );
}

/**
 * 索引条目：序号 + 标题 + 状态点（+ 草稿点）。
 * 只有标题一行 —— 这是整块界面密度（一屏 18 行）的来源，加第二行会立刻变回列表页。
 * tone：on = 已启用（实心点）/ off = 未启用（空心点）/ warn = 需注意（实心点 + 变色标题）
 * pending：这条有未保存草稿 —— 解决审计 P3：站点设置改了三项，左栏看不出哪几项欠着。
 */
export function RailItem(props: {
  index: number;
  title: string;
  selected: boolean;
  tone?: 'on' | 'off' | 'warn';
  pending?: boolean;
  selectedOnEnter?: boolean;
  onSelect: () => void;
}) {
  const tone = props.tone ?? 'on';
  return (
    <button
      type="button"
      role="option"
      className={['adm-ritem', tone === 'warn' ? 'adm-ritem--warn' : ''].filter(Boolean).join(' ')}
      aria-selected={props.selected}
      title={props.title}
      // roving tabindex（P4）：列表里只有一个可停靠点，Tab 键不再逐个扫过 24 条
      tabIndex={props.selected ? 0 : -1}
      data-autofocus={props.selectedOnEnter && props.selected ? '' : undefined}
      onClick={props.onSelect}
    >
      <span className="adm-ritem-n">{String(props.index).padStart(2, '0')}</span>
      <span className="adm-ritem-t">{props.title}</span>
      {props.pending ? <span className="adm-ritem-p" title="有未保存草稿" /> : null}
      <span
        className={['adm-ritem-d', tone === 'off' ? 'adm-ritem-d--off' : ''].filter(Boolean).join(' ')}
        aria-hidden="true"
      />
    </button>
  );
}

