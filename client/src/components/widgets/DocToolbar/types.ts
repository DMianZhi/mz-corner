export interface DocComment {
  _id: string;
  page_id: string;
  content: string;
  author_name: string;
  author_avatar: string;
  create_id: string;
  create_at: string;
  update_at: string;
}

export interface DocToolbarProps {
  projectId: string;
  pageId?: string;
  features?: ("comment" | "presentation")[];
  position?: "bottom-right" | "bottom-left" | "top-right" | "top-left";
  className?: string;
}
