// 文章类型定义
export interface Article {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  publishDate: string;
  summary: string;
  viewCount: number;
  status: '已发布' | '草稿';
}

// 评论类型定义
export interface Comment {
  id: string;
  articleId: string;
  author: string;
  email: string;
  content: string;
  createTime: string;
}

// 文章列表项（用于列表展示）
export interface ArticleListItem {
  id: string;
  title: string;
  summary: string;
  category: string;
  tags: string[];
  publishDate: string;
  viewCount: number;
}

// 分类统计
export interface CategoryStats {
  name: string;
  count: number;
}

// 标签统计
export interface TagStats {
  name: string;
  count: number;
}

// 归档数据
export interface ArchiveData {
  year: number;
  months: {
    month: number;
    articles: ArticleListItem[];
  }[];
}

// 分页数据
export interface PaginatedData<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// 项目（项目导向首页核心）
export interface Project {
  id: string;
  name: string;
  tagline: string;
  description: string;
  tech: string[];
  link: string;
  color: string;
  symbol: string;
  order: number;
  status: 'live' | 'wip' | 'archived' | string;
}

/** 站点配置（多维表「站点配置」表驱动） */
export interface SiteConfig {
  name: string;
  nameEn: string;
  role: string;
  location: string;
  email: string;
  bio: string;
  skills: string[];
  github: string;
  twitter: string;
  footerNote: string;
}
