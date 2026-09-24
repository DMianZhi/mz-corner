// 面板底部操作条（dock）。项目/评论两处逐字节相同的 JSX，抽成一个组件。
//
// 注意：dock 内**不要**再放别处体系的按钮 —— 这里统一由 `.adm-dock` 的
// `--dock-btn-r` / `--dock-btn-h` 控制圆角与高度，混用会导致圆角不统一（审计已踩过）。
import { Button, DangerConfirm, Icon, LinkButton } from './ui';

export function SaveDock(props: {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  /** 有则渲染「删除」（两步确认） */
  onDelete?: () => void;
  /** 有则渲染「放弃」（丢弃草稿） */
  onDiscard?: () => void;
}) {
  return (
    <div className="adm-dock">
      <span
        className="label-site"
        style={{ padding: '0 8px', minWidth: 62, textAlign: 'center' }}
      >
        {props.dirty ? '有改动' : '已同步'}
      </span>
      <Button
        variant="primary"
        size="sm"
        icon={<Icon.Save size={14} />}
        loading={props.saving}
        disabled={!props.dirty}
        onClick={props.onSave}
      >
        保存
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
