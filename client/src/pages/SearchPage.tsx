import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeftIcon, ArrowRightIcon, SearchIcon } from '@/components/icon';
import ArticleRow from '@/components/ArticleRow';
import { MiniFooter } from '@/components/Footer';
import { ArticleListSkeleton } from '@/components/Skeletons';
import { getArticles } from '@/services/blog-api';
import type { ArticleListItem, PaginatedData } from '@/types/blog';

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [articles, setArticles] = useState<PaginatedData<ArticleListItem>>({
    items: [],
    total: 0,
    page: 1,
    pageSize: 10,
    totalPages: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  const keyword = searchParams.get('q') || '';
  const currentPage = parseInt(searchParams.get('page') || '1');

  useEffect(() => {
    async function loadSearchResults() {
      if (!keyword) {
        setArticles({ items: [], total: 0, page: 1, pageSize: 10, totalPages: 0 });
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      const results = await getArticles({ keyword, page: currentPage });
      setArticles(results);
      setIsLoading(false);
    }
    loadSearchResults();
  }, [keyword, currentPage]);

  const handlePageChange = (page: number) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('page', page.toString());
    setSearchParams(newParams);
  };

  return (
    <div className="page-enter" style={{ paddingTop: 'calc(var(--nav-h) + 48px)' }}>
      <div className="mx-auto" style={{ maxWidth: 'var(--content-w)', padding: '0 var(--gutter)' }}>
        <div className="kicker-site">
          <span className="kicker-num">05</span>SEARCH
        </div>
        <div className="mt-4 flex items-baseline gap-4">
          <h1 className="text-h1-site m-0" style={{ color: 'var(--text-1)' }}>
            搜索
          </h1>
          <span className="font-mono-site" style={{ fontSize: 13, color: 'var(--text-3)' }}>
            {isLoading ? '— RESULTS' : `${articles.total} RESULTS`}
          </span>
        </div>

        {/* 关键词 */}
        <div
          className="font-mono-site mt-6"
          style={{ fontSize: 14, color: 'var(--brand)' }}
        >
          &quot;{keyword}&quot;
        </div>

        {/* 结果列表 */}
        <div className="mt-8" style={{ borderBottom: '1px solid var(--border-soft)' }}>
          {isLoading ? (
            <ArticleListSkeleton rows={5} />
          ) : articles.items.length === 0 ? (
            <div className="py-16 text-center font-mono-site" style={{ fontSize: 13, color: 'var(--text-3)' }}>
              <div className="flex justify-center" style={{ color: 'var(--text-3)' }}>
                <SearchIcon size={28} />
              </div>
              <p className="mt-4 mb-1">未找到相关文章</p>
              <p>
                换个关键词试试，或浏览
                <Link to="/articles" className="link-underline ml-1" style={{ color: 'var(--brand)' }}>
                  全部文章
                </Link>
              </p>
            </div>
          ) : (
            articles.items.map((a, i) => <ArticleRow key={a.id} a={a} index={i} />)
          )}
        </div>

        {/* 分页 */}
        {articles.totalPages > 1 && (
          <div className="flex items-center justify-center gap-6 py-12 font-mono-site" style={{ fontSize: 13, color: 'var(--text-2)' }}>
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage <= 1}
              className="link-underline no-underline flex items-center gap-1 disabled:opacity-40"
              style={{ background: 'none', border: 'none', cursor: currentPage <= 1 ? 'default' : 'pointer' }}
            >
              <ArrowLeftIcon size={13} /> 上一页
            </button>
            <span style={{ color: 'var(--text-3)' }}>
              {currentPage} / {articles.totalPages}
            </span>
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage >= articles.totalPages}
              className="link-underline no-underline flex items-center gap-1 disabled:opacity-40"
              style={{ background: 'none', border: 'none', cursor: currentPage >= articles.totalPages ? 'default' : 'pointer' }}
            >
              下一页 <ArrowRightIcon size={13} />
            </button>
          </div>
        )}
      </div>
      <MiniFooter />
    </div>
  );
}
