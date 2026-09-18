import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@wps365-open/appbase-js";
import type { DocComment } from "./types";

const TABLE = "doc_comment";

export function useComments(projectId: string, pageId: string) {
  const [comments, setComments] = useState<DocComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef(createClient({ projectId }));

  const db = clientRef.current;

  const fetchComments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await db
        .from(TABLE)
        .select()
        .eq("page_id", pageId)
        .order("create_at", { ascending: false });
      if (err) throw new Error(err.message);
      setComments((data as unknown as { rows: DocComment[] })?.rows ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [db, pageId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const addComment = useCallback(
    async (content: string, authorName: string, authorAvatar: string) => {
      const { error: err } = await db.from(TABLE).insert({
        page_id: pageId,
        content,
        author_name: authorName,
        author_avatar: authorAvatar,
      });
      if (err) throw new Error(err.message);
      await fetchComments();
    },
    [db, pageId, fetchComments],
  );

  const deleteComment = useCallback(
    async (commentId: string) => {
      const { error: err } = await db
        .from(TABLE)
        .delete()
        .eq("_id", commentId);
      if (err) throw new Error(err.message);
      await fetchComments();
    },
    [db, fetchComments],
  );

  return { comments, loading, error, addComment, deleteComment, refresh: fetchComments };
}
