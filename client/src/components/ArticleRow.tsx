import type { ArticleListItem } from '@/types/blog';
import { ArrowRightIcon } from '@/components/icon';

// 行布局层：真实数据与骨架占位共用，保证骨架与真实行像素级同构。
// children[0]=序号 children[1]=标题 children[2]=日期 children[3]=箭头
export function ArticleRowLayout(
  { href, onClick, animate, children }: {
    href?: string; onClick?: () => void; animate?: boolean;
    children: [React.ReactNode, React.ReactNode, React.ReactNode, React.ReactNode];
  }
) {
  return (
    <a
      href={href ?? '#/'}
      onClick={onClick}
      className="group grid items-baseline no-underline transition-colors"
      style={{
        gridTemplateColumns: '48px 1fr auto 24px',
        gap: 16,
        padding: '22px 16px',
        margin: '0 -16px',
        borderTop: '1px solid var(--border-soft)',
        transitionDuration: animate ? '250ms' : '0ms',
        transitionTimingFunction: 'cubic-bezier(0.16,1,0.3,1)',
        pointerEvents: href ? undefined : 'none',
      }}
      onMouseEnter={(e) => { if (animate) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
    >
      <span className="font-mono-site" style={{ fontSize: 13, color: 'var(--text-3)' }}>
        {children[0]}
      </span>
      <span
        className="transition-transform"
        style={{
          fontSize: 20, fontWeight: 600, color: 'var(--text-1)',
          transitionDuration: '250ms', transitionTimingFunction: 'cubic-bezier(0.16,1,0.3,1)',
        }}
        onMouseEnter={(e) => { if (animate) (e.currentTarget as HTMLElement).style.transform = 'translateX(8px)'; }}
        onMouseLeave={(e) => { if (animate) (e.currentTarget as HTMLElement).style.transform = 'translateX(0)'; }}
      >
        {children[1]}
      </span>
      <span className="font-mono-site hidden sm:inline" style={{ fontSize: 12, color: 'var(--text-3)' }}>
        {children[2]}
      </span>
      <span
        className="transition-all group-hover:translate-x-1.5"
        style={{ fontSize: 16, color: 'var(--text-3)' }}
      >
        {children[3]}
      </span>
    </a>
  );
}

/** 文章行：首页入口与 /articles 共用 */
export default function ArticleRow({ a, index, style }: { a: ArticleListItem; index: number; style?: React.CSSProperties }) {
  const date = a.publishDate ? a.publishDate.slice(0, 10).replace(/\//g, '-') : '';
  return (
    <div style={style}>
      <ArticleRowLayout href={`#/post/${a.id}`}>
        {String(index + 1).padStart(2, '0')}
        {a.title}
        {date}
        <span style={{ fontSize: 16, display: 'inline-flex' }}><ArrowRightIcon size={16} /></span>
      </ArticleRowLayout>
    </div>
  );
}
