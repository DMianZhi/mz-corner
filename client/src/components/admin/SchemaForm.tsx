// 由服务端字段元数据驱动的表单。
//
// 项目 / 评论 / 站点设置三类内容直接复用本组件：字段清单来自
// `GET /api/admin/content`（即 server/utils/content-schema.ts 的白名单），
// 服务端加字段、改标签、改枚举，后台表单自动跟上，前端不需要同步改代码。
//
// 校验分层（审计 P2-5）：
//   客户端 —— 用服务端下发的同一份 schema（required/max/itemMax/type）在前端预检，
//             类型错误（日期格式、数字非法）拦截在提交前，不浪费一次往返；
//   服务端 —— 仍是唯一权威（前端校验只是体验优化，绕过 UI 的请求照样被拦）。
// 错误展示（审计 P2-4）：服务端错误文案是中文句子（如「标题不能为空」），
//   前端按「字段 label + 不能为空/超长」模式把句子映射回具体字段，
//   落成红框 + 字段下方文字 + 焦点滚动，而不是把整句丢进顶部 toast。
import type { ContentField } from '@/services/admin-api';
import { FieldRow, Select, TagInput, TextArea, TextInput } from './ui';

/** 枚举值的中文名（服务端存的是语义值，展示层翻译） */
const ENUM_LABELS: Record<string, string> = {
  published: '已发布',
  draft: '草稿',
  live: '在线',
  wip: '开发中',
  archived: '已归档',
};

export { ENUM_LABELS };

/** 字段名 → 错误文案（客户端校验与服务端错误映射共用） */
export type FieldErrors = Record<string, string>;

export function asText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

export function asList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

/** 新建时的空表单：枚举取第一项，其余取空值 */
export function emptyValues(fields: ContentField[]): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.type === 'string[]') values[field.name] = [];
    else if (field.type === 'enum') values[field.name] = field.enumValues?.[0] ?? '';
    else if (field.type === 'number') values[field.name] = 0;
    else values[field.name] = '';
  }
  return values;
}

/* ── 客户端校验 ─────────────────────────────────────────── */

/** 发布日期：YYYY-MM-DD 或 YYYY/MM/DD（与 hint 文案一致） */
const DATE_RE = /^\d{4}[-/]\d{2}[-/]\d{2}$/;

/**
 * 按服务端 schema 预检一份 values。
 * 返回「字段名 → 用户可读错误」；空对象 = 通过。
 * 只做前端能确定的：required / max / itemMax / number 可解析 / publishDate 格式。
 */
export function validateValues(
  fields: ContentField[],
  values: Record<string, unknown>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const raw = values[field.name];
    const text = asText(raw).trim();

    if (field.required && !text) {
      errors[field.name] = `${field.label}不能为空`;
      continue;
    }
    if (!text && field.type !== 'number') continue; // 空值且非必填，后续规则都不适用

    if (field.type === 'number') {
      // 数字字段：空串允许（服务端按 0 处理），非空必须可解析
      if (text && !/^-?\d+(\.\d+)?$/.test(text)) {
        errors[field.name] = `${field.label}必须是数字`;
      }
      continue;
    }
    if (field.name === 'publishDate' && text && !DATE_RE.test(text)) {
      errors[field.name] = '日期格式应为 YYYY-MM-DD';
      continue;
    }
    if (field.max && text.length > field.max) {
      errors[field.name] = `${field.label}不能超过 ${field.max} 字`;
    }
    if (field.type === 'string[]' && field.itemMax) {
      const list = asList(raw);
      const over = list.find((item) => item.length > field.itemMax!);
      if (over) errors[field.name] = `单个标签不能超过 ${field.itemMax} 字`;
    }
  }
  return errors;
}

/**
 * 保存失败后把用户带到第一个出错的字段（审计 P2-4）：
 * 滚动到该字段并聚焦，而不是只把错误丢在顶部 toast 里让人自己找。
 * 依赖控件上的 data-field（由 SchemaForm / 文章编辑器下发）。
 */
export function focusFirstError(
  fields: ContentField[],
  errors: Record<string, string>,
): void {
  const name = fields.find((field) => errors[field.name])?.name;
  if (!name) return;
  // 等红框渲染出来再滚动，视觉上「报错 → 定位」是连贯的一步
  requestAnimationFrame(() => {
    const marked = document.querySelector<HTMLElement>(`[data-field="${name}"]`);
    if (!marked) return;
    const row = marked.closest<HTMLElement>('.adm-fv') ?? marked;
    row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const target = marked.matches('input, textarea, select')
      ? marked
      : marked.querySelector<HTMLElement>('input, textarea, select, button');
    target?.focus({ preventScroll: true });
  });
}

/* ── 表单渲染 ───────────────────────────────────────────── */

export function SchemaForm(props: {
  fields: ContentField[];
  values: Record<string, unknown>;
  onChange: (name: string, value: unknown) => void;
  /** 字段名 → 错误文案（服务端错误映射 + 客户端预检结果，调用方合并后传入） */
  errors?: Record<string, string>;
  /** 网络请求已发出且失败时为 true：提示错误来自服务端，深表单场景帮用户定位 */
  showServerOrigin?: boolean;
  /** 由调用方自行渲染的字段（如文章编辑器的标题与正文） */
  exclude?: string[];
}) {
  const excluded = props.exclude ?? [];
  const visible = props.fields.filter((field) => !excluded.includes(field.name));

  return (
    // 两列网格：铺满右栏后单列会把「分类」这类短字段拉成一条 1300px 的长条
    <div className="adm-fields">
      {visible.map((field) => {
        const value = props.values[field.name];
        // 多行文本的标签与控件顶端对齐，否则标签会吊在文本框中间
        const multiline = field.type === 'text';
        return (
          <FieldRow
            key={field.name}
            label={field.label}
            hint={field.hint}
            required={field.required}
            top={multiline}
            error={props.errors?.[field.name]}
            fieldName={field.name}
          >
            {multiline ? (
              <TextArea
                value={asText(value)}
                rows={field.name === 'description' || field.name === 'content' ? 6 : 3}
                fieldName={field.name}
                onChange={(next) => props.onChange(field.name, next)}
              />
            ) : field.type === 'string[]' ? (
              <TagInput
                value={asList(value)}
                fieldName={field.name}
                onChange={(next) => props.onChange(field.name, next)}
                placeholder="输入后回车"
              />
            ) : field.type === 'enum' ? (
              <Select
                value={asText(value)}
                fieldName={field.name}
                options={(field.enumValues ?? []).map((item) => ({
                  value: item,
                  label: ENUM_LABELS[item] ?? item,
                }))}
                onChange={(next) => props.onChange(field.name, next)}
              />
            ) : field.type === 'number' ? (
              <TextInput
                value={asText(value)}
                monospace
                inputMode="decimal"
                fieldName={field.name}
                onChange={(next) => props.onChange(field.name, next)}
                placeholder="0"
              />
            ) : (
              <TextInput
                value={asText(value)}
                monospace={field.name === 'key' || field.name === 'color' || field.name === 'link'}
                fieldName={field.name}
                onChange={(next) => props.onChange(field.name, next)}
              />
            )}
          </FieldRow>
        );
      })}
    </div>
  );
}

/**
 * 服务端错误文案 → 字段错误映射（审计 P2-4）。
 * 服务端返回的是中文句子（「标题不能为空」），没有机器可读的字段名；
 * 按「以字段 label 开头」匹配。全库匹配失败返回 null，调用方退回 toast。
 */
export function mapLabelErrorsToFields(
  fields: ContentField[],
  message: string,
): FieldErrors | null {
  if (!message) return null;
  let matched: FieldErrors | null = null;
  for (const field of fields) {
    if (message.startsWith(field.label)) {
      matched = { [field.name]: message };
      break;
    }
  }
  return matched;
}
