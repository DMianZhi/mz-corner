// 由服务端字段元数据驱动的表单。
//
// 项目 / 评论 / 站点设置三类内容直接复用本组件：字段清单来自
// `GET /api/admin/content`（即 server/utils/content-schema.ts 的白名单），
// 服务端加字段、改标签、改枚举，后台表单自动跟上，前端不需要同步改代码。
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

export function SchemaForm(props: {
  fields: ContentField[];
  values: Record<string, unknown>;
  onChange: (name: string, value: unknown) => void;
  /** 由调用方自行渲染的字段（如文章编辑器的标题与正文） */
  exclude?: string[];
}) {
  const excluded = props.exclude ?? [];
  const visible = props.fields.filter((field) => !excluded.includes(field.name));

  return (
    <div>
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
          >
            {multiline ? (
              <TextArea
                value={asText(value)}
                rows={field.name === 'description' || field.name === 'content' ? 6 : 3}
                onChange={(next) => props.onChange(field.name, next)}
              />
            ) : field.type === 'string[]' ? (
              <TagInput
                value={asList(value)}
                onChange={(next) => props.onChange(field.name, next)}
                placeholder="输入后回车"
              />
            ) : field.type === 'enum' ? (
              <Select
                value={asText(value)}
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
                onChange={(next) => props.onChange(field.name, next)}
                placeholder="0"
              />
            ) : (
              <TextInput
                value={asText(value)}
                monospace={field.name === 'key' || field.name === 'color' || field.name === 'link'}
                onChange={(next) => props.onChange(field.name, next)}
              />
            )}
          </FieldRow>
        );
      })}
    </div>
  );
}
