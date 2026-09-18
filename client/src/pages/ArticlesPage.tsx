import { useEffect, useState } from 'react';
import ArticleRow from '@/components/ArticleRow';
import { MiniFooter } from '@/components/Footer';
import { ArticleListSkeleton, TagFilterSkeleton } from '@/components/Skeletons';
import { getArticles, getTagStats } from '@/services/blog-api';
import type { ArticleListItem } from '@/types/blog';

export default function ArticlesPage() {
  const [articles, setArticles] = useState<ArticleListItem[]>([]);
  const [tags, setTags] = useState<{ name: string; count: number }[]>([]);
  const [tagsLoading, setTagsLoading] = useState(true);
  const [activeTag, setActiveTag] = useState('');
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

        {/* 标签过滤：加载中显示胶囊骨架，避免数据到达后突然撑开 */}
        <div className="mt-8 flex flex-wrap gap-2" style={{ minHeight: 30 }}>
          {tagsLoading ? (
            <TagFilterSkeleton />
          ) : (
            <>
              <button onClick={() => setActiveTag('')} className="font-mono-site" style={pillStyle(activeTag === '')}>
                全部
              </button>
              {tags.map((t) => (
                <button
                  key={t.name}
                  onClick={() => setActiveTag(t.name === activeTag ? '' : t.name)}
                  className="font-mono-site"
                  style={pillStyle(activeTag === t.name)}
                >
                  {t.name} ({t.count})
                </button>
              ))}
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
