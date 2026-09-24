import { describe, expect, it } from 'vitest';
import { resolveSelection } from './selection';

const DOCS = [{ _id: 'a' }, { _id: 'b' }, { _id: 'c' }];

describe('resolveSelection', () => {
  it('选中项存在 → 返回它', () => {
    expect(resolveSelection(DOCS, 'b')).toEqual({ _id: 'b' });
  });

  it('未选中（null）→ 落到第一条', () => {
    expect(resolveSelection(DOCS, null)).toEqual({ _id: 'a' });
  });

  it('选中项已被删除（id 不在列表里）→ 落到第一条', () => {
    expect(resolveSelection(DOCS, 'gone')).toEqual({ _id: 'a' });
  });

  it('空列表 → null（面板据此渲染 EmptyState）', () => {
    expect(resolveSelection([], null)).toBeNull();
    expect(resolveSelection([], 'a')).toBeNull();
  });
});
