import Nav from '@/components/Nav';

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text-1)' }}>
      <Nav />
      <main>{children}</main>
      {/* 亮色模式纸纹噪点肌理（CSS 控制仅 light 下可见） */}
      <div className="grain-overlay" aria-hidden="true">
        <svg width="100%" height="100%">
          <filter id="grain">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter="url(#grain)" opacity="0.16" />
        </svg>
      </div>
    </div>
  );
}
