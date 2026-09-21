/**
 * 骨架屏：同构占位方案。
 * 与真实组件使用完全相同的布局结构/字号/行高/字重，
 * 占位文本渲染为透明微光（.skeleton-text），
 * 行盒高度由真实字体度量撑开 → 数据加载后零布局跳变。
 */
import type { CSSProperties } from 'react';
import { ArticleRowLayout } from '@/components/ArticleRow';

/** 骨架条元：纯色微光横条（仅用于高度不敏感的装饰区块） */
function Bar({ w, h = 12, style }: { w: string | number; h?: number; style?: CSSProperties }) {
  return (
    <span
      className="skeleton-bar"
      style={{ width: w, height: h, display: 'block', borderRadius: 6, ...style }}
    />
  );
}

/** 同构文本占位：透明微光文本，撑出与真实内容一致的行盒 */
function TextPh({ text, style }: { text: string; style?: CSSProperties }) {
  return (
    <span className="skeleton-text" aria-hidden style={style}>
      {text}
    </span>
  );
}

/** 骨架占位：无语义字符序列（等宽字体下 █ 宽度 = 数字宽度，几何与真实完全一致） */
const PH_DATES = '██████-██-██';
const PH_TITLE_BARS = [
  '██████████████████████',
  '████████████████████████',
  '██████████████████████████',
  '██████████████████',
  '████████████████████████████',
  '████████████████████████',
  '██████████',
];

/**
 * 文章列表骨架：直接复用 ArticleRowLayout（48px 1fr auto 24px / gap 16 /
 * padding 22px 16px），占位文本微光渲染 → 像素级同构。
 */
export function ArticleListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div aria-hidden style={{ borderBottom: '1px solid var(--border-soft)' }}>
      {Array.from({ length: rows }, (_, i) => (
        <ArticleRowLayout key={i} href={undefined}>
          <TextPh text="██" />
          <TextPh text={PH_TITLE_BARS[i % PH_TITLE_BARS.length]} />
          <TextPh text={PH_DATES} />
          <TextPh text="███" />
        </ArticleRowLayout>
      ))}
    </div>
  );
}

/**
 * 文章详情骨架：与 PostPage 的排版层级一致。
 * 标题/meta/段落用同构占位文本，装饰区块（表单/按钮）用 Bar。
 */
export function PostSkeleton() {
  return (
    <div aria-hidden className="mx-auto" style={{ maxWidth: 'var(--content-w)', padding: 'calc(var(--nav-h) + 48px) var(--gutter) 96px' }}>
      <TextPh text="██████████" style={{ fontSize: 13 }} />
      <div style={{ marginTop: 28 }}>
        <TextPh text="██████████████████████████" style={{ fontSize: 'clamp(28px,4vw,36px)', fontWeight: 700 }} />
      </div>
      <div className="flex flex-wrap gap-4" style={{ marginTop: 18 }}>
        <TextPh text={PH_DATES} style={{ fontSize: 12 }} />
        <TextPh text="████" style={{ fontSize: 12 }} />
        <TextPh text="████████" style={{ fontSize: 12 }} />
      </div>
      {[16, 15, 17, 14].map((chars, i) => (
        <div key={i} style={{ marginTop: i === 0 ? 44 : 14 }}>
          <TextPh text={'█'.repeat(chars)} style={{ fontSize: 16 }} />
        </div>
      ))}
      <div style={{ marginTop: 72 }}>
        <span className="font-mono-site" style={{ fontSize: 22, fontWeight: 700, display: 'block' }}>
          <TextPh text="█████ (█)" />
        </span>
        <Bar w="100%" h={96} style={{ marginTop: 28, borderRadius: 12 }} />
      </div>
    </div>
  );
}

/** 标签筛选骨架：胶囊与真实尺寸一致（fontSize 12 / padding 5px 12px / border）。
 *  labels 由调用方传真实标签名 → 占位用等宽 █ 串，宽度=实际字符数 → 排布不跳变 */
export function TagFilterSkeleton({
  labels = ['██', '████████████', '████████', '████████████', '█████', '████', '████', '█████', '███', '██████'],
}: { labels?: string[] }) {
  return (
    <div aria-hidden className="flex flex-wrap gap-2">
      {labels.map((lb, i) => (
        <span key={i}
          className="font-mono-site"
          style={{
            fontSize: 12, padding: '5px 12px', borderRadius: 999,
            border: '1px solid var(--border-soft)', display: 'inline-block',
          }}
        >
          <TextPh text={lb} />
        </span>
      ))}
    </div>
  );
}

/** 归档年组骨架：年份/月份/文章行同构占位，与 ArchivePage 布局一致 */
export function ArchiveSkeleton({ years = 2 }: { years?: number }) {
  return (
    <div aria-hidden className="mt-12 flex flex-col gap-12">
      {Array.from({ length: years }, (_, y) => (
        <section key={y}>
          <span style={{ fontSize: 'clamp(32px,5vw,48px)', fontWeight: 700, display: 'block' }}>
            <TextPh text="████" />
          </span>
          {Array.from({ length: y === 0 ? 2 : 1 }, (_, m) => (
            <div key={m} className="mt-6">
              <span className="font-mono-site" style={{ fontSize: 12, letterSpacing: '0.14em', display: 'block' }}>
                <TextPh text="███████" style={{ letterSpacing: '0.14em' }} />
              </span>
              <div className="mt-3" style={{ borderTop: '1px solid var(--border-soft)' }}>
                {Array.from({ length: 3 - ((m + y) % 2) }, (_, a) => (
                  <div
                    key={a}
                    className="flex items-baseline justify-between gap-4"
                    style={{ padding: '14px 16px', margin: '0 -16px', borderBottom: '1px solid var(--border-soft)' }}
                  >
                    <span style={{ fontSize: 16, fontWeight: 500 }}>
                      <TextPh text={PH_TITLE_BARS[(a + m * 2) % 5].slice(0, 14 - ((a * 3) % 8))} />
                    </span>
                    <span className="font-mono-site shrink-0" style={{ fontSize: 12 }}>
                      <TextPh text={PH_DATES} />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

/** 项目长廊骨架：标题区同构 + 卡片位占位（高度与真实卡片一致） */
export function ProjectGallerySkeleton() {
  return (
    <div aria-hidden style={{ padding: 'clamp(96px,14vh,160px) 0' }}>
      <div className="flex items-end justify-between" style={{ padding: '0 var(--gutter)', marginBottom: 48 }}>
        <span style={{ fontSize: 'clamp(28px,4vw,44px)', fontWeight: 700, display: 'block' }}>
          <TextPh text="██████" />
        </span>
        <span className="font-mono-site" style={{ fontSize: 13 }}>
          <TextPh text="██ / ██" />
        </span>
      </div>
      <div className="flex gap-6" style={{ padding: '0 var(--gutter)', overflow: 'hidden' }}>
        {[38, 30, 34].map((w, i) => (
          <div
            key={i}
            className="shrink-0"
            style={{
              width: `min(${w}vw, ${w * 12}px)`,
              height: 420,
              borderRadius: 20,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <span className="skeleton-bar" style={{ position: 'absolute', inset: 0, borderRadius: 20 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
