import { useEffect, useRef } from 'react';

/** Hero 鼠标视差（桌面端 + 非 reduced-motion） */
export default function Hero() {
  const ref = useRef<HTMLElement>(null);
  const wmRef = useRef<HTMLDivElement>(null);

  // FULL-STACK 水印：字号动态计算占满视口宽度（实测 10 字符总宽 6.26em）
  useEffect(() => {
    const el = wmRef.current;
    if (!el) return;
    const fit = () => {
      const vw = document.documentElement.clientWidth;
      // gutter 是 clamp() 无法 parseFloat，用元素右缘到视口右缘的实际距离反推可用宽
      const rightEdge = vw - Math.round(el.getBoundingClientRect().right);
      const target = vw - rightEdge * 2;
      el.style.fontSize = `${target / 6.26}px`;
      // 实测校准：字符宽度比随字号非线性（kerning），按实际宽度二次修正
      const actual = el.getBoundingClientRect().width;
      if (actual > target && actual > 0) {
        const fs = parseFloat(getComputedStyle(el).fontSize);
        el.style.fontSize = `${fs * (target / actual)}px`;
      }
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

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
      {/* 水印字：FULL-STACK 横排（JS 动态字号占满视口宽） + MZ 竖排错位叠加 */}
      <div ref={wmRef} className="watermark hidden md:block" data-depth="0.015" style={{ right: 'var(--gutter)', bottom: '6vh' }}>
        FULL-STACK
      </div>
      {/* 右侧错位 MZ 水印：完全复用 .watermark 材质，坐在大字基线上 */}
      <div
        className="hidden lg:block"
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 'clamp(560px, 54vw, 860px)',
          top: 'calc(50% - clamp(64px, 13vw, 176px) * 0.92 + 104px)',
        }}
      >
        <div data-depth="0.03" style={{ position: 'relative' }}>
          {/* M：原生 watermark 材质，仅缩小字号 */}
          <div className="watermark" style={{ fontSize: 'clamp(120px, 12vw, 190px)' }}>
            M
          </div>
          {/* Z：同材质，右下错开（恢复原定位） */}
          <div
            className="watermark"
            style={{
              fontSize: 'clamp(70px, 7vw, 110px)',
              right: 'clamp(-70px, -5vw, -40px)',
              bottom: '-0.12em',
            }}
          >
            Z
          </div>
          {/* 对角色标方块：与「敏智」左上角方块呼应 */}
          <span
            data-depth="0.05"
            style={{
              position: 'absolute',
              left: -30, top: '0.12em',
              width: 16, height: 16, borderRadius: 4,
              background: 'var(--brand)',
            }}
          />
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
