import { useState, useEffect, useCallback } from "react";
import { cn } from "@/utils";
import { DrawingCanvas } from "./DrawingCanvas";

interface PresentationModeProps {
  active: boolean;
  onExit: () => void;
}

export function PresentationMode({ active, onExit }: PresentationModeProps) {
  const [drawing, setDrawing] = useState(false);

  const enterFullscreen = useCallback(async () => {
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      // Safari / older browsers may not support this
    }
  }, []);

  const exitFullscreen = useCallback(async () => {
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        // ignore
      }
    }
  }, []);

  useEffect(() => {
    if (active) {
      enterFullscreen();
    } else {
      exitFullscreen();
      setDrawing(false);
    }
  }, [active, enterFullscreen, exitFullscreen]);

  useEffect(() => {
    function onFsChange() {
      if (!document.fullscreenElement && active) {
        onExit();
      }
    }
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, [active, onExit]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!active) return;
      if (e.key === "Escape") {
        if (drawing) {
          setDrawing(false);
        } else {
          onExit();
        }
        e.preventDefault();
      }
      if (e.key === "d" || e.key === "D") {
        setDrawing((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, drawing, onExit]);

  if (!active) return null;

  return (
    <>
      <DrawingCanvas
        active={drawing}
        onClear={() => {}}
        onExit={() => setDrawing(false)}
      />

      {/* Floating controls (top-right, above drawing canvas when not drawing) */}
      {!drawing && (
        <div className="fixed top-4 right-4 z-[72] flex items-center gap-1 rounded-lg border border-white/15 bg-black/60 p-1 shadow-lg backdrop-blur-md">
          <PresentationButton
            onClick={() => setDrawing(true)}
            title="画笔标注 (D)"
          >
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
            </svg>
          </PresentationButton>
          <PresentationButton onClick={onExit} title="退出演示 (Esc)">
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3v3a2 2 0 0 1-2 2H3" />
              <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
              <path d="M3 16h3a2 2 0 0 1 2 2v3" />
              <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
            </svg>
          </PresentationButton>
        </div>
      )}
    </>
  );
}

function PresentationButton({
  onClick,
  title,
  children,
}: {
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
        "inline-flex size-8 items-center justify-center rounded-md text-white/80 transition-colors hover:bg-white/20 hover:text-white",
      )}
    >
      {children}
    </button>
  );
}
