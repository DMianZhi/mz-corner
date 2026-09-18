import { useEffect, useState } from 'react';
import { MiniFooter } from '@/components/Footer';
import { ArchiveSkeleton } from '@/components/Skeletons';
import { getArchiveData } from '@/services/blog-api';
import type { ArchiveData } from '@/types/blog';

export default function ArchivePage() {
  const [data, setData] = useState<ArchiveData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getArchiveData().then((d) => {
      setData(d);
      setLoading(false);
    });
  }, []);

  return (
    <div className="page-enter" style={{ paddingTop: 'calc(var(--nav-h) + 48px)' }}>
      <div className="mx-auto" style={{ maxWidth: 'var(--content-w)', padding: '0 var(--gutter)' }}>
        <div className="kicker-site"><span className="kicker-num">03</span>ARCHIVE</div>
        <h1 className="text-h1-site m-0 mt-4" style={{ color: 'var(--text-1)' }}>归档</h1>

        {loading ? (
          <ArchiveSkeleton years={2} />
        ) : (
          <div className="mt-12 flex flex-col gap-12">
            {data.map((year) => (
              <section key={year.year}>
                <h2
                  className="font-mono-site m-0"
                  style={{ fontSize: 'clamp(32px,5vw,48px)', fontWeight: 700, color: 'var(--brand)' }}
                >
                  {year.year}
                </h2>
                {year.months.map((m) => (
                  <div key={m.month} className="mt-6">
                    <div className="font-mono-site" style={{ fontSize: 12, letterSpacing: '0.14em', color: 'var(--text-3)' }}>
                      {String(m.month).padStart(2, '0')}月
                    </div>
                    <div className="mt-3" style={{ borderTop: '1px solid var(--border-soft)' }}>
                      {m.articles.map((a) => (
                        <a
                          key={a.id}
                          href={`#/post/${a.id}`}
                          className="flex items-baseline justify-between gap-4 no-underline transition-colors"
                          style={{ padding: '14px 16px', margin: '0 -16px', borderBottom: '1px solid var(--border-soft)' }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                        >
                          <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-1)' }}>{a.title}</span>
                          <span className="font-mono-site shrink-0" style={{ fontSize: 12, color: 'var(--text-3)' }}>
                            {a.publishDate?.slice(0, 10).replace(/\//g, '-')}
                          </span>
                        </a>
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            ))}
          </div>
        )}
      </div>
      <MiniFooter />
    </div>
  );
}
