import { useEffect, useRef } from 'react';

/** Hero 鼠标视差（桌面端 + 非 reduced-motion） */
export default function Hero() {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fine = window.matchMedia('(pointer: fine)').matches;
    const wide = window.innerWidth >= 1024;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!fine || !wide || reduced) return;

    let raf = 0;
    let tx = 0, ty = 0, cx = 0, cy = 0;
    const onMove = (e: MouseEvent) => {
      tx = e.clientX - window.innerWidth / 2;
      ty = e.clientY - window.innerHeight / 2;
    };
    const tick = () => {
      cx += (tx - cx) * 0.06;
      cy += (ty - cy) * 0.06;
      el.querySelectorAll<HTMLElement>('[data-depth]').forEach((node) => {
        const d = parseFloat(node.dataset.depth || '0');
        node.style.transform = `translate(${cx * d * 2}px, ${cy * d * 2}px)`;
      });
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener('mousemove', onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <section
      ref={ref}
      className="relative flex flex-col justify-center overflow-hidden"
      style={{ minHeight: '100svh', padding: '0 var(--gutter)' }}
    >
      {/* 水印字：FULL-STACK 横排 + MZ 竖排错位叠加 */}
      <div className="watermark hidden md:block" data-depth="0.015" style={{ right: '-2vw', bottom: '6vh' }}>
        FULL-STACK
      </div>
      <div
        className="hidden lg:block"
        aria-hidden="true"
        style={{ position: 'absolute', left: 'clamp(420px, 52vw, 780px)', top: '50%', transform: 'translateY(-50%)' }}
      >
        <div
          className="watermark"
          data-depth="0.03"
          style={{
            writingMode: 'vertical-rl',
            fontSize: 'clamp(120px, 13vw, 200px)',
            letterSpacing: '-0.04em',
            lineHeight: 1,
            WebkitTextStroke: '1px rgba(255,255,255,0.12)',
          }}
        >
          MZ
        </div>
      </div>

      {/* 状态徽章 */}
      <div
        className="absolute font-mono-site flex items-center gap-2"
        style={{ top: 'calc(var(--nav-h) + 24px)', right: 'var(--gutter)', fontSize: 12, color: 'var(--text-2)' }}
      >
        <span className="breathe-dot inline-block h-2 w-2 rounded-full" style={{ background: 'var(--success)' }} />
        OPEN TO WORK
      </div>

      {/* 姓名（Obys 错位） */}
      <div className="relative">
        <span
          className="absolute hidden md:block"
          data-depth="0.06"
          style={{
            width: 16, height: 16, background: 'var(--brand)', borderRadius: 4,
            left: -40, top: 'clamp(12px, 2vw, 32px)',
          }}
        />
        <h1 className="text-display m-0" style={{ color: 'var(--text-1)' }}>敏智</h1>
        <h1
          className="text-display m-0"
          style={{ color: 'var(--text-1)', marginLeft: 'clamp(40px, 12vw, 200px)' }}
        >
          在此
        </h1>
      </div>

      <div className="mt-3 font-mono-site" style={{ fontSize: 13, letterSpacing: '0.14em', color: 'var(--text-3)' }}>
        MIN ZHI — FULL-STACK DEVELOPER
      </div>

      {/* 宣言 */}
      <p
        className="mt-8"
        data-depth="0.03"
        style={{ fontSize: 18, lineHeight: 1.7, color: 'var(--text-2)', maxWidth: 560 }}
      >
        全栈开发者，把想法做成能跑的产品。往下翻，看看我做的东西。
      </p>

      {/* 底部 meta */}
      <div
        className="absolute left-0 right-0 flex items-end justify-between font-mono-site"
        style={{ bottom: 32, padding: '0 var(--gutter)', fontSize: 12, color: 'var(--text-3)' }}
      >
        <span className="hidden sm:inline">31.23°N, 121.47°E — SHANGHAI</span>
        <span className="hidden md:flex flex-col items-center gap-1">
          <span style={{ letterSpacing: '0.2em' }}>SCROLL</span>
          <span className="scroll-hint inline-block">↓</span>
        </span>
        <span className="hidden sm:inline">UTC+8</span>
      </div>
    </section>
  );
}
