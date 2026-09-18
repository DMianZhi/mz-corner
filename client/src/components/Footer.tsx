import { useEffect, useRef } from 'react';
import { useSiteConfig } from '@/components/SiteConfigContext';

/** 磁吸邮箱（仅首页）*/
function MagneticMail() {
  const mailRef = useRef<HTMLAnchorElement>(null);
  const base = useRef<{ left: number; top: number; w: number; h: number } | null>(null);

  // 统一指针状态机：一份距离数据同时驱动磁吸位移与下划线渐显，
  // 判定始终基于「未位移的基准 rect」，避免元素追光标引起的 hover 抖动闪烁
  useEffect(() => {
    const btn = mailRef.current;
    if (!btn) return;
    const fine = window.matchMedia('(pointer: fine)').matches;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!fine || reduced) return;

    let raf = 0;
    const RADIUS = 64;
    // 速度衰减：快速甩动时降低磁吸系数，接近真实磁铁的阻尼感
    let lastX = 0, lastVX = 0;

    // 滚动/缩放会改变链接的视口位置，基准 rect 失效，置空待归位后重采
    const invalidate = () => { base.current = null; };
    window.addEventListener('scroll', invalidate, { passive: true });
    window.addEventListener('resize', invalidate);

    const onMove = (e: MouseEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        // 基准 rect：transform 不参与布局，getBoundingClientRect 却包含位移，
        // 因此仅当元素处于归位态（translation≈0）时采样一次并缓存
        const t = getComputedStyle(btn).transform;
        const displaced = t !== 'none' && !/^matrix\(1, 0, 0, 1, 0, 0\)$/.test(t);
        if (!displaced) {
          const r = btn.getBoundingClientRect();
          base.current = { left: r.left, top: r.top, w: r.width, h: r.height };
        }
        const b = base.current;
        if (!b) return;
        const cx = b.left + b.w / 2;
        const cy = b.top + b.h / 2;
        const dx = e.clientX - cx;
        const dy = e.clientY - cy;
        const dist = Math.hypot(dx, dy);

        // 速度衰减系数（px/frame 归一，>40px 视为甩动）
        const vx = Math.abs(e.clientX - lastX);
        lastVX = lastVX * 0.6 + vx * 0.4;
        lastX = e.clientX;
        const damp = Math.max(0.45, 1 - lastVX / 60);

        // 进入判定环内：磁吸追光 + 下划线随接近程度渐显（同源数据）
        if (dist < RADIUS + b.w / 2) {
          const mag = Math.min(1, 1 - dist / (RADIUS + b.w / 2));
          // 下划线透明度由 --mag 驱动，每帧跟随距离更新，无需 transition
          btn.style.transition = 'transform 120ms linear';
          btn.style.transform = `translate(${dx * 0.35 * damp}px, ${dy * 0.35 * damp}px)`;
          btn.style.setProperty('--mag', (mag * damp).toFixed(3));
        } else {
          // 环外：平滑归位 + 下划线渐隐；判定基于基准 rect，不会因位移反弹再触发
          btn.style.transition = 'transform 400ms cubic-bezier(0.34,1.56,0.64,1)';
          btn.style.transform = 'translate(0,0)';
          btn.style.setProperty('--mag', '0');
          lastVX = 0;
        }
      });
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('scroll', invalidate);
      window.removeEventListener('resize', invalidate);
      cancelAnimationFrame(raf);
    };
  }, []);

  const config = useSiteConfig();

  return (
    <a
      ref={mailRef}
      href={`mailto:${config.email}`}
      className="mail-magnetic mt-8 inline-block no-underline"
      style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-1)' }}
    >
      {config.email}
    </a>
  );
}

/** 简洁页脚版权条（通用）*/
export function MiniFooter() {
  const config = useSiteConfig();
  return (
    <footer className="mx-auto" style={{ maxWidth: 'var(--content-w)', padding: 'clamp(96px,14vh,160px) var(--gutter) 0' }}>
      <div
        className="flex flex-wrap items-center justify-between gap-4 font-mono-site"
        style={{
          borderTop: '1px solid var(--border-soft)',
          padding: '24px 0 32px',
          fontSize: 12,
          letterSpacing: '0.08em',
          color: 'var(--text-3)',
        }}
      >
        <span>© 2026 {config.name}</span>
        <span className="hidden sm:inline">{config.footerNote}</span>
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="font-mono-site"
          style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 12, letterSpacing: '0.08em' }}
        >
          回到顶部 ↑
        </button>
      </div>
    </footer>
  );
}

/** 完整页脚（仅首页）：磁吸邮箱 + 社交 + 版权条 */
export default function Footer() {
  const config = useSiteConfig();
  const socials: { label: string; href: string }[] = [
    ...(config.github ? [{ label: 'GitHub', href: config.github }] : []),
    { label: '博客', href: '#/articles' },
    ...(config.twitter ? [{ label: 'Twitter', href: config.twitter }] : []),
  ];
  return (
    <footer style={{ padding: 'clamp(96px,14vh,160px) var(--gutter) 0' }}>
      <h2 className="m-0" style={{ fontSize: 'clamp(48px, 9vw, 120px)', fontWeight: 800, lineHeight: 1, letterSpacing: '-0.02em', color: 'var(--text-1)' }}>
        联系我
      </h2>
      <MagneticMail />
      <div className="mt-8 flex gap-6">
        {socials.map((s) => (
          <a
            key={s.label}
            href={s.href}
            target={s.href.startsWith('http') ? '_blank' : undefined}
            rel="noreferrer"
            className="link-underline font-mono-site no-underline"
            style={{ fontSize: 13, letterSpacing: '0.1em', color: 'var(--text-2)' }}
          >
            {s.label}
          </a>
        ))}
      </div>
      <div
        className="mt-16 flex flex-wrap items-center justify-between gap-4 font-mono-site"
        style={{
          borderTop: '1px solid var(--border-soft)',
          padding: '24px 0 32px',
          fontSize: 12,
          letterSpacing: '0.08em',
          color: 'var(--text-3)',
        }}
      >
        <span>© 2026 {config.name}</span>
        <span className="hidden sm:inline">{config.footerNote}</span>
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="font-mono-site"
          style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 12, letterSpacing: '0.08em' }}
        >
          回到顶部 ↑
        </button>
      </div>
    </footer>
  );
}
