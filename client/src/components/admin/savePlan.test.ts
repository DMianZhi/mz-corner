import { describe, expect, it } from 'vitest';
import type { ContentField } from '@/services/admin-api';
import { errorCount, planFailure, planSave } from './savePlan';

const FIELDS: ContentField[] = [
  { name: 'title', label: '标题', type: 'string', required: true, max: 5 },
  { name: 'order', label: '排序', type: 'number' },
  { name: 'publishDate', label: '发布日期', type: 'string' },
  { name: 'tags', label: '标签', type: 'string[]', itemMax: 3 },
];

const OK = { title: '短文', order: '3', publishDate: '2026-09-23', tags: ['a'] };

describe('planSave 客户端预检', () => {
  it('全部合法 → 放行', () => {
    expect(planSave({ fields: FIELDS, values: OK })).toEqual({ kind: 'proceed' });
  });

  it('必填为空 → 拦截，且文案带处数', () => {
    expect(planSave({ fields: FIELDS, values: { ...OK, title: '' } })).toEqual({
      kind: 'invalid',
      errors: { title: '标题不能为空' },
      message: '保存失败，有 1 处需要修正',
    });
  });

  it('超长 → 拦截', () => {
    expect(planSave({ fields: FIELDS, values: { ...OK, title: '一二三四五六' } })).toMatchObject({
      kind: 'invalid',
      errors: { title: '标题不能超过 5 字' },
    });
  });

  it('数字字段不可解析 → 拦截', () => {
    expect(planSave({ fields: FIELDS, values: { ...OK, order: 'abc' } })).toMatchObject({
      kind: 'invalid',
      errors: { order: '排序必须是数字' },
    });
  });

  it('日期格式非法 → 拦截', () => {
    expect(planSave({ fields: FIELDS, values: { ...OK, publishDate: '2026/9/3' } })).toMatchObject({
      kind: 'invalid',
      errors: { publishDate: '日期格式应为 YYYY-MM-DD' },
    });
  });

  // 注：这里必须用字符串形态。TagInput 产出的是数组，而 asText(数组) 返回 ''，
  // 导致 validateValues 在 `if (!text && type !== 'number') continue` 处就跳过了
  // —— 数组值字段的 max / itemMax 校验目前根本够不到（既有缺陷，不在本轮重构范围，
  // 已记入 SDD 台账 R6；修它属于可见行为变更，需单独立项）。
  it('单个标签超长 → 拦截', () => {
    expect(planSave({ fields: FIELDS, values: { ...OK, tags: 'abcd' } })).toMatchObject({
      kind: 'invalid',
      errors: { tags: '单个标签不能超过 3 字' },
    });
  });

  it('非必填留空 → 放行（空值不触发 max / 格式规则）', () => {
    expect(
      planSave({ fields: FIELDS, values: { title: '短文', order: '', publishDate: '', tags: [] } }),
    ).toEqual({ kind: 'proceed' });
  });
});

describe('planFailure 服务端错误归类', () => {
  it('401 → 退回登录门', () => {
    const error = new Error('UNAUTHORIZED');
    error.name = 'Unauthorized';
    expect(planFailure({ fields: FIELDS, error })).toEqual({ kind: 'auth-lost' });
  });

  it('401 优先于 label 匹配（消息恰以 label 开头也不误判）', () => {
    const error = new Error('标题不能为空');
    error.name = 'Unauthorized';
    expect(planFailure({ fields: FIELDS, error })).toEqual({ kind: 'auth-lost' });
  });

  it('中文句子以 label 开头 → 落到字段', () => {
    expect(planFailure({ fields: FIELDS, error: new Error('标题不能为空') })).toEqual({
      kind: 'field-errors',
      errors: { title: '标题不能为空' },
      message: '保存失败，有 1 处需要修正',
    });
  });

  it('匹配不到 label → 兜底 toast + 重试', () => {
    expect(planFailure({ fields: FIELDS, error: new Error('网关超时') })).toEqual({
      kind: 'retry',
      message: '网关超时',
    });
  });

  it('非 Error 抛出 → 兜底文案', () => {
    expect(planFailure({ fields: FIELDS, error: 'boom' })).toEqual({
      kind: 'retry',
      message: '保存失败',
    });
  });
});

describe('errorCount', () => {
  it('统计字段数', () => {
    expect(errorCount({ a: 'x', b: 'y' })).toBe(2);
    expect(errorCount({})).toBe(0);
  });
});
