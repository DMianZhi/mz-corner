// 管理后台 UI 基元 · 按钮与表单字段。
//
// 约定（颜色/圆角全走 styles/admin.css 的 adm-* 类、不出现颜色字面量；图标一律内联 SVG；
// 单 props 参数 + 内联类型、不用 useMemo/useCallback）见 ./index.ts。
//
// 字段元信息通道（FieldMetaContext 生产、各控件消费）与 FieldRow 一并留在本文件内：
// 它是模块私有实现，拆到两个文件就得把 context 也导出成公开 API。
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './icon';

/** 把 textarea 高度设为「内容高度 + 上下边框」。
 *  border-box 下 height 含边框，不补 borderY 会恒差 2px，留一条看不见的内部滚动。
 *  提成模块级纯函数而不是组件内 useCallback：client/AGENTS.md 约定不用 useMemo/useCallback。 */
export function fitTextarea(el: HTMLTextAreaElement) {
  const cs = getComputedStyle(el);
  const borderY = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight + borderY}px`;
}

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

  // autoGrow：内容变化时把高度重置为内容高度，短内容不浪费空间，长内容自然展开
  useEffect(() => {
    if (!props.autoGrow || !ref.current) return;
    fitTextarea(ref.current);
  }, [props.value, props.autoGrow]);
  // 宽度变化也要重算（窗口缩放 / 窄屏降级）：只跟内容走的话，窄屏下会留着
  // 按宽屏算出的高度，正文被截出一截内部滚动。只在宽度真变了才重算，避免自循环。
  useEffect(() => {
    const el = ref.current;
    if (!props.autoGrow || !el || typeof ResizeObserver === 'undefined') return undefined;
    let lastW = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (Math.abs(el.clientWidth - lastW) < 1) return;
      lastW = el.clientWidth;
      fitTextarea(el);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [props.autoGrow]);

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

