import { useEffect, useRef, useState } from 'react';
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
function ProjectCard({ p, index }: { p: Project; index: number }) {
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

    const applyPose = (clientX: number, clientY: number, dur: number) => {
      const r = card.getBoundingClientRect();
      const relX = (clientX - r.left) / r.width;
      const relY = (clientY - r.top) / r.height;
      card.style.transition = `transform 100ms linear, --mx ${dur}ms cubic-bezier(0.22,1,0.36,1), --my ${dur}ms cubic-bezier(0.22,1,0.36,1)`;
      card.style.transform = `perspective(1200px) rotateY(${(relX - 0.5) * 10}deg) rotateX(${-(relY - 0.5) * 10}deg) scale(1.015)`;
      card.style.setProperty('--mx', `${relX * 100}%`);
      card.style.setProperty('--my', `${relY * 100}%`);
    };

    const onMove = (e: MouseEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const dist = lastX < 0 ? 999 : Math.hypot(e.clientX - lastX, e.clientY - lastY);
        const dur = Math.round(Math.min(420, Math.max(120, dist * 3)));
        applyPose(e.clientX, e.clientY, dur);
        lastX = e.clientX; lastY = e.clientY;
      });
    };

    // 滚动驱动卡片横移时鼠标不动，相对位置已变 → 用缓存坐标重锚高光与倾斜
    const onScroll = () => {
      if (lastX < 0) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = card.getBoundingClientRect();
        const inside = lastX >= r.left && lastX <= r.right && lastY >= r.top && lastY <= r.bottom;
        if (inside) applyPose(lastX, lastY, 90);
      });
    };

    const onLeave = () => {
      cancelAnimationFrame(raf);
      lastX = -1; lastY = -1;
      card.style.transition = 'transform 500ms cubic-bezier(0.16,1,0.3,1), --mx 500ms cubic-bezier(0.16,1,0.3,1), --my 500ms cubic-bezier(0.16,1,0.3,1)';
      card.style.transform = 'perspective(1200px) rotateY(0) rotateX(0) scale(1)';
      // 高光归位中心，下次划入从中心平滑追向鼠标，不再闪现
      card.style.setProperty('--mx', '50%');
      card.style.setProperty('--my', '50%');
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
      {/* 高光层：标志色追踪光斑，位置由 @property 过渡平滑追赶鼠标 */}
      <div
        className="spotlight pointer-events-none absolute inset-0 hidden lg:block"
        style={{
          background: `radial-gradient(560px circle at var(--mx,50%) var(--my,50%), rgba(${rgb},0.16), transparent 42%)`,
        }}
      />

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
export default function ProjectGallery({ projects }: { projects: Project[] }) {
  const sectionRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [isDesktop, setIsDesktop] = useState(false);
  const [sectionH, setSectionH] = useState(0);
  // 横移总距离与末卡驻留距离（px），measure 时更新
  const overflowRef = useRef(0);
  const dwellRef = useRef(0);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const check = () => setIsDesktop(window.innerWidth >= 1024 && !reduced);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // 计算 section 高度 & 滚动映射
  useEffect(() => {
    if (!isDesktop || projects.length === 0) return;
    const section = sectionRef.current;
    const track = trackRef.current;
    if (!section || !track) return;

    let raf = 0;
    let targetX = 0, currentX = 0;

    const measure = () => {
      // 用 clientWidth（不含滚动条）作为可视宽度：避免末态卡片右边框被滚动条压住
      const vw = document.documentElement.clientWidth;
      // 末态以「最后一张卡右缘」对齐「可视右缘」计算横向溢出，
      // 避免 scrollWidth 的像素舍入误差导致末端多移几像素
      const cards = track.children;
      const lastCard = cards[cards.length - 1];
      const trackStart = track.getBoundingClientRect().left;
      const trackTx = currentX;
      const lastRightInTrack = lastCard
        ? lastCard.getBoundingClientRect().right - trackStart + trackTx
        : track.scrollWidth;
      // 末端多滚一个 gap：末卡右缘留出与卡片间距相同的右边距，视觉更匀称
      const gapPx = parseFloat(getComputedStyle(track).columnGap) || 24;
      const overflow = Math.max(0, Math.round(lastRightInTrack - vw + gapPx));
      // 平衡点：横移结束后给末卡约 55% 视口高的驻留段（380–760px），
      // 读完最后一张再放行页面下滑；太短等于没停，太长会像卡死
      const dwell = overflow < 40 ? 0 : Math.round(Math.min(Math.max(window.innerHeight * 0.55, 380), 760));
      overflowRef.current = overflow;
      dwellRef.current = dwell;
      // 用 clientWidth（不含滚动条）计算粘性区高度，避免末态横向多滚一个滚动条宽度
      setSectionH(overflow + dwell + document.documentElement.clientHeight);
    };
    measure();
    window.addEventListener('resize', measure);

    const onScroll = () => {
      const rect = section.getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      const total = Math.max(1, section.offsetHeight - window.innerHeight);
      const raw = Math.min(1, Math.max(0, -rect.top / total));
      // 横移在 raw = overflow/total 处完成，其后滚动为末卡驻留段（progress 停在 1）
      const p = Math.min(1, (raw * total) / Math.max(overflowRef.current, 1));
      setProgress(p);
      targetX = -overflowRef.current * p;
      void vw;
    };

    const tick = () => {
      currentX += (targetX - currentX) * 0.075;
      if (Math.abs(targetX - currentX) > 0.5) {
        track.style.transform = `translateX(${currentX}px)`;
      } else {
        track.style.transform = `translateX(${targetX}px)`;
      }
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', measure);
      cancelAnimationFrame(raf);
    };
  }, [isDesktop, projects.length]);

  const current = Math.min(projects.length, Math.max(1, Math.round(progress * (projects.length - 1)) + 1));
  const activeColor = projects[current - 1]?.color || 'var(--brand)';

  const header = (
    <div style={{ padding: '0 var(--gutter)', marginBottom: 48 }}>
      <div className="kicker-site"><span className="kicker-num">01</span>SELECTED WORKS</div>
      <h2 className="text-h1-site m-0 mt-4" style={{ color: 'var(--text-1)' }}>项目</h2>
    </div>
  );

  if (!isDesktop) {
    // 移动端：纵向卡片流
    return (
      <section className="relative" style={{ paddingTop: 'clamp(96px, 14vh, 160px)' }}>
        {header}
        <div className="flex flex-col gap-6" style={{ padding: '0 var(--gutter)' }}>
          {projects.map((p, i) => (
            <div key={p.id} style={{ minHeight: 'auto' }}>
              <ProjectCard p={p} index={i} />
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section ref={sectionRef} className="relative" style={{ height: sectionH || '300vh' }}>
      <div
        className="sticky top-0 flex flex-col justify-center overflow-hidden"
        style={{ height: '100svh' }}
      >
        {header}
        <div
          ref={trackRef}
          className="flex items-center"
          style={{
            gap: 'clamp(24px, 4vw, 64px)',
            paddingLeft: 'var(--gutter)',
            paddingRight: 'var(--gutter)',
            willChange: 'transform',
          }}
        >
          {projects.map((p, i) => (
            <ProjectCard key={p.id} p={p} index={i} />
          ))}
        </div>

        {/* 进度 UI */}
        <div
          className="absolute flex items-center gap-4"
          style={{ bottom: 32, left: 'var(--gutter)' }}
        >
          <div style={{ width: 200, height: 2, background: 'var(--border-strong)', borderRadius: 2 }}>
            <div
              style={{
                width: `${progress * 100}%`,
                height: '100%',
                background: activeColor,
                borderRadius: 2,
                transition: 'background 200ms',
              }}
            />
          </div>
          <span className="font-mono-site" style={{ fontSize: 13 }}>
            <span style={{ color: activeColor }}>{String(current).padStart(2, '0')}</span>
            <span style={{ color: 'var(--text-3)' }}> / {String(projects.length).padStart(2, '0')}</span>
          </span>
        </div>
      </div>
    </section>
  );
}
