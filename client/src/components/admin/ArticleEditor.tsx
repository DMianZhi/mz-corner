// 文章编辑器（方案 B：全页沉浸 + 浮动工具条）。
//
// 布局取舍：标题、元信息、正文分三层，正文区占满剩余视口高度；
// 模式切换（编辑 / 分屏 / 预览）放在**浮动 dock** 里而不是页头，
// 因为它属于「写作时的手部动作」，贴着视线下方比回到顶部找按钮顺手。
//
// 已知坑（demo 阶段踩过）：dock 是 fixed 定位，会盖住正文最后几行 ——
// 内容区必须留出底部内边距（.adm-editor-body 的 padding-bottom）。
import { useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Markdown } from '@/components/Markdown';
import {
  updateContent,
  type ContentDocument,
  type ContentField,
} from '@/services/admin-api';
import { asText, SchemaForm } from './SchemaForm';
import { Badge, Button, Icon, MonoLabel, TextInput } from './ui';

type EditorMode = 'edit' | 'split' | 'preview';

const MODES: Array<{ value: EditorMode; label: string; icon: ReactNode }> = [
  { value: 'edit', label: '编辑', icon: <Icon.Pencil size={14} /> },
  { value: 'split', label: '分屏', icon: <Icon.Split size={14} /> },
  { value: 'preview', label: '预览', icon: <Icon.Eye size={14} /> },
];

/** 从文档抽出可编辑字段的当前值（其余系统字段如 viewCount 不参与编辑） */
function pickValues(fields: ContentField[], document: ContentDocument): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const field of fields) values[field.name] = document[field.name];
  return values;
}

export function ArticleEditor(props: {
  article: ContentDocument;
  fields: ContentField[];
  onSaved: () => void;
  onBack: () => void;
}) {
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    pickValues(props.fields, props.article),
  );
  const [mode, setMode] = useState<EditorMode>('edit');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // 切换文章时重置草稿：否则会把上一篇的未保存内容带到下一篇
  useEffect(() => {
    setValues(pickValues(props.fields, props.article));
    setMode('edit');
    setDirty(false);
  }, [props.article, props.fields]);

  const update = (name: string, value: unknown) => {
    setValues((current) => ({ ...current, [name]: value }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await updateContent('articles', props.article._id, values);
      setDirty(false);
      toast.success('已保存');
      props.onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const status = asText(values.status);
  const title = asText(values.title);
  const content = asText(values.content);

  return (
    <div className="adm-editor-body adm-fade">
      {/* 页头：返回 + 面包屑 + 站点预览入口 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '4px 0 20px',
        }}
      >
        <Button size="sm" variant="quiet" icon={<Icon.ArrowLeft size={14} />} onClick={props.onBack}>
          返回列表
        </Button>
        <MonoLabel style={{ letterSpacing: '0.1em' }}>
          {status === 'published' ? '已发布' : '草稿'}
        </MonoLabel>
        {dirty ? <Badge tone="brand">未保存</Badge> : null}
        <span style={{ flex: 1 }} />
        {status === 'published' ? (
          <a
            className="adm-btn adm-btn--sm"
            href={`#/post/${props.article._id}`}
            target="_blank"
            rel="noreferrer"
            style={{ textDecoration: 'none' }}
          >
            <Icon.ExternalLink size={14} />
            在站点查看
          </a>
        ) : null}
      </div>

      {/* 标题 */}
      <TextInput value={title} big onChange={(next) => update('title', next)} placeholder="文章标题" />

      {/* 元信息 */}
      <div style={{ marginTop: 20 }}>
        <SchemaForm
          fields={props.fields}
          values={values}
          onChange={update}
          exclude={['title', 'content']}
        />
      </div>

      {/* 正文：标题与正文之间用一条细分隔线收束，避免元信息与正文视觉粘连 */}
      <div style={{ marginTop: 26, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="label-site">正文</span>
        <hr className="adm-divider" style={{ flex: 1 }} />
        <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>Markdown</span>
      </div>

      {mode === 'edit' ? (
        <textarea
          className="adm-textarea adm-textarea--code"
          value={content}
          spellCheck={false}
          placeholder="在此写正文…"
          onChange={(event) => update('content', event.target.value)}
        />
      ) : mode === 'split' ? (
        <div className="adm-split">
          <textarea
            className="adm-textarea adm-pane-input"
            value={content}
            spellCheck={false}
            placeholder="在此写正文…"
            onChange={(event) => update('content', event.target.value)}
          />
          <div className="adm-preview adm-scroll">
            {content.trim() ? (
              <Markdown source={content} />
            ) : (
              <span style={{ color: 'var(--text-3)', fontSize: 13 }}>左侧输入后，这里实时预览</span>
            )}
          </div>
        </div>
      ) : (
        <div className="adm-card adm-preview adm-scroll" style={{ minHeight: '58vh' }}>
          {content.trim() ? (
            <Markdown source={content} />
          ) : (
            <span style={{ color: 'var(--text-3)', fontSize: 13 }}>正文为空</span>
          )}
        </div>
      )}

      {/* 浮动工具条 */}
      <div className="adm-dock">
        {MODES.map((item) => (
          <button
            key={item.value}
            type="button"
            className="adm-tab"
            aria-selected={mode === item.value}
            onClick={() => setMode(item.value)}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
        <span className="adm-dock-sep" />
        <span
          className="label-site"
          style={{ padding: '0 8px', minWidth: 62, textAlign: 'center' }}
        >
          {dirty ? '有改动' : '已同步'}
        </span>
        <Button
          variant="primary"
          size="sm"
          icon={<Icon.Save size={14} />}
          loading={saving}
          disabled={!dirty}
          onClick={save}
        >
          保存
        </Button>
      </div>
    </div>
  );
}

/** 新建文章：先落一条最小合法文档，再交给编辑器（避免空表单提交被白名单拒） */
export function blankArticleDraft(fields: ContentField[]): Record<string, unknown> {
  const draft: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.type === 'string[]') draft[field.name] = [];
    else if (field.type === 'enum') draft[field.name] = field.enumValues?.[0] ?? '';
    else if (field.type === 'number') draft[field.name] = 0;
    else draft[field.name] = '';
  }
  draft.title = '未命名文章';
  draft.status = 'draft';
  draft.content = '';
  return draft;
}
