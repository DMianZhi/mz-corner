// 管理后台 UI 基元。
//
// 约定：
// - 颜色/圆角/动效全部走 styles/admin.css 的 `adm-*` 类，那里再引用站点设计令牌，
//   所以本文件**不出现任何颜色字面量**，明暗主题自动跟随
// - 图标一律内联 SVG（stroke=currentColor），不用 emoji，也不用 × / ✕ 字形
// - 遵循 client/AGENTS.md：单 props 参数 + 内联类型、不用 useMemo/useCallback
import { useState, type CSSProperties, type ReactNode } from 'react';

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
    >
      {props.loading ? <Icon.Spinner /> : props.icon}
      {props.children}
    </button>
  );
}

/* ── 表单字段 ─────────────────────────────────────────── */

export function Field(props: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <label className="adm-field" style={props.style}>
      <span className="adm-field-label">
        {props.label}
        {props.required ? <span className="adm-req">*</span> : null}
      </span>
      {props.children}
      {props.error ? (
        <span className="adm-field-error">{props.error}</span>
      ) : props.hint ? (
        <span className="adm-field-hint">{props.hint}</span>
      ) : null}
    </label>
  );
}

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
}) {
  return (
    <input
      className={['adm-input', props.monospace ? 'adm-input--mono' : '', props.big ? 'adm-input--title' : '']
        .filter(Boolean)
        .join(' ')}
      type={props.type ?? 'text'}
      value={props.value}
      placeholder={props.placeholder}
      disabled={props.disabled}
      maxLength={props.maxLength}
      onChange={(event) => props.onChange(event.target.value)}
    />
  );
}

export function TextArea(props: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  monospace?: boolean;
  rows?: number;
  code?: boolean;
}) {
  return (
    <textarea
      className={['adm-textarea', props.monospace ? 'adm-input--mono' : '', props.code ? 'adm-textarea--code' : '']
        .filter(Boolean)
        .join(' ')}
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
}) {
  return (
    <span className="adm-select-wrap">
      <select
        className="adm-select"
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
}) {
  const [draft, setDraft] = useState('');

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
    <span className="adm-taginput">
      {props.value.map((tag) => (
        <span key={tag} className="adm-chip">
          {tag}
          <button
            type="button"
            className="adm-chip-x"
            title={`移除 ${tag}`}
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

/* ── 分段标签 ─────────────────────────────────────────── */

export function Tabs<T extends string>(props: {
  value: T;
  options: Array<{ value: T; label: string; icon?: ReactNode; count?: number }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="adm-tabs" role="tablist">
      {props.options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          className="adm-tab"
          aria-selected={props.value === option.value}
          onClick={() => props.onChange(option.value)}
        >
          {option.icon}
          {option.label}
          {typeof option.count === 'number' ? (
            <span className="adm-tab-count">{option.count}</span>
          ) : null}
        </button>
      ))}
    </div>
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

/** 等宽大写小标签（与站点 .label-site 同一语言） */
export function MonoLabel(props: { children: ReactNode; style?: CSSProperties }) {
  return (
    <span className="label-site" style={props.style}>
      {props.children}
    </span>
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
  const [timer, setTimer] = useState<number | null>(null);

  const arm = () => {
    setArmed(true);
    if (timer !== null) window.clearTimeout(timer);
    const handle = window.setTimeout(() => setArmed(false), 3000);
    setTimer(handle);
  };

  return (
    <Button
      variant="danger"
      size={props.size}
      icon={props.icon ?? <Icon.Trash />}
      onClick={() => {
        if (armed) {
          if (timer !== null) window.clearTimeout(timer);
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
