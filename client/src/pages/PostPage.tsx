import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { MiniFooter } from '@/components/Footer';
import { Markdown } from '@/components/Markdown';
import { PostSkeleton } from '@/components/Skeletons';
import { ArrowLeftIcon, ArrowRightIcon } from '@/components/icon';
import { getArticle, getArticles, getComments, addComment, incrementViewCount } from '@/services/blog-api';
import type { Article, ArticleListItem, Comment } from '@/types/blog';

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

/** 单侧导航卡：左卡箭头在前、右卡箭头在后，标签与文字各自对齐外侧 */
function NavCard({ dir, a }: { dir: 'prev' | 'next'; a: ArticleListItem }) {
  const isPrev = dir === 'prev';
  const date = a.publishDate ? a.publishDate.slice(0, 10).replace(/\//g, '-') : '';
  return (
    <a
      href={`#/post/${a.id}`}
      className="flex flex-col gap-2 no-underline"
      style={{
        padding: '18px 20px',
        borderRadius: 16,
        border: '1px solid var(--border-soft)',
        background: 'var(--bg-card)',
        textAlign: isPrev ? 'left' : 'right',
        transition: 'border-color 250ms cubic-bezier(0.16,1,0.3,1), background 250ms cubic-bezier(0.16,1,0.3,1)',
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.borderColor = 'var(--brand)';
        el.style.background = 'var(--bg-hover)';
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.borderColor = 'var(--border-soft)';
        el.style.background = 'var(--bg-card)';
      }}
    >
      <span
        className="font-mono-site"
        style={{
          fontSize: 12, color: 'var(--text-3)',
          display: 'flex', alignItems: 'center', gap: 6,
          justifyContent: isPrev ? 'flex-start' : 'flex-end',
        }}
      >
        {isPrev && <ArrowLeftIcon size={13} />}
        {isPrev ? '上一篇' : '下一篇'}
        {!isPrev && <ArrowRightIcon size={13} />}
      </span>
      {/* 标题最多两行：相邻篇标题长度差异大，不夹住会把卡片撑得高低不齐 */}
      <span
        style={{
          fontSize: 16, fontWeight: 600, color: 'var(--text-1)', lineHeight: 1.45,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}
      >
        {a.title}
      </span>
      <span className="font-mono-site" style={{ fontSize: 12, color: 'var(--text-3)' }}>
        {date}{a.category ? ` · ${a.category}` : ''}
      </span>
    </a>
  );
}

/**
 * 上一篇 / 下一篇
 *
 * 顺序与 /articles 列表完全一致（publishDate 倒序）：
 * 「上一篇」= 列表中靠上的一条（更新），「下一篇」= 靠下的一条（更早）。
 * 卡片上带日期，方向对读者自明。
 */
function PostNav({ id }: { id: string }) {
  const [list, setList] = useState<ArticleListItem[]>([]);

  useEffect(() => {
    // 与 /articles 同源同序，不额外加接口。后端当前返回全部已发布文章（草稿在仓库层已滤掉，
    // 也不受 pageSize 影响），给足 pageSize 只是防御：将来后端真做分页也不会漏掉相邻篇。
    getArticles({ page: 1, pageSize: 200 }).then((d) => setList(d.items));
  }, []);

  // 列表只拉一次，翻篇时靠 id 重新定位，相邻篇是瞬时出现的（不再发请求）
  const i = list.findIndex((a) => a.id === id);
  const prev = i > 0 ? list[i - 1] : null;
  const next = i >= 0 && i < list.length - 1 ? list[i + 1] : null;

  if (!prev && !next) return null;

  return (
    <nav
      data-post-nav=""
      className="mt-16 grid gap-4 sm:grid-cols-2"
      style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 32 }}
    >
      {prev ? <NavCard dir="prev" a={prev} /> : <span className="hidden sm:block" />}
      {next ? <NavCard dir="next" a={next} /> : <span className="hidden sm:block" />}
    </nav>
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
    // 翻篇时先回到骨架态：否则会先看到「旧文章 + 新滚动位置」再跳变
    setLoading(true);
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
          maxWidth: 'var(--content-w)',
          padding: 'calc(var(--nav-h) + 48px) var(--gutter) 96px',
        }}
      >
        <a href="#/articles" className="link-underline font-mono-site no-underline" style={{ fontSize: 13, color: 'var(--text-3)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <ArrowLeftIcon size={13} />
          文章列表
        </a>
        {/* textWrap: balance —— 标题在宽栏下容易把末字甩到第二行（如「…好体 / 验」），
            交给浏览器均分两行，观感稳定 */}
        <h1 className="text-h2-site" style={{ margin: '24px 0 16px', color: 'var(--text-1)', textWrap: 'balance' }}>
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

        {/* 上一篇 / 下一篇：正文读完、评论区之前，连续阅读的主入口 */}
        <PostNav id={article.id} />

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
