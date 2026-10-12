import { useEffect, useState } from 'react';
import ArticleRow from '@/components/ArticleRow';
import { MiniFooter } from '@/components/Footer';
import { ArticleListSkeleton, TagFilterSkeleton } from '@/components/Skeletons';
import { getArticles, getTagStats } from '@/services/blog-api';
import type { ArticleListItem } from '@/types/blog';

// 长尾标签折叠阈值：出现 ≥2 次算热门；热门不足时至少保留 8 个
const HOT_MIN_COUNT = 2;
const HOT_MIN_SHOWN = 8;

export default function ArticlesPage() {
  const [articles, setArticles] = useState<ArticleListItem[]>([]);
  const [tags, setTags] = useState<{ name: string; count: number }[]>([]);
  const [tagsLoading, setTagsLoading] = useState(true);
  const [activeTag, setActiveTag] = useState('');
  const [showAllTags, setShowAllTags] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getTagStats().then((t) => {
      setTags(t);
      setTagsLoading(false);
    });
  }, []);

  useEffect(() => {
    setLoading(true);
    getArticles({ page: 1, pageSize: 50, tag: activeTag || undefined }).then((d) => {
      setArticles(d.items);
      setLoading(false);
    });
  }, [activeTag]);

  const pillStyle = (active: boolean): React.CSSProperties => ({
    fontSize: 12, padding: '5px 12px', borderRadius: 999, cursor: 'pointer',
    border: `1px solid ${active ? 'transparent' : 'var(--border-soft)'}`,
    background: active ? 'var(--brand)' : 'transparent',
    color: active ? 'var(--brand-ink)' : 'var(--text-2)',
  });
  // 折叠按钮：虚线边 + 更弱的字色，与「可筛选项」区分开
  const ghostPillStyle: React.CSSProperties = {
    ...pillStyle(false),
    borderStyle: 'dashed',
    color: 'var(--text-3)',
  };

  // 默认只平铺「热门标签」，长尾收起来。
  // 规则：出现 ≥2 次的算热门（计数就印在胶囊上，规则自解释）；
  // 若达不到 8 个（小站点全是 count=1），至少补足前 8 个，避免一上来只剩「全部」。
  const qualified = tags.filter((t) => t.count >= HOT_MIN_COUNT);
  const hotTags = qualified.length >= HOT_MIN_SHOWN ? qualified : tags.slice(0, HOT_MIN_SHOWN);
  const hotNames = new Set(hotTags.map((t) => t.name));
  const restTags = tags.filter((t) => !hotNames.has(t.name));
  // 收起状态下，当前选中的标签必须在场；否则选完一收起，筛选态就“失踪”了
  const visibleRest = showAllTags ? restTags : restTags.filter((t) => t.name === activeTag);

  const renderTag = (t: { name: string; count: number }) => (
    <button
      key={t.name}
      onClick={() => setActiveTag(t.name === activeTag ? '' : t.name)}
      className="font-mono-site"
      style={pillStyle(activeTag === t.name)}
    >
      {t.name} ({t.count})
    </button>
  );

  return (
    <div className="page-enter" style={{ paddingTop: 'calc(var(--nav-h) + 48px)' }}>
      <div className="mx-auto" style={{ maxWidth: 'var(--content-w)', padding: '0 var(--gutter)' }}>
        <div className="kicker-site"><span className="kicker-num">02</span>WRITING</div>
        <div className="mt-4 flex items-baseline gap-4">
          <h1 className="text-h1-site m-0" style={{ color: 'var(--text-1)' }}>文章</h1>
          <span className="font-mono-site" style={{ fontSize: 13, color: 'var(--text-3)' }}>
            {loading && articles.length === 0 ? '— POSTS' : `${articles.length} POSTS`}
          </span>
        </div>

        {/* 标签过滤：加载中显示胶囊骨架，避免数据到达后突然撑开。
            64 个标签全部平铺会占 8 行 296px，把文章列表本身挤出首屏，
            故默认只留热门标签（实测 11/64），长尾收进虚线胶囊按需展开。 */}
        <div className="mt-8 flex flex-wrap gap-2" style={{ minHeight: 30 }}>
          {tagsLoading ? (
            <TagFilterSkeleton />
          ) : (
            <>
              <button onClick={() => setActiveTag('')} className="font-mono-site" style={pillStyle(activeTag === '')}>
                全部
              </button>
              {hotTags.map(renderTag)}
              {visibleRest.map(renderTag)}
              {restTags.length > 0 && (
                <button
                  onClick={() => setShowAllTags((v) => !v)}
                  className="font-mono-site"
                  style={ghostPillStyle}
                  aria-expanded={showAllTags}
                  title={showAllTags ? '收起长尾标签' : `展开其余 ${restTags.length} 个标签`}
                >
                  {showAllTags ? '收起' : `+${restTags.length} 个标签`}
                </button>
              )}
            </>
          )}
        </div>

        <div className="mt-12" style={{ borderBottom: '1px solid var(--border-soft)' }}>
          {loading && articles.length === 0 ? (
            <ArticleListSkeleton rows={7} />
          ) : articles.length === 0 ? (
            <div className="py-16 text-center font-mono-site" style={{ fontSize: 13, color: 'var(--text-3)' }}>
              暂无文章
            </div>
          ) : (
            articles.map((a, i) => (
              <ArticleRow
                key={a.id}
                a={a}
                index={i}
                style={loading ? { opacity: 0.35, pointerEvents: 'none' } : undefined}
              />
            ))
          )}
        </div>
      </div>
      <MiniFooter />
    </div>
  );
}
