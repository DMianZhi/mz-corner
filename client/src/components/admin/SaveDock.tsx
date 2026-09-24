// 面板底部操作条（dock）。项目/评论两处逐字节相同的 JSX，抽成一个组件。
//
// 站点设置是「批量保存」，形状与逐条保存不同（状态文案不固定宽、保存按钮在最后、
// 中间多一个「放弃改动」），所以这里留了 status/saveLabel/disabled/before 四个可选
// 覆盖项 —— 全部有默认值，项目/评论的调用点输出不变。
//
// 注意：dock 内**不要**再放别处体系的按钮 —— 这里统一由 `.adm-dock` 的
// `--dock-btn-r` / `--dock-btn-h` 控制圆角与高度，混用会导致圆角不统一（审计已踩过）。
import type { ReactNode } from 'react';
import { Button, DangerConfirm, Icon, LinkButton } from './ui';

export function SaveDock(props: {
  saving: boolean;
  onSave: () => void;
  /** 逐条保存的改动态；批量保存场景可改用 disabled 自行判定 */
  dirty?: boolean;
  /** 有则渲染「删除」（两步确认） */
  onDelete?: () => void;
  /** 有则渲染「放弃」（丢弃草稿） */
  onDiscard?: () => void;
  /** 覆盖左侧状态文案（默认按 dirty 显示「有改动 / 已同步」） */
  status?: string;
  /** 状态文案是否固定宽度居中：项目/评论是，站点设置是（默认 true） */
  statusFixed?: boolean;
  /** 覆盖保存按钮文案（默认「保存」） */
  saveLabel?: string;
  /** 覆盖保存按钮的禁用条件（默认 !dirty） */
  disabled?: boolean;
  /** 保存按钮之前的插槽（站点设置用它放「弹性占位 + 放弃改动」） */
  before?: ReactNode;
}) {
  const disabled = props.disabled ?? !props.dirty;
  const status = props.status ?? (props.dirty ? '有改动' : '已同步');
  const statusFixed = props.statusFixed ?? true;

  return (
    <div className="adm-dock">
      <span
        className="label-site"
        style={
          statusFixed ? { padding: '0 8px', minWidth: 62, textAlign: 'center' } : undefined
        }
      >
        {status}
      </span>
      {props.before}
      <Button
        variant="primary"
        size="sm"
        icon={<Icon.Save size={14} />}
        loading={props.saving}
        disabled={disabled}
        onClick={props.onSave}
      >
        {props.saveLabel ?? '保存'}
      </Button>
      {props.onDiscard ? (
        <>
          <span className="adm-dock-sep" />
          <LinkButton disabled={!props.dirty} onClick={props.onDiscard}>
            放弃
          </LinkButton>
        </>
      ) : null}
      {props.onDelete ? (
        <>
          <span className="adm-dock-sep" />
          <DangerConfirm size="sm" label="删除" confirmLabel="确认删除" onConfirm={props.onDelete} />
        </>
      ) : null}
    </div>
  );
}
