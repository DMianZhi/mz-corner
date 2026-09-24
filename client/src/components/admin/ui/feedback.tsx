// 管理后台 UI 基元 · 详情页零件与展示件。
//
// 约定（颜色/圆角全走 styles/admin.css 的 adm-* 类、不出现颜色字面量；图标一律内联 SVG；
// 单 props 参数 + 内联类型、不用 useMemo/useCallback）见 ./index.ts。
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from './form';
import { Icon } from './icon';

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
