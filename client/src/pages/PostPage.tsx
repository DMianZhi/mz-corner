import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { MiniFooter } from '@/components/Footer';
import { Markdown } from '@/components/Markdown';
import { PostSkeleton } from '@/components/Skeletons';
import { ArrowLeftIcon } from '@/components/icon';
import { getArticle, getComments, addComment, incrementViewCount } from '@/services/blog-api';
import type { Article, Comment } from '@/types/blog';

function ReadingProgress() {
  const [p, setP] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement;
      const total = h.scrollHeight - h.clientHeight;
      setP(total > 0 ? Math.min(1, h.scrollTop / total) : 0);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <div
      className="fixed left-0 top-0 z-[60] h-0.5"
      style={{
        background: 'var(--brand)',
        width: `${p * 100}%`,
        transition: 'width 80ms linear',
      }}
    />
  );
}

export default function PostPage() {
  const { id } = useParams<{ id: string }>();
  const [article, setArticle] = useState<Article | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ author: '', email: '', content: '' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([getArticle(id), getComments(id)]).then(([a, c]) => {
      setArticle(a);
      setComments(c);
      setLoading(false);
      if (a) incrementViewCount(id, a.viewCount);
    });
  }, [id]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !form.author.trim() || !form.content.trim()) return;
    setSubmitting(true);
    const c = await addComment({ articleId: id, ...form });
    if (c) {
      setComments((prev) => [c, ...prev]);
      setForm({ author: '', email: '', content: '' });
    }
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className="page-enter">
        <PostSkeleton />
      </div>
    );
  }
  if (!article) {
    return (
      <div className="flex flex-col items-center justify-center gap-4" style={{ minHeight: '100vh' }}>
        <span style={{ color: 'var(--text-2)' }}>文章不存在</span>
        <a href="#/articles" className="link-underline font-mono-site" style={{ fontSize: 13, color: 'var(--text-1)', display: 'inline-flex', alignItems: 'center', gap: 6 }}><ArrowLeftIcon size={13} /> 返回文章列表</a>
      </div>
    );
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'var(--bg-card)',
    border: '1px solid var(--border-soft)',
    borderRadius: 12,
    padding: '10px 14px',
    color: 'var(--text-1)',
    fontSize: 14,
    outline: 'none',
  };

  return (
    <div className="page-enter">
      <ReadingProgress />
      <article
        className="mx-auto"
        style={{
          maxWidth: 'var(--read-w)',
          padding: 'calc(var(--nav-h) + 48px) var(--gutter) 96px',
        }}
      >
        <a href="#/articles" className="link-underline font-mono-site no-underline" style={{ fontSize: 13, color: 'var(--text-3)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <ArrowLeftIcon size={13} />
          文章列表
        </a>
        <h1 className="text-h2-site" style={{ margin: '24px 0 16px', color: 'var(--text-1)' }}>
          {article.title}
        </h1>
        <div className="font-mono-site flex flex-wrap gap-4" style={{ fontSize: 12, color: 'var(--text-3)' }}>
          <span>{article.publishDate?.slice(0, 10).replace(/\//g, '-')}</span>
          <span>{article.category}</span>
          <span>{article.viewCount + 1} 次阅读</span>
          {article.tags.map((t) => <span key={t}>#{t}</span>)}
        </div>

        <div className="mt-12" style={{ fontSize: 16, lineHeight: 1.8, color: 'var(--text-1)' }}>
          <Markdown source={article.content} />
        </div>

        {/* 评论区 */}
        <section className="mt-24">
          <h2 className="m-0" style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-1)' }}>
            评论 <span className="font-mono-site" style={{ fontSize: 13, color: 'var(--text-3)' }}>{comments.length}</span>
          </h2>

          <form onSubmit={submit} className="mt-8 flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                style={inputStyle}
                placeholder="昵称 *"
                value={form.author}
                onChange={(e) => setForm({ ...form, author: e.target.value })}
              />
              <input
                style={inputStyle}
                placeholder="邮箱（可选）"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <textarea
              style={{ ...inputStyle, minHeight: 96, resize: 'vertical' }}
              placeholder="写下你的想法… *"
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
            />
            <button
              type="submit"
              disabled={submitting}
              className="font-mono-site self-start transition-transform"
              style={{
                height: 44, padding: '0 24px', borderRadius: 999, border: 'none',
                background: 'var(--brand)', color: 'var(--brand-ink)',
                fontSize: 14, fontWeight: 600, cursor: submitting ? 'wait' : 'pointer',
                opacity: submitting ? 0.6 : 1,
              }}
            >
              {submitting ? '提交中…' : '发表评论'}
            </button>
          </form>

          <div className="mt-12 flex flex-col gap-6">
            {comments.map((c) => (
              <div
                key={c.id}
                style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 20 }}
              >
                <div className="flex items-baseline justify-between">
                  <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)' }}>{c.author}</span>
                  <span className="font-mono-site" style={{ fontSize: 12, color: 'var(--text-3)' }}>
                    {c.createTime}
                  </span>
                </div>
                <p className="mt-2" style={{ fontSize: 15, lineHeight: 1.7, color: 'var(--text-2)' }}>
                  {c.content}
                </p>
              </div>
            ))}
          </div>
        </section>
      </article>
      <MiniFooter />
    </div>
  );
}
