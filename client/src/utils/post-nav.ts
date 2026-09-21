import type { ArticleListItem } from '@/types/blog';

export interface AdjacentArticles {
  /** 上一篇 = 列表中靠上的一条（更新）；最新一篇时为 null */
  prev: ArticleListItem | null;
  /** 下一篇 = 靠下的一条（更早）；最旧一篇时为 null */
  next: ArticleListItem | null;
}

/**
 * 取相邻篇。
 *
 * 顺序与 /articles 列表完全一致（publishDate 倒序），所以「列表里看到的顺序」
 * 和「文章页翻页顺序」永远同源，不会出现两处不一致。
 *
 * 边界：最新一篇没有上一篇、最旧一篇没有下一篇、id 不在列表中（或列表为空）
 * 时两侧均为 null —— 调用方据此决定隐藏哪一侧、甚至整块隐藏。
 */
export function adjacentOf(list: ArticleListItem[], id: string): AdjacentArticles {
  const i = list.findIndex((a) => a.id === id);
  return {
    prev: i > 0 ? list[i - 1] : null,
    next: i >= 0 && i < list.length - 1 ? list[i + 1] : null,
  };
}
