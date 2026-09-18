import { useEffect, useState } from 'react';
import Hero from '@/components/Hero';
import ProjectGallery from '@/components/ProjectGallery';
import ArticleRow from '@/components/ArticleRow';
import Footer from '@/components/Footer';
import { ProjectGallerySkeleton } from '@/components/Skeletons';
import { ArticleListSkeleton } from '@/components/Skeletons';
import { ArrowRightIcon } from '@/components/icon';
import { getProjects, getArticles } from '@/services/blog-api';
import type { Project, ArticleListItem } from '@/types/blog';

export default function HomePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [articles, setArticles] = useState<ArticleListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getProjects(),
      getArticles({ page: 1, pageSize: 3 }),
    ]).then(([p, a]) => {
      setProjects(p);
      setArticles(a.items);
      setLoading(false);
    });
  }, []);

  return (
    <div className="page-enter">
      <Hero />

      {loading ? (
        <div aria-hidden style={{ minHeight: '40vh', display: 'flex', alignItems: 'center' }}>
          <ProjectGallerySkeleton />
        </div>
      ) : (
        <ProjectGallery projects={projects} />
      )}

      {/* 文章入口 */}
      <section style={{ padding: 'calc(var(--nav-h) + 48px) var(--gutter) 0' }}>
        <div className="flex items-end justify-between" style={{ marginBottom: 48 }}>
          <div>
            <div className="kicker-site"><span className="kicker-num">02</span>WRITING</div>
            <h2 className="text-h1-site m-0 mt-4" style={{ color: 'var(--text-1)' }}>文章</h2>
          </div>
          <a
            href="#/articles"
            className="link-underline font-mono-site hidden sm:inline-block no-underline"
            style={{ fontSize: 13, letterSpacing: '0.1em', color: 'var(--text-2)', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            查看全部
            <ArrowRightIcon size={13} />
          </a>
        </div>
        <div style={{ borderBottom: '1px solid var(--border-soft)' }}>
          {loading ? <ArticleListSkeleton rows={3} /> : articles.map((a, i) => <ArticleRow key={a.id} a={a} index={i} />)}
        </div>
      </section>

      <Footer />
    </div>
  );
}
