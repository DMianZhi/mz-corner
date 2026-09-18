import { useRef, useEffect, useState, useCallback } from "react";
import { cn } from "@/utils";

type Tool = "pen" | "highlighter" | "eraser";

const COLORS = [
  "#ef4444",
  "#f59e0b",
  "#22c55e",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#ffffff",
] as const;

interface DrawingCanvasProps {
  active: boolean;
  onClear: () => void;
  onExit: () => void;
}

export function DrawingCanvas({ active, onClear, onExit }: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState<string>(COLORS[0]);
  const [lineWidth, setLineWidth] = useState(3);
  const drawingRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const data = canvas.toDataURL();
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, window.innerWidth, window.innerHeight);
    };
    img.src = data;
  }, []);

  useEffect(() => {
    if (!active) return;
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [active, resize]);

  function getPos(e: React.PointerEvent): { x: number; y: number } {
    return { x: e.clientX, y: e.clientY };
  }

  function startDraw(e: React.PointerEvent) {
    drawingRef.current = true;
    lastPosRef.current = getPos(e);
    const canvas = canvasRef.current;
    canvas?.setPointerCapture(e.pointerId);
  }

  function draw(e: React.PointerEvent) {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);

    ctx.beginPath();
    ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
    ctx.lineTo(pos.x, pos.y);

    if (tool === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.lineWidth = lineWidth * 6;
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = color;
      ctx.lineWidth = tool === "highlighter" ? lineWidth * 4 : lineWidth;
      ctx.globalAlpha = tool === "highlighter" ? 0.35 : 1;
    }

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.globalAlpha = 1;

    lastPosRef.current = pos;
  }

  function endDraw() {
    drawingRef.current = false;
  }

  function handleClear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    onClear();
  }

  if (!active) return null;

  return (
    <>
      <canvas
        ref={canvasRef}
        className="fixed inset-0 z-[70] touch-none"
        style={{ cursor: tool === "eraser" ? "cell" : "crosshair" }}
        onPointerDown={startDraw}
        onPointerMove={draw}
        onPointerUp={endDraw}
        onPointerLeave={endDraw}
      />

      {/* Toolbar */}
      <div className="fixed bottom-6 left-1/2 z-[71] flex -translate-x-1/2 items-center gap-1 rounded-xl border border-white/20 bg-black/70 px-2 py-1.5 shadow-2xl backdrop-blur-md">
        {/* Tools */}
        <ToolButton
          active={tool === "pen"}
          onClick={() => setTool("pen")}
          title="画笔"
        >
          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
          </svg>
        </ToolButton>
        <ToolButton
          active={tool === "highlighter"}
          onClick={() => setTool("highlighter")}
          title="荧光笔"
        >
          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 11-6 6v3h9l3-3" />
            <path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" />
          </svg>
        </ToolButton>
        <ToolButton
          active={tool === "eraser"}
          onClick={() => setTool("eraser")}
          title="橡皮擦"
        >
          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" />
            <path d="M22 21H7" />
            <path d="m5 11 9 9" />
          </svg>
        </ToolButton>

        <div className="mx-1 h-5 w-px bg-white/20" />

        {/* Colors */}
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => { setColor(c); if (tool === "eraser") setTool("pen"); }}
            className={cn(
              "size-5 rounded-full border-2 transition-transform hover:scale-110",
              color === c && tool !== "eraser" ? "border-white scale-110" : "border-transparent",
            )}
            style={{ backgroundColor: c }}
            title={c}
          />
        ))}

        <div className="mx-1 h-5 w-px bg-white/20" />

        {/* Line width */}
        <input
          type="range"
          min={1}
          max={10}
          value={lineWidth}
          onChange={(e) => setLineWidth(Number(e.target.value))}
          className="h-1 w-16 cursor-pointer accent-white"
          title="笔触粗细"
        />

        <div className="mx-1 h-5 w-px bg-white/20" />

        <ToolButton active={false} onClick={handleClear} title="清除全部">
          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18" />
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
          </svg>
        </ToolButton>

        <ToolButton active={false} onClick={onExit} title="退出画笔">
          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </ToolButton>
      </div>
    </>
  );
}

function ToolButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-lg text-white/80 transition-colors hover:bg-white/20 hover:text-white",
        active && "bg-white/25 text-white",
      )}
    >
      {children}
    </button>
  );
}
