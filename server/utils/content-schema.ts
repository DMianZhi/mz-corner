/**
 * 管理端「内容白名单」：定义四类内容各允许写哪些字段、什么类型、什么取值范围。
 *
 * 为什么必须有这一层：通用内容路由 `PATCH /api/admin/content/:collection/:id` 如果直接把
 * 请求体透传给数据库，等于给任何拿到会话的人开放「任意字段写」——包括改 `_id`（主键）、
 * 塞进前台不认识的字段、把 `viewCount` 改成 99999。所以写入前一律过这里。
 *
 * 同时它也是**前端表单的单一事实源**：`GET /api/admin/content` 把字段元数据（name/label/
 * type/enum）发给前端，前端据此渲染表单，避免前后端各维护一份字段清单后逐渐漂移。
 */

/** 字段类型：text 与 string 同为数値类型，区别仅在表单渲染成多行文本域 */
export type FieldType = 'string' | 'text' | 'number' | 'string[]' | 'enum';

export interface FieldSpec {
  name: string;
  label: string;
  type: FieldType;
  /** 创建时必填（局部更新时不校验「缺失」，但显式写空值仍会被拒） */
  required?: boolean;
  /** 字符串最大长度 / 数组最大项数 */
  max?: number;
  /** 字符串数组单项最大长度 */
  itemMax?: number;
  /** type=enum 时的合法取值 */
  enumValues?: string[];
  /** 表单辅助说明 */
  hint?: string;
}

export interface CollectionSchema {
  name: string;
  label: string;
  fields: FieldSpec[];
}

const ARTICLE_FIELDS: FieldSpec[] = [
  { name: 'title', label: '标题', type: 'string', required: true, max: 200 },
  { name: 'summary', label: '摘要', type: 'text', max: 500, hint: '列表页展示，留空则截取正文' },
  { name: 'category', label: '分类', type: 'string', max: 60 },
  { name: 'tags', label: '标签', type: 'string[]', max: 20, itemMax: 40 },
  { name: 'publishDate', label: '发布日期', type: 'string', max: 30, hint: 'YYYY-MM-DD 或 YYYY/MM/DD' },
  {
    name: 'status',
    label: '状态',
    type: 'enum',
    enumValues: ['published', 'draft'],
    hint: '草稿不会出现在前台',
  },
  { name: 'content', label: '正文', type: 'text', max: 200000, hint: 'Markdown' },
];

const PROJECT_FIELDS: FieldSpec[] = [
  { name: 'name', label: '名称', type: 'string', required: true, max: 100 },
  { name: 'tagline', label: '一句话简介', type: 'string', max: 160 },
  { name: 'description', label: '描述', type: 'text', max: 2000 },
  { name: 'tech', label: '技术栈', type: 'string[]', max: 20, itemMax: 40 },
  { name: 'link', label: '链接', type: 'string', max: 500 },
  { name: 'color', label: '标志色', type: 'string', max: 20, hint: '十六进制，如 #C8F542' },
  { name: 'symbol', label: '符号', type: 'string', max: 8 },
  { name: 'order', label: '排序', type: 'number', hint: '数字越小越靠前' },
  {
    name: 'status',
    label: '状态',
    type: 'enum',
    enumValues: ['live', 'wip', 'archived'],
  },
];

const COMMENT_FIELDS: FieldSpec[] = [
  { name: 'articleId', label: '关联文章', type: 'string', required: true, max: 80 },
  { name: 'author', label: '昵称', type: 'string', required: true, max: 60 },
  { name: 'email', label: '邮箱', type: 'string', max: 120 },
  { name: 'content', label: '内容', type: 'text', required: true, max: 2000 },
  { name: 'createTime', label: '时间', type: 'string', max: 30 },
];

const SITE_CONFIG_FIELDS: FieldSpec[] = [
  { name: 'key', label: '键名', type: 'string', required: true, max: 60 },
  { name: 'value', label: '值', type: 'text', max: 5000 },
  { name: 'group', label: '分组', type: 'string', max: 40 },
  { name: 'description', label: '说明', type: 'string', max: 200 },
];

/**
 * 四类内容的 schema。
 *
 * 用普通对象字面量而非 Map：路由参数是外部字符串，用 `hasOwnProperty` 判定可天然挡住
 * `constructor` / `__proto__` 这类原型链键，不会误判为「存在的集合」。
 */
export const CONTENT_SCHEMA: Record<string, CollectionSchema> = {
  articles: { name: 'articles', label: '文章', fields: ARTICLE_FIELDS },
  projects: { name: 'projects', label: '项目', fields: PROJECT_FIELDS },
  comments: { name: 'comments', label: '评论', fields: COMMENT_FIELDS },
  site_config: { name: 'site_config', label: '站点设置', fields: SITE_CONFIG_FIELDS },
};

/** 全部内容集合名（顺序即前端标签顺序） */
export const CONTENT_COLLECTIONS = ['articles', 'projects', 'comments', 'site_config'] as const;

export type ContentCollection = (typeof CONTENT_COLLECTIONS)[number];

export function getContentSchema(name: unknown): CollectionSchema | null {
  if (typeof name !== 'string' || !name) return null;
  if (!Object.prototype.hasOwnProperty.call(CONTENT_SCHEMA, name)) return null;
  return CONTENT_SCHEMA[name];
}

/** 供 `GET /api/admin/content` 输出，前端据此驱动表单 */
export function schemaManifest(): CollectionSchema[] {
  return CONTENT_COLLECTIONS.map((name) => CONTENT_SCHEMA[name]);
}

export type SanitizeResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string };

/**
 * 按白名单清洗并校验写入字段。
 *
 * - 白名单外的字段**静默丢弃**（不报错）：前端表单可能带上 `id`、`group` 之类的展示字段，
 *   为此报错会让「保存」变得脆弱；而真正越权的字段（`_id`）丢掉就等于没写
 * - `partial: true`（更新）跳过「缺失必填」检查，但**显式写空值仍会被拒**——
 *   否则一次误操作就能把标题清空
 * - 显式 `null` 视为清空：字符串→`''`、数组→`[]`、数字→跳过（表单未填数字时不该报错）
 */
export function sanitizeContentFields(
  collection: unknown,
  input: unknown,
  options: { partial?: boolean } = {},
): SanitizeResult {
  const schema = getContentSchema(collection);
  if (!schema) return { ok: false, error: `未知内容集合：${String(collection)}` };

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: '请求体必须是 JSON 对象' };
  }
  const source = input as Record<string, unknown>;
  const partial = options.partial === true;
  const data: Record<string, unknown> = {};

  for (const field of schema.fields) {
    if (!Object.prototype.hasOwnProperty.call(source, field.name)) {
      if (!partial && field.required) return { ok: false, error: `${field.label}不能为空` };
      continue;
    }
    const raw = source[field.name];

    if (raw === null || raw === undefined) {
      if (field.type === 'string' || field.type === 'text') {
        if (field.required) return { ok: false, error: `${field.label}不能为空` };
        data[field.name] = '';
      } else if (field.type === 'string[]') {
        data[field.name] = [];
      }
      // number / enum 显式 null：跳过，不写入（表单未填数字时不该报错）
      continue;
    }

    switch (field.type) {
      case 'string':
      case 'text': {
        if (typeof raw !== 'string') return { ok: false, error: `${field.label}必须是文本` };
        const value = raw.trim();
        if (field.required && !value) return { ok: false, error: `${field.label}不能为空` };
        if (field.max && value.length > field.max) {
          return { ok: false, error: `${field.label}长度不能超过 ${field.max} 字` };
        }
        data[field.name] = value;
        break;
      }

      case 'number': {
        const value =
          typeof raw === 'number'
            ? raw
            : typeof raw === 'string' && raw.trim() !== ''
              ? Number(raw)
              : Number.NaN;
        if (!Number.isFinite(value)) return { ok: false, error: `${field.label}必须是数字` };
        data[field.name] = value;
        break;
      }

      case 'enum': {
        const allowed = field.enumValues ?? [];
        if (typeof raw !== 'string' || !allowed.includes(raw)) {
          return { ok: false, error: `${field.label}取值不合法（可选：${allowed.join(' / ')}）` };
        }
        data[field.name] = raw;
        break;
      }

      case 'string[]': {
        // 表单里常以逗号分隔文本提交，这里一并接受，减少前端转换逻辑
        const list: unknown[] = Array.isArray(raw)
          ? raw
          : typeof raw === 'string'
            ? raw.split(',')
            : [];
        if (!Array.isArray(raw) && typeof raw !== 'string') {
          return { ok: false, error: `${field.label}必须是数组或逗号分隔文本` };
        }
        const items: string[] = [];
        for (const item of list) {
          if (typeof item !== 'string') return { ok: false, error: `${field.label}的每一项必须是文本` };
          const trimmed = item.trim();
          if (!trimmed) continue;
          if (field.itemMax && trimmed.length > field.itemMax) {
            return { ok: false, error: `${field.label}的单项长度不能超过 ${field.itemMax} 字` };
          }
          items.push(trimmed);
        }
        if (field.max && items.length > field.max) {
          return { ok: false, error: `${field.label}最多 ${field.max} 项` };
        }
        data[field.name] = items;
        break;
      }
    }
  }

  return { ok: true, data };
}
