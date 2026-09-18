import { useState, useMemo } from "react";
import { cn } from "@/utils";
import { CommentPanel } from "./CommentPanel";
import { PresentationMode } from "./PresentationMode";
import type { DocToolbarProps } from "./types";

export type { DocToolbarProps } from "./types";
export type { DocComment } from "./types";

const POSITION_CLASSES: Record<NonNullable<DocToolbarProps["position"]>, string> = {
  "bottom-right": "bottom-6 right-6",
  "bottom-left": "bottom-6 left-6",
  "top-right": "top-6 right-6",
  "top-left": "top-6 left-6",
};

/**
 * 文档工具栏 —— 为文档模式应用提供评论和演示能力。
 *
 * 评论数据自动存储在 BaaS `doc_comment` 表中（需先执行 migration）。
 *
 * @example
 * ```tsx
 * <DocToolbar
 *   projectId="12345"
 *   pageId={location.pathname}
 *   features={["comment", "presentation"]}
 * />
 * ```
 */
export function DocToolbar({
  projectId,
  pageId,
  features = ["comment", "presentation"],
  position = "bottom-right",
  className,
}: DocToolbarProps) {
  const resolvedPageId = pageId ?? (typeof window !== "undefined" ? window.location.pathname : "/");

  const [commentOpen, setCommentOpen] = useState(false);
  const [presentationActive, setPresentationActive] = useState(false);

  const enabledFeatures = useMemo(() => new Set(features), [features]);
  const hasComment = enabledFeatures.has("comment");
  const hasPresentation = enabledFeatures.has("presentation");

  // TODO: replace with real user from auth context
  const currentUser = useMemo(() => {
    try {
      const stored = localStorage.getItem("doc_toolbar_user");
      return stored ? JSON.parse(stored) as { name: string; avatar?: string; id?: string } : undefined;
    } catch {
      return undefined;
    }
  }, []);

  if (presentationActive) {
    return (
      <PresentationMode
        active={presentationActive}
        onExit={() => setPresentationActive(false)}
      />
    );
  }

  return (
    <>
      {/* Floating toolbar */}
      <div
        className={cn(
          "fixed z-50 flex items-center gap-1 rounded-xl border border-border bg-popover/95 p-1 shadow-lg backdrop-blur-sm",
          POSITION_CLASSES[position],
          className,
        )}
      >
        {hasComment && (
          <ToolbarButton
            onClick={() => setCommentOpen((v) => !v)}
            active={commentOpen}
            title="评论"
          >
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </ToolbarButton>
        )}

        {hasPresentation && (
          <ToolbarButton
            onClick={() => setPresentationActive(true)}
            active={false}
            title="演示模式"
          >
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 8V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3" />
              <path d="M21 16v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3" />
              <path d="M3 8h18" />
              <path d="M3 16h18" />
            </svg>
          </ToolbarButton>
        )}
      </div>

      {/* Comment side panel */}
      {hasComment && (
        <CommentPanel
          projectId={projectId}
          pageId={resolvedPageId}
          open={commentOpen}
          onClose={() => setCommentOpen(false)}
          currentUser={currentUser}
        />
      )}
    </>
  );
}

function ToolbarButton({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void;
  active: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        active && "bg-muted text-foreground",
      )}
    >
      {children}
    </button>
  );
}
