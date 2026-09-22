// 状态枚举的展示与语义色。
//
// 服务端存的是语义值（published / draft / live / wip / archived），展示层在这里统一
// 翻译成中文；索引栏的状态点也由同一张表推出，避免「标签写已发布、点却显示空心」
// 这类不一致。
//
// 三档语义（对应 admin.css 的 .adm-ritem-d 三态）：
//   on   已启用（实心点）
//   off  未启用 / 已下线（空心点）
//   warn 需要注意（实心点 + 标题变色）

export const ENUM_LABELS: Record<string, string> = {
  published: '已发布',
  draft: '草稿',
  live: '在线',
  wip: '开发中',
  archived: '已归档',
};

export type RailTone = 'on' | 'off' | 'warn';

/** 状态点语义：未知值按「已启用」处理，避免新枚举悄悄变成空心点被误读为草稿 */
export function statusTone(value: string): RailTone {
  if (value === 'draft' || value === 'archived') return 'off';
  if (value === 'wip') return 'warn';
  return 'on';
}

/** 状态文字（带状态点）：用于详情页的元信息行 */
export function StatusText(props: { value: string }) {
  const tone = statusTone(props.value);
  const dotClass = ['adm-ritem-d', tone === 'off' ? 'adm-ritem-d--off' : ''].filter(Boolean).join(' ');
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        color: tone === 'warn' ? 'var(--brand)' : undefined,
      }}
    >
      <span className={dotClass} />
      {ENUM_LABELS[props.value] ?? props.value}
    </span>
  );
}
