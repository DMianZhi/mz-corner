import { useState, useRef, useEffect } from "react";
import { cn } from "@/utils";
import { useComments } from "./useComments";

interface CommentPanelProps {
  projectId: string;
  pageId: string;
  open: boolean;
  onClose: () => void;
  currentUser?: { name: string; avatar?: string; id?: string };
}

export function CommentPanel({
  projectId,
  pageId,
  open,
  onClose,
  currentUser,
}: CommentPanelProps) {
  const { comments, loading, error, addComment, deleteComment } = useComments(
    projectId,
    pageId,
  );
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  async function handleSubmit() {
    const text = draft.trim();
    if (!text || !currentUser) return;
    setSubmitting(true);
    try {
      await addComment(text, currentUser.name, currentUser.avatar ?? "");
      setDraft("");
    } catch {
      // error is surfaced by the hook
    } finally {
      setSubmitting(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div
      className={cn(
        "fixed inset-y-0 right-0 z-[60] flex w-80 flex-col border-l border-border bg-popover text-popover-foreground shadow-lg transition-transform duration-200 sm:w-96",
        open ? "translate-x-0" : "translate-x-full",
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-medium">
          评论{" "}
          {!loading && (
            <span className="text-muted-foreground">({comments.length})</span>
          )}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>

      {/* Comment list */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading && (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            加载中...
          </div>
        )}
        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        {!loading && !error && comments.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-sm text-muted-foreground">
            <svg className="size-10 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span>暂无评论</span>
            <span className="text-xs">成为第一个评论的人</span>
          </div>
        )}
        {!loading &&
          comments.map((c) => (
            <div key={c._id} className="group mb-3 rounded-lg border border-border p-3">
              <div className="mb-1.5 flex items-center gap-2">
                <CommentAvatar name={c.author_name} avatar={c.author_avatar} />
                <div className="flex-1 truncate text-xs font-medium">
                  {c.author_name}
                </div>
                <time className="text-[10px] text-muted-foreground">
                  {formatTime(c.create_at)}
                </time>
                {currentUser?.id === c.create_id && (
                  <button
                    type="button"
                    onClick={() => deleteComment(c._id)}
                    className="invisible size-5 shrink-0 rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive group-hover:visible"
                    title="删除"
                  >
                    <svg className="mx-auto size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18" />
                      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                    </svg>
                  </button>
                )}
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {c.content}
              </p>
            </div>
          ))}
      </div>

      {/* Input area */}
      {currentUser && (
        <div className="border-t border-border p-3">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="写下你的评论..."
            rows={3}
            className="mb-2 w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">
              Ctrl+Enter 发送
            </span>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!draft.trim() || submitting}
              className="inline-flex h-7 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/80 disabled:pointer-events-none disabled:opacity-50"
            >
              {submitting ? "发送中..." : "发送"}
            </button>
          </div>
        </div>
      )}
      {!currentUser && (
        <div className="border-t border-border p-4 text-center text-xs text-muted-foreground">
          登录后即可评论
        </div>
      )}
    </div>
  );
}

function CommentAvatar({ name, avatar }: { name: string; avatar?: string }) {
  if (avatar) {
    return (
      <img
        src={avatar}
        alt={name}
        className="size-6 shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-blue-500 to-violet-500 text-[10px] font-semibold text-white">
      {name.slice(0, 1)}
    </div>
  );
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 1) return "刚刚";
    if (diffMin < 60) return `${diffMin}分钟前`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}小时前`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 30) return `${diffDay}天前`;
    return d.toLocaleDateString("zh-CN");
  } catch {
    return iso;
  }
}
