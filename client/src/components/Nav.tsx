import { useEffect, useState } from 'react';
import { MoonIcon, SunIcon } from '@/components/icon';
import { useSiteConfig } from '@/components/SiteConfigContext';

const links = [
  { to: '/', label: '项目' },
  { to: '/articles', label: '文章' },
  { to: '/archive', label: '归档' },
  { to: '/about', label: '关于' },
];

export default function Nav() {
  const config = useSiteConfig();
  const [scrolled, setScrolled] = useState(false);
  const [light, setLight] = useState(() => {
    if (typeof window === 'undefined') return false;
    // 「暗室色标」默认深色画廊，用户可手动切浅色
    return localStorage.getItem('theme') === 'light';
  });
  const [hash, setHash] = useState(window.location.hash);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    const onHash = () => setHash(window.location.hash);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('hashchange', onHash);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('hashchange', onHash);
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('light', light);
    localStorage.setItem('theme', light ? 'light' : 'dark');
  }, [light]);

  const isActive = (to: string) => {
    const path = hash.replace(/^#/, '') || '/';
    if (to === '/') return path === '/';
    return path.startsWith(to);
  };

  return (
    <nav
      className="fixed top-0 left-0 z-50 w-full transition-all duration-300"
      style={{
        height: 'var(--nav-h)',
        background: scrolled ? 'var(--bg-nav-scrolled)' : 'transparent',
        backdropFilter: scrolled ? 'blur(12px)' : 'none',
        WebkitBackdropFilter: scrolled ? 'blur(12px)' : 'none',
        borderBottom: scrolled ? '1px solid var(--border-soft)' : '1px solid transparent',
      }}
    >
      <div
        className="mx-auto flex h-full items-center justify-between"
        style={{ maxWidth: 'var(--container)', padding: '0 var(--gutter)' }}
      >
        <a href="#/" className="flex items-center gap-2.5 no-underline">
          <span
            className="inline-block h-4 w-4 rounded"
            style={{ background: 'var(--brand)', borderRadius: 4 }}
          />
          <span className="text-base font-bold" style={{ color: 'var(--text-1)' }}>{config.name}</span>
          <span className="hidden sm:inline font-mono-site text-[11px]" style={{ color: 'var(--text-3)' }}>
            {config.nameEn}
          </span>
        </a>

        <div className="flex items-center gap-4 sm:gap-8">
          {links.map((l) => (
            <a
              key={l.to}
              href={`#${l.to}`}
              className="font-mono-site no-underline transition-colors"
              style={{
                fontSize: 13,
                letterSpacing: '0.05em',
                color: isActive(l.to) ? 'var(--text-1)' : 'var(--text-3)',
                textDecoration: isActive(l.to) ? 'underline' : 'none',
                textDecorationColor: 'var(--brand)',
                textUnderlineOffset: 6,
                textDecorationThickness: 2,
              }}
              onMouseEnter={(e) => { (e.target as HTMLElement).style.color = 'var(--text-1)'; }}
              onMouseLeave={(e) => {
                if (!isActive(l.to)) (e.target as HTMLElement).style.color = 'var(--text-3)';
              }}
            >
              {l.label}
            </a>
          ))}
          <button
            onClick={() => setLight(!light)}
            aria-label="切换主题"
            className="flex h-8 w-8 items-center justify-center rounded-full border transition-colors"
            style={{
              borderColor: 'var(--border-soft)',
              color: 'var(--text-2)',
              background: 'transparent',
              cursor: 'pointer',
            }}
          >
            {light ? <MoonIcon size={14} /> : <SunIcon size={14} />}
          </button>
        </div>
      </div>
    </nav>
  );
}
