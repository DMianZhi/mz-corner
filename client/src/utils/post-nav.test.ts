import { describe, expect, it } from 'vitest';
import type { ArticleListItem } from '@/types/blog';
import { adjacentOf } from './post-nav';

/** 只需 id 参与运算，其余字段与本用例无关 */
const L = (...ids: string[]) => ids.map((id) => ({ id }) as ArticleListItem);

describe('adjacentOf', () => {
  it('中间篇：两侧都有，上一篇更新、下一篇更早', () => {
    const { prev, next } = adjacentOf(L('art-23', 'art-22', 'art-21', 'art-20', 'art-19'), 'art-21');
    expect(prev?.id).toBe('art-22');
    expect(next?.id).toBe('art-20');
  });

  it('最新一篇：没有上一篇，只有下一篇', () => {
    const { prev, next } = adjacentOf(L('art-23', 'art-22', 'art-21'), 'art-23');
    expect(prev).toBeNull();
    expect(next?.id).toBe('art-22');
  });

  it('最旧一篇：没有下一篇，只有上一篇', () => {
    const { prev, next } = adjacentOf(L('art-23', 'art-22', 'art-21'), 'art-21');
    expect(prev?.id).toBe('art-22');
    expect(next).toBeNull();
  });

  it('只有一篇：两侧都为 null（导航整块隐藏）', () => {
    const { prev, next } = adjacentOf(L('art-23'), 'art-23');
    expect(prev).toBeNull();
    expect(next).toBeNull();
  });

  it('空列表：两侧都为 null，且不抛错', () => {
    const { prev, next } = adjacentOf([], 'art-20');
    expect(prev).toBeNull();
    expect(next).toBeNull();
  });

  it('id 不在列表中：两侧都为 null（不误把首篇当相邻篇）', () => {
    const { prev, next } = adjacentOf(L('art-23', 'art-22'), 'art-99');
    expect(prev).toBeNull();
    expect(next).toBeNull();
  });
});
