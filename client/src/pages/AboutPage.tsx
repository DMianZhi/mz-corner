import { MiniFooter } from '@/components/Footer';
import { useSiteConfig } from '@/components/SiteConfigContext';

const TIMELINE = [
  { year: '2026', text: '全栈开发 · 持续交付中' },
  { year: '2024', text: '开始独立项目实践' },
  { year: '2022', text: '踏入编程世界' },
];

export default function AboutPage() {
  const config = useSiteConfig();
  return (
    <div className="page-enter" style={{ paddingTop: 'calc(var(--nav-h) + 48px)' }}>
      <div className="mx-auto" style={{ maxWidth: 'var(--content-w)', padding: '0 var(--gutter)' }}>
        <div className="kicker-site"><span className="kicker-num">04</span>ABOUT</div>
        <h1 className="text-h1-site m-0 mt-4" style={{ color: 'var(--text-1)' }}>关于我</h1>

        {/* 个人信息 */}
        <div className="mt-12 grid gap-8 md:grid-cols-12">
          <div className="md:col-span-4">
            <div
              className="flex items-center justify-center font-mono-site"
              style={{
                width: 160, height: 160, borderRadius: '50%',
                background: 'var(--bg-card)', border: '1px solid var(--border-soft)',
                fontSize: 64,
              }}
            >
              👨‍💻
            </div>
          </div>
          <div className="md:col-span-8">
            <p style={{ fontSize: 18, lineHeight: 1.8, color: 'var(--text-2)' }}>
              {config.bio}
            </p>
            <div className="mt-8 flex flex-wrap gap-2">
              {config.skills.map((s) => (
                <span
                  key={s}
                  className="font-mono-site"
                  style={{
                    fontSize: 12, padding: '6px 12px', borderRadius: 999,
                    border: '1px solid var(--border-soft)', color: 'var(--text-2)',
                  }}
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* 经历时间线 */}
        <div className="mt-20">
          <h2 className="m-0" style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-1)' }}>经历</h2>
          <div className="mt-8 flex flex-col gap-0">
            {TIMELINE.map((t) => (
              <div
                key={t.year}
                className="grid items-baseline gap-4 md:grid-cols-12"
                style={{ borderTop: '1px solid var(--border-soft)', padding: '20px 0' }}
              >
                <span className="font-mono-site md:col-span-3" style={{ fontSize: 20, fontWeight: 700, color: 'var(--brand)' }}>
                  {t.year}
                </span>
                <span className="md:col-span-9" style={{ fontSize: 16, color: 'var(--text-2)' }}>{t.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 联系方式 */}
        <div className="mt-20">
          <h2 className="m-0" style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-1)' }}>联系</h2>
          <div className="mt-6 flex flex-wrap gap-6">
            {['GitHub', 'Twitter', 'lisi@example.com'].map((s) => (
              <a
                key={s}
                href={s.includes('@') ? `mailto:${s}` : '#/'}
                className="link-underline font-mono-site no-underline"
                style={{ fontSize: 14, color: 'var(--text-2)' }}
              >
                {s}
              </a>
            ))}
          </div>
        </div>
      </div>
      <MiniFooter />
    </div>
  );
}
