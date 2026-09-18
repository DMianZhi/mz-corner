import { useEffect, useRef } from 'react';
import type { Project } from '@/types/blog';
import { ArrowRightIcon } from '@/components/icon';

function hexToRgb(hex: string): string {
  const m = hex.replace('#', '');
  const v = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
  const n = parseInt(v, 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

const STATUS_LABEL: Record<string, string> = { live: 'LIVE', wip: 'WIP', archived: 'ARCHIVED' };

/** 单张项目卡：3D 倾斜 + 高光 */
export function ProjectCard({ p, index }: { p: Project; index: number }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const rgb = hexToRgb(p.color);

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const fine = window.matchMedia('(pointer: fine)').matches;
    const wide = window.innerWidth >= 1024;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!fine || !wide || reduced) return;

    let raf = 0;
    let lastX = -1, lastY = -1;

    // 3D 倾斜跟随（高光已提升到长廊层，卡片只负责姿态）
    const applyPose = (clientX: number, clientY: number) => {
      const r = card.getBoundingClientRect();
      const relX = (clientX - r.left) / r.width;
      const relY = (clientY - r.top) / r.height;
      card.style.transition = 'transform 100ms linear';
      card.style.transform = `perspective(1200px) rotateY(${(relX - 0.5) * 10}deg) rotateX(${-(relY - 0.5) * 10}deg) scale(1.015)`;
    };

    const onMove = (e: MouseEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        applyPose(e.clientX, e.clientY);
        lastX = e.clientX; lastY = e.clientY;
      });
    };

    // 滚动驱动卡片横移时鼠标不动，相对位置已变 → 用缓存坐标重锚倾斜
    const onScroll = () => {
      if (lastX < 0) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = card.getBoundingClientRect();
        const inside = lastX >= r.left && lastX <= r.right && lastY >= r.top && lastY <= r.bottom;
        if (inside) applyPose(lastX, lastY);
      });
    };

    const onLeave = () => {
      cancelAnimationFrame(raf);
      lastX = -1; lastY = -1;
      card.style.transition = 'transform 500ms cubic-bezier(0.16,1,0.3,1)';
      card.style.transform = 'perspective(1200px) rotateY(0) rotateX(0) scale(1)';
    };
    card.addEventListener('mousemove', onMove);
    card.addEventListener('mouseleave', onLeave);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      card.removeEventListener('mousemove', onMove);
      card.removeEventListener('mouseleave', onLeave);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  return (
    <div
      ref={cardRef}
      className="project-card card-enter relative shrink-0 overflow-hidden"
      style={{
        width: 'min(78vw, 1040px)',
        minHeight: 'min(72svh, 640px)',
        background: 'var(--bg-card)',
        border: '1px solid var(--border-soft)',
        borderRadius: 20,
        padding: 'clamp(28px, 4vw, 56px)',
        animationDelay: `${index * 90}ms`,
        ['--pc' as string]: p.color,
        ['--pc-rgb' as string]: rgb,
        transition: 'border-color 250ms cubic-bezier(0.16,1,0.3,1)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = `rgba(${rgb},0.4)`;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-soft)';
      }}
    >
      {/* 状态徽章 */}
      {p.status && STATUS_LABEL[p.status] && (
        <span
          className="font-mono-site absolute"
          style={{
            top: 24, right: 24, fontSize: 10, letterSpacing: '0.12em',
            padding: '4px 10px', borderRadius: 999,
            border: '1px solid var(--border-strong)', color: 'var(--text-3)',
          }}
        >
          {STATUS_LABEL[p.status]}
        </span>
      )}

      <div className="grid items-center gap-8 lg:grid-cols-12">
        {/* 色块封面 */}
        <div className="lg:col-span-5 flex items-center gap-6">
          <div
            className="flex items-center justify-center"
            style={{
              width: 'clamp(96px, 14vw, 168px)',
              height: 'clamp(96px, 14vw, 168px)',
              background: p.color,
              borderRadius: 16,
              fontSize: 'clamp(40px, 6vw, 72px)',
              boxShadow: `0 24px 64px -16px rgba(${rgb},0.45)`,
            }}
          >
            {p.symbol}
          </div>
          <span
            className="font-mono-site hidden lg:block"
            style={{ fontSize: 'clamp(48px, 6vw, 88px)', color: 'var(--text-3)', opacity: 0.5, lineHeight: 1 }}
          >
            {String(index + 1).padStart(2, '0')}
          </span>
        </div>

        {/* 文字信息 */}
        <div className="lg:col-span-7">
          <h2
            className="text-h2-site m-0 transition-colors duration-200"
            style={{ color: 'var(--text-1)' }}
          >
            {p.name}
          </h2>
          <p className="mt-4" style={{ fontSize: 18, lineHeight: 1.7, color: 'var(--text-2)' }}>
            {p.tagline}
          </p>
          {p.description && (
            <p className="mt-2" style={{ fontSize: 15, lineHeight: 1.7, color: 'var(--text-3)' }}>
              {p.description}
            </p>
          )}
          <div className="mt-6 flex flex-wrap gap-2">
            {p.tech.map((t) => (
              <span
                key={t}
                className="font-mono-site"
                style={{
                  fontSize: 12, padding: '5px 10px', borderRadius: 999,
                  border: '1px solid var(--border-soft)', color: 'var(--text-2)',
                }}
              >
                {t}
              </span>
            ))}
          </div>
          {p.link && (
            <a
              href={p.link}
              target="_blank"
              rel="noreferrer"
              className="link-underline font-mono-site mt-8 inline-block no-underline"
              style={{ fontSize: 13, letterSpacing: '0.1em', color: 'var(--text-1)', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              访问项目
              <ArrowRightIcon size={13} />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

/** 项目长廊：纵向滚动驱动横向位移（桌面）/ 纵向卡片流（移动） */

export { hexToRgb };
