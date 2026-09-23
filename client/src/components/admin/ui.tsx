// 管理后台 UI 基元。
//
// 约定：
// - 颜色/圆角/动效全部走 styles/admin.css 的 `adm-*` 类，那里再引用站点设计令牌，
//   所以本文件**不出现任何颜色字面量**，明暗主题自动跟随
// - 图标一律内联 SVG（stroke=currentColor），不用 emoji，也不用 × / ✕ 字形
// - 遵循 client/AGENTS.md：单 props 参数 + 内联类型、不用 useMemo/useCallback
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

/* ── 图标 ─────────────────────────────────────────────── */

function Svg(props: { children: ReactNode; size?: number; strokeWidth?: number }) {
  return (
    <svg
      width={props.size ?? 16}
      height={props.size ?? 16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={props.strokeWidth ?? 1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0, display: 'block' }}
    >
      {props.children}
    </svg>
  );
}

export const Icon = {
  Lock: (props: { size?: number }) => (
    <Svg size={props.size}>
      <rect x="4" y="10.5" width="16" height="10.5" rx="2.5" />
      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
    </Svg>
  ),
  Download: (props: { size?: number }) => (
    <Svg size={props.size}>
      <path d="M12 3v12" />
      <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
      <path d="M4 20h16" />
    </Svg>
  ),
  Logout: (props: { size?: number }) => (
    <Svg size={props.size}>
      <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
      <path d="m10 8-4 4 4 4" />
      <path d="M6 12h9" />
    </Svg>
  ),
  Plus: (props: { size?: number }) => (
    <Svg size={props.size}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </Svg>
  ),
  Trash: (props: { size?: number }) => (
    <Svg size={props.size}>
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="m6 7 1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </Svg>
  ),
  Check: (props: { size?: number }) => (
    <Svg size={props.size}>
      <path d="m5 13 4 4L19 7" />
    </Svg>
  ),
  Save: (props: { size?: number }) => (
    <Svg size={props.size}>
      <path d="M5 4h11l3 3v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" />
      <path d="M8 4v6h7" />
      <path d="M8 20v-5h8v5" />
    </Svg>
  ),
  Eye: (props: { size?: number }) => (
    <Svg size={props.size}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </Svg>
  ),
  EyeOff: (props: { size?: number }) => (
    <Svg size={props.size}>
      <path d="M4 4l16 16" />
      <path d="M10.6 6.1A9.6 9.6 0 0 1 12 6c6.5 0 9.5 6 9.5 6a17.6 17.6 0 0 1-2.1 2.9M6.6 7.4A16.8 16.8 0 0 0 2.5 12S6 18 12 18c1.4 0 2.7-.3 3.8-.8" />
      <path d="M9.9 10.2a3 3 0 0 0 4 4" />
    </Svg>
  ),
  Split: (props: { size?: number }) => (
    <Svg size={props.size}>
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
      <path d="M12 4.5v15" />
    </Svg>
  ),
  Pencil: (props: { size?: number }) => (
    <Svg size={props.size}>
      <path d="M4 20h4L19 9a2.5 2.5 0 0 0-3.5-3.5L4 16.5V20Z" />
      <path d="m14.5 6.5 3 3" />
    </Svg>
  ),
  ChevronRight: (props: { size?: number }) => (
    <Svg size={props.size}>
      <path d="m9.5 6 6 6-6 6" />
    </Svg>
  ),
  ChevronDown: (props: { size?: number }) => (
    <Svg size={props.size}>
      <path d="m6 9.5 6 6 6-6" />
    </Svg>
  ),
  ArrowLeft: (props: { size?: number }) => (
    <Svg size={props.size}>
      <path d="M19 12H5" />
      <path d="m11 6-6 6 6 6" />
    </Svg>
  ),
  Refresh: (props: { size?: number }) => (
    <Svg size={props.size}>
      <path d="M20 12a8 8 0 1 1-2.4-5.7" />
      <path d="M20 4v4.5h-4.5" />
    </Svg>
  ),
  ExternalLink: (props: { size?: number }) => (
    <Svg size={props.size}>
      <path d="M14 4h6v6" />
      <path d="M20 4 11 13" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </Svg>
  ),
  Warning: (props: { size?: number }) => (
    <Svg size={props.size}>
      <path d="M12 4 2.5 20h19L12 4Z" />
      <path d="M12 10v4" />
      <path d="M12 17.2h.01" />
    </Svg>
  ),
  Article: (props: { size?: number }) => (
    <Svg size={props.size}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6" />
      <path d="M9 17h4" />
    </Svg>
  ),
  Folder: (props: { size?: number }) => (
    <Svg size={props.size}>
      <path d="M3 7a2 2 0 0 1 2-2h3.6l2 2.5H19a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
    </Svg>
  ),
  Comment: (props: { size?: number }) => (
    <Svg size={props.size}>
      <path d="M20 15a3 3 0 0 1-3 3H8l-4 3V6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v9Z" />
    </Svg>
  ),
  Sliders: (props: { size?: number }) => (
    <Svg size={props.size}>
      <path d="M4 8h9" />
      <path d="M19 8h1" />
      <circle cx="16" cy="8" r="2" />
      <path d="M4 16h4" />
      <path d="M14 16h6" />
      <circle cx="11" cy="16" r="2" />
    </Svg>
  ),
  Spinner: (props: { size?: number }) => (
    <Svg size={props.size} strokeWidth={2}>
      <path className="adm-spin" d="M12 3a9 9 0 1 0 9 9" style={{ transformOrigin: '12px 12px' }} />
    </Svg>
  ),
};

/* ── 字段元信息（label/id/错误态 的关联通道）──────────────── */

// FieldRow 生成唯一控件 id 与错误 id，通过 context 下发给里面的输入控件；
// 控件拿不到 context（登录门等独立用法）时就退化为普通控件，可用显式 aria-label。
// 解决审计 P4：抽查 5 个字段 0 个有关联 label —— 读屏用户听不到字段名。
type FieldMeta = { id: string; hintId?: string; errorId?: string; invalid?: boolean };
const FieldMetaContext = createContext<FieldMeta | null>(null);

/** 读屏专用文本：视觉不占位，但能被辅助技术念出来 */
export function SrOnly(props: { children: ReactNode }) {
  return <span className="adm-sr">{props.children}</span>;
}

/* ── 按钮 ─────────────────────────────────────────────── */

export function Button(props: {
  children?: ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'primary' | 'quiet' | 'danger';
  size?: 'sm' | 'md';
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  title?: string;
  full?: boolean;
  type?: 'button' | 'submit';
  /** 加载/请求进行中时对读屏声明 */
  ariaBusy?: boolean;
}) {
  const variant = props.variant ?? 'default';
  const className = [
    'adm-btn',
    variant !== 'default' ? `adm-btn--${variant}` : '',
    props.size === 'sm' ? 'adm-btn--sm' : '',
    props.icon && !props.children ? 'adm-btn--icon' : '',
    props.full ? 'adm-btn--full' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type={props.type ?? 'button'}
      className={className}
      title={props.title}
      onClick={props.onClick}
      disabled={props.disabled || props.loading}
      aria-busy={props.loading || props.ariaBusy || undefined}
    >
      {props.loading ? <Icon.Spinner /> : props.icon}
      {props.children}
    </button>
  );
}

/* ── 表单字段 ─────────────────────────────────────────── */

export function TextInput(props: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  monospace?: boolean;
  big?: boolean;
  disabled?: boolean;
  maxLength?: number;
  /** 口令类字段传 'password' 以掩码回显；不传即普通文本输入框 */
  type?: 'text' | 'password';
  /** 数字字段拉起数字键盘（桌面无感，移动端必需） */
  inputMode?: 'numeric' | 'decimal';
  /** 登录门等无 FieldRow 包裹时的读屏名 */
  ariaLabel?: string;
  autoComplete?: string;
  autoFocus?: boolean;
  /** 口令框显隐切换：仅在 type="password" 时有意义（审计 P2-7） */
  revealable?: boolean;
  /** 字段名：落到控件的 data-field，保存失败时按它定位到具体字段（审计 P2-4） */
  fieldName?: string;
}) {
  const meta = useContext(FieldMetaContext);
  const [revealed, setRevealed] = useState(false);
  const wrapClass = 'adm-reveal';
  const input = (
    <input
      className={['adm-input', props.monospace ? 'adm-input--mono' : '', props.big ? 'adm-input--title' : '']
        .filter(Boolean)
        .join(' ')}
      type={props.revealable && revealed ? 'text' : (props.type ?? 'text')}

      id={meta?.id}
      data-field={props.fieldName}
      aria-label={meta ? undefined : props.ariaLabel}
      aria-invalid={meta?.invalid || undefined}
      aria-describedby={meta?.errorId}
      value={props.value}
      placeholder={props.placeholder}
      disabled={props.disabled}
      maxLength={props.maxLength}
      inputMode={props.inputMode}
      autoComplete={props.autoComplete}
      autoFocus={props.autoFocus}
      onChange={(event) => props.onChange(event.target.value)}
    />
  );
  if (!props.revealable) return input;
  return (
    <div className={wrapClass}>
      {input}
      <button
        type="button"
        className="adm-reveal-btn"
        aria-label={revealed ? '隐藏口令' : '显示口令'}
        aria-pressed={revealed}
        onClick={() => setRevealed((v) => !v)}
      >
        {revealed ? <Icon.EyeOff size={16} /> : <Icon.Eye size={16} />}
      </button>
    </div>
  );
}

export function TextArea(props: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  monospace?: boolean;
  rows?: number;
  code?: boolean;
  /** 随内容自动增减高度（文章编辑器与评论正文用） */
  autoGrow?: boolean;
  /** 外部滚动定位用（错误字段聚焦/滚动会拿到它） */
  textareaRef?: React.Ref<HTMLTextAreaElement>;
  /** 字段名：保存失败时按它定位到具体字段（审计 P2-4） */
  fieldName?: string;
}) {
  const meta = useContext(FieldMetaContext);
  const ref = useRef<HTMLTextAreaElement | null>(null);

  // autoGrow：内容变化时把高度重置为滚动高度，短内容不浪费空间，长内容自然展开
  useEffect(() => {
    if (!props.autoGrow || !ref.current) return;
    const el = ref.current;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [props.value, props.autoGrow]);

  return (
    <textarea
      ref={(node) => {
        ref.current = node;
        const external = props.textareaRef;
        if (typeof external === 'function') external(node);
        else if (external && typeof external === 'object') {
          (external as React.MutableRefObject<HTMLTextAreaElement | null>).current = node;
        }
      }}
      className={['adm-textarea', props.monospace ? 'adm-input--mono' : '', props.code ? 'adm-textarea--code' : '']
        .filter(Boolean)
        .join(' ')}
      id={meta?.id}
      data-field={props.fieldName}
      aria-invalid={meta?.invalid || undefined}
      aria-describedby={[props.code ? `${meta?.id}-hint` : undefined, meta?.errorId].filter(Boolean).join(' ') || undefined}
      value={props.value}
      rows={props.rows}
      placeholder={props.placeholder}
      spellCheck={false}
      onChange={(event) => props.onChange(event.target.value)}
    />
  );
}

export function Select(props: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  fieldName?: string;
}) {
  const fieldMeta = useContext(FieldMetaContext);
  return (
    <span className="adm-select-wrap">
      <select
        className="adm-select"
        id={fieldMeta?.id}
        data-field={props.fieldName}
        aria-invalid={fieldMeta?.invalid || undefined}
        aria-describedby={fieldMeta?.errorId}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      >
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <span className="adm-select-arrow">
        <Icon.ChevronDown size={14} />
      </span>
    </span>
  );
}

/** 标签输入：回车或逗号提交，退格删除末项 */
export function TagInput(props: {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  fieldName?: string;
}) {
  const [draft, setDraft] = useState('');
  const field = useContext(FieldMetaContext);

  const commit = () => {
    const parts = draft
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    const next = [...props.value];
    for (const part of parts) if (!next.includes(part)) next.push(part);
    props.onChange(next);
    setDraft('');
  };

  return (
    <span className="adm-taginput" data-field={props.fieldName}>
      {props.value.map((tag) => (
        <span key={tag} className="adm-chip">
          {tag}
          <button
            type="button"
            className="adm-chip-x"
            title={`移除 ${tag}`}
            aria-label={`移除标签 ${tag}`}
            onClick={() => props.onChange(props.value.filter((item) => item !== tag))}
          >
            <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true">
              <path
                d="M2.5 2.5l7 7M9.5 2.5l-7 7"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </span>
      ))}
      <input
        id={field?.id}
        aria-invalid={field?.invalid || undefined}
        aria-describedby={field?.errorId}
        value={draft}
        placeholder={props.value.length === 0 ? props.placeholder : ''}
        onChange={(event) => {
          // 输入逗号即时提交，避免用户以为逗号是分隔符却留在了文本里
          if (event.target.value.includes(',')) {
            setDraft(event.target.value);
            return;
          }
          setDraft(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ',') {
            event.preventDefault();
            commit();
          } else if (event.key === 'Backspace' && !draft && props.value.length > 0) {
            props.onChange(props.value.slice(0, -1));
          }
        }}
        onBlur={commit}
      />
    </span>
  );
}

/* ── 标签（下划线式）──────────────────────────────────── */

export function Tabs<T extends string>(props: {
  value: T;
  options: Array<{ value: T; label: string; count?: number; panelId?: string }>;
  onChange: (value: T) => void;
}) {
  // 方向键切换（WAI-ARIA tabs 模式）：tablist 内 Tab 键只进一次，
  // 左右箭头在四个标签间移动并选中 —— 读屏与键盘用户的预期行为。
  const listRef = useRef<HTMLButtonElement | null>(null);
  const move = (current: T, offset: 1 | -1) => {
    const index = props.options.findIndex((option) => option.value === current);
    if (index < 0) return;
    const next = props.options[(index + offset + props.options.length) % props.options.length];
    props.onChange(next.value);
    // 焦点跟随选中项（roving tabindex 的简化版：始终只有一个可停靠点）
    listRef.current
      ?.querySelector<HTMLButtonElement>(`[data-tab="${next.value}"]`)
      ?.focus();
  };
  return (
    <nav className="adm-tabs" role="tablist">
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
          tabIndex={props.value === option.value ? 0 : -1}
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
  return (
    <aside className="adm-rail">
      <div className="adm-rail-head">
        <h2 className="adm-rail-title">{props.title}</h2>
        <span className="adm-rail-count">{props.count}</span>
        <span style={{ flex: 1 }} />
        {props.action}
      </div>
      {props.filter ? <div className="adm-rail-filter">{props.filter}</div> : null}
      <div className="adm-rail-list" role="listbox" aria-label={`${props.title}列表`}>
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

/* ── 详情页零件 ───────────────────────────────────────── */

/** 章节 kicker（编号 + 英文小标），复用站点 .kicker-site 语言 */
export function Kicker(props: { num: string; label: string }) {
  return (
    <div className="kicker-site">
      <span className="kicker-num">{props.num}</span>
      {props.label}
    </div>
  );
}

/**
 * 详情页字段行：左等宽标签 + 右控件，行间发丝线。
 * 生成唯一 id 并通过 context 下发给内部控件（label/htmlFor/aria-describedby 全接上）。
 * error 传入时：标签与控件变红、控件 aria-invalid、错误文字挂到控件描述里 ——
 * 解决审计 P2：服务端错误只进顶部 toast，不落到字段上。
 */
let fieldSeq = 0;
export function FieldRow(props: {
  label: string;
  hint?: string;
  required?: boolean;
  top?: boolean;
  error?: string;
  /** 字段名：出错的整行滚动定位用（审计 P2-4） */
  fieldName?: string;
  children: ReactNode;
}) {
  const [id] = useState(() => `adm-f-${++fieldSeq}`);
  const hintId = props.hint ? `${id}-hint` : undefined;
  const errorId = props.error ? `${id}-err` : undefined;
  const meta: FieldMeta = { id, hintId, errorId, invalid: Boolean(props.error) };
  return (
    <FieldMetaContext value={meta}>
      <div
        data-field-row={props.fieldName}
        className={[
          'adm-fv',
          props.top ? 'adm-fv--top adm-fv--full' : '',
          props.error ? 'adm-fv--error' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <label className="adm-fv-k" htmlFor={id}>
          {props.label}
          {props.required ? <span className="adm-req"> *</span> : null}
        </label>
        <span className="adm-fv-v">
          {props.children}
          {props.hint ? (
            <span id={hintId} className="adm-field-hint" style={{ display: 'block', marginTop: 6 }}>
              {props.hint}
            </span>
          ) : null}
          {props.error ? (
            <span id={errorId} className="adm-field-error" role="alert" style={{ display: 'block', marginTop: 6 }}>
              {props.error}
            </span>
          ) : null}
        </span>
      </div>
    </FieldMetaContext>
  );
}

/** 只读字段值（详情页里不可编辑的元信息） */
export function FieldValue(props: { label: string; children: ReactNode }) {
  return (
    <div className="adm-fv">
      <span className="adm-fv-k">{props.label}</span>
      <span className="adm-fv-v">{props.children}</span>
    </div>
  );
}

/** 等宽文字链接（顶栏动作、索引栏「＋ 新建」） */
export function LinkButton(props: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  tone?: 'default' | 'brand';
  title?: string;
}) {
  return (
    <button
      type="button"
      className={['adm-link', props.tone === 'brand' ? 'adm-link--brand' : ''].filter(Boolean).join(' ')}
      title={props.title}
      disabled={props.disabled || props.loading}
      aria-busy={props.loading || undefined}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

/* ── 展示件 ───────────────────────────────────────────── */

export function Badge(props: {
  children: ReactNode;
  tone?: 'default' | 'brand' | 'danger' | 'muted';
}) {
  const tone = props.tone ?? 'default';
  return (
    <span className={['adm-badge', tone !== 'default' ? `adm-badge--${tone}` : ''].filter(Boolean).join(' ')}>
      {props.children}
    </span>
  );
}

export function EmptyState(props: { icon?: ReactNode; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="adm-empty adm-fade">
      {props.icon ? <span className="adm-empty-icon">{props.icon}</span> : null}
      <strong style={{ color: 'var(--text-2)', fontSize: 14, fontWeight: 600 }}>{props.title}</strong>
      {props.hint ? <span style={{ fontSize: 12.5, maxWidth: 420, lineHeight: 1.6 }}>{props.hint}</span> : null}
      {props.action ? <div style={{ marginTop: 6 }}>{props.action}</div> : null}
    </div>
  );
}

/** 两步确认删除：首次点击变成「确认删除」，3 秒内再点才真正执行 */
export function DangerConfirm(props: {
  onConfirm: () => void;
  label?: string;
  confirmLabel?: string;
  icon?: ReactNode;
  size?: 'sm' | 'md';
}) {
  const [armed, setArmed] = useState(false);
  const timerRef = useRef<number | null>(null);

  // 卸载时清掉确认倒计时，避免回到列表后定时器还把状态改掉（对已卸载组件 setState）
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const arm = () => {
    setArmed(true);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setArmed(false), 3000);
  };

  return (
    <Button
      variant="danger"
      size={props.size}
      icon={props.icon ?? <Icon.Trash />}
      onClick={() => {
        if (armed) {
          if (timerRef.current !== null) window.clearTimeout(timerRef.current);
          setArmed(false);
          props.onConfirm();
          return;
        }
        arm();
      }}
    >
      {armed ? (props.confirmLabel ?? '确认删除') : props.label}
    </Button>
  );
}
