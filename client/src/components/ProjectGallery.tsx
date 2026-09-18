import { useEffect, useRef, useState } from 'react';
import type { Project } from '@/types/blog';
import { ProjectCard } from '@/components/ProjectCard';

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

  // 全局光斑：钉在鼠标视口坐标上（sticky 容器滚动不动，天然不脱锚），
  // 跨卡片时光斑连续，仅颜色平滑切换到当前卡片标志色
  const spotRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isDesktop) return;
    const section = sectionRef.current;
    const spot = spotRef.current;
    if (!section || !spot) return;
    const fine = window.matchMedia('(pointer: fine)').matches;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!fine || reduced) return;

    let raf = 0;
    let active = false;
    let lastX = -1, lastY = -1;

    const applySpot = (clientX: number, clientY: number) => {
      // 光斑 absolute 在 sticky 容器内：以光斑的 offsetParent（sticky 容器）为基准换算，
      // sticky 生效时容器钉在视口，释放时容器随页面上移，基准始终正确
      const host = spot.offsetParent as HTMLElement | null;
      const r = (host ?? spot).getBoundingClientRect();
      spot.style.setProperty('--sx', `${clientX - r.left}px`);
      spot.style.setProperty('--sy', `${clientY - r.top}px`);
      // 边界自适应收缩（仅上下边界）：光斑半径随鼠标到容器上下边的距离收缩，
      // 渐变在到达边界前自然衰减到 0，不产生硬切割线；左右方向允许延伸出界被裁剪
      const distEdge = Math.min(clientY - r.top, r.bottom - clientY);
      const radius = Math.round(Math.min(520, Math.max(0, distEdge * 1.6)));
      spot.style.setProperty('--sr', `${radius}px`);
      // 滚动时卡片横移，鼠标下方可能换了卡：用命中检测刷新标志色
      const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
      const card = el ? el.closest('.project-card') : null;
      const rgb = card ? getComputedStyle(card).getPropertyValue('--pc-rgb').trim() : '';
      if (rgb) spot.style.setProperty('--spot-rgb', rgb);
    };

    const onMove = (e: MouseEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        lastX = e.clientX; lastY = e.clientY;
        applySpot(lastX, lastY);
        if (!active) { active = true; spot.style.opacity = '1'; }
      });
    };

    // sticky 释放/驻留段滚动时容器会移动：用缓存鼠标坐标重锚光斑到容器内坐标
    const onScroll = () => {
      if (lastX < 0) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => applySpot(lastX, lastY));
    };

    const onLeave = () => {
      cancelAnimationFrame(raf);
      active = false;
      lastX = -1; lastY = -1;
      spot.style.opacity = '0';
    };
    section.addEventListener('mousemove', onMove);
    section.addEventListener('mouseleave', onLeave);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      section.removeEventListener('mousemove', onMove);
      section.removeEventListener('mouseleave', onLeave);
      window.removeEventListener('scroll', onScroll);
    };
  }, [isDesktop]);

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
        {/* 全局光斑：absolute 在 sticky 视口容器内，跟随视口不受祖先 transform 影响，跨卡连续 */}
        <div
          ref={spotRef}
          className="gallery-spotlight pointer-events-none"
          style={{
            background: 'radial-gradient(circle var(--sr,520px) at var(--sx,-999px) var(--sy,-999px), rgba(var(--spot-rgb,200,245,66),0.20), transparent 42%)',
          }}
        />
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
