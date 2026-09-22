import { describe, expect, it } from 'vitest';
import {
  CONTENT_COLLECTIONS,
  getContentSchema,
  sanitizeContentFields,
  schemaManifest,
} from './content-schema';

describe('getContentSchema', () => {
  it('四类内容都有 schema', () => {
    for (const name of CONTENT_COLLECTIONS) {
      expect(getContentSchema(name)).not.toBeNull();
    }
  });

  it('未知集合返回 null', () => {
    expect(getContentSchema('users')).toBeNull();
    expect(getContentSchema('')).toBeNull();
    expect(getContentSchema('../etc/passwd')).toBeNull();
  });

  it('集合名覆盖四类内容', () => {
    expect([...CONTENT_COLLECTIONS].sort()).toEqual([
      'articles',
      'comments',
      'projects',
      'site_config',
    ]);
  });
});

describe('sanitizeContentFields — 白名单', () => {
  it('保留白名单字段', () => {
    const result = sanitizeContentFields('articles', {
      title: '标题',
      content: '正文',
      status: 'draft',
    });
    expect(result).toEqual({
      ok: true,
      data: { title: '标题', content: '正文', status: 'draft' },
    });
  });

  it('丢弃未知字段，不报错', () => {
    const result = sanitizeContentFields('articles', {
      title: '标题',
      evil: 'rm -rf',
      viewCount: 999,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ title: '标题' });
      expect('evil' in result.data).toBe(false);
      expect('viewCount' in result.data).toBe(false);
    }
  });

  it('丢弃 _id 等系统字段（防越权改主键）', () => {
    const result = sanitizeContentFields('projects', {
      _id: 'hacked',
      name: '项目',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect('_id' in result.data).toBe(false);
  });

  it('空对象在 partial 模式下合法（无字段可改）', () => {
    const result = sanitizeContentFields('articles', {}, { partial: true });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual({});
  });
});

describe('sanitizeContentFields — 必填', () => {
  it('创建时缺必填字段报错', () => {
    const result = sanitizeContentFields('articles', { content: '只有正文' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('标题');
  });

  it('必填字段为空字符串报错', () => {
    const result = sanitizeContentFields('comments', {
      articleId: 'art-01',
      author: '   ',
      content: '内容',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('昵称');
  });

  it('partial 模式跳过必填检查（局部更新）', () => {
    const result = sanitizeContentFields('articles', { status: 'draft' }, { partial: true });
    expect(result.ok).toBe(true);
  });
});

describe('sanitizeContentFields — 类型与取值', () => {
  it('字符串字段收到数字报错', () => {
    const result = sanitizeContentFields('articles', { title: 123 }, { partial: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('标题');
  });

  it('数字字段接受数字字符串并归一为数字', () => {
    const result = sanitizeContentFields('projects', { order: '3' }, { partial: true });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.order).toBe(3);
  });

  it('数字字段收到非数字报错', () => {
    const result = sanitizeContentFields('projects', { order: 'abc' }, { partial: true });
    expect(result.ok).toBe(false);
  });

  it('枚举越界报错', () => {
    const result = sanitizeContentFields('articles', { status: 'deleted' }, { partial: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('状态');
  });

  it('枚举合法值通过', () => {
    const result = sanitizeContentFields('articles', { status: 'published' }, { partial: true });
    expect(result.ok).toBe(true);
  });

  it('超长字符串报错', () => {
    const result = sanitizeContentFields(
      'articles',
      { title: 'x'.repeat(201) },
      { partial: true },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('长度');
  });

  it('字符串数组：接受数组并清洗空白项', () => {
    const result = sanitizeContentFields(
      'articles',
      { tags: [' Vue ', '', '  ', 'Node'] },
      { partial: true },
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.tags).toEqual(['Vue', 'Node']);
  });

  it('字符串数组：接受逗号分隔字符串（表单输入友好）', () => {
    const result = sanitizeContentFields(
      'articles',
      { tags: 'Vue, Node ,React' },
      { partial: true },
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.tags).toEqual(['Vue', 'Node', 'React']);
  });

  it('字符串数组：元素类型不符报错', () => {
    const result = sanitizeContentFields('articles', { tags: [1, 2] }, { partial: true });
    expect(result.ok).toBe(false);
  });

  it('字符串数组：元素超长报错', () => {
    const result = sanitizeContentFields(
      'articles',
      { tags: ['x'.repeat(41)] },
      { partial: true },
    );
    expect(result.ok).toBe(false);
  });

  it('非对象输入报错', () => {
    expect(sanitizeContentFields('articles', 'not-an-object').ok).toBe(false);
    expect(sanitizeContentFields('articles', null).ok).toBe(false);
    expect(sanitizeContentFields('articles', ['a']).ok).toBe(false);
  });

  it('未知集合报错（而非静默放行）', () => {
    const result = sanitizeContentFields('users', { title: 'x' });
    expect(result.ok).toBe(false);
  });
});

describe('schemaManifest — 供前端表单驱动', () => {
  it('暴露字段元数据（name/label/type）', () => {
    const manifest = schemaManifest();
    const articles = manifest.find((item) => item.name === 'articles');
    expect(articles).toBeDefined();
    expect(articles?.label).toBe('文章');
    const title = articles?.fields.find((field) => field.name === 'title');
    expect(title).toMatchObject({ label: '标题', type: 'string', required: true });
  });

  it('站点设置字段含 key/value', () => {
    const config = schemaManifest().find((item) => item.name === 'site_config');
    const names = config?.fields.map((field) => field.name) ?? [];
    expect(names).toContain('key');
    expect(names).toContain('value');
  });

  it('不泄露内部实现细节（只含白名单字段）', () => {
    for (const collection of schemaManifest()) {
      for (const field of collection.fields) {
        expect(field.name.startsWith('_')).toBe(false);
      }
    }
  });
});
