// 文章编辑器（方案 B 的右栏详情，不是独立页面）。
//
// 布局取舍：kicker → 标题 → 等宽元信息行 → 字段行（发丝线分隔）→ 正文。
// 整页不滚，滚动由 .adm-pane 容器承担；正文 textarea 自动增高，
// 保证面板内只有一根滚动条 —— 内容长短变化时不会出现滚动条伸缩导致的横向抖动。
//
// 宽度策略：详情列铺满右栏（表单不该受阅读宽度约束，卡 720px 在宽屏下右侧空 880px）；
// 字段区两列网格，多行字段横跨两列。只有「预览」锁 --content-w 居中 ——
// 预览的意义就是「所见即线上」，宽度不跟站点一致就没有参考价值。
//
// 模式切换（编辑 / 分屏 / 预览）放在**浮动 dock** 里而不是面板顶部，
// 因为它属于「写作时的手部动作」，贴着视线下方比回到顶部找按钮顺手。
//
// 已知坑（demo 阶段踩过）：dock 是 fixed 定位，会盖住正文最后几行 ——
// .adm-detail 因此留了 132px 底部内边距。
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Markdown } from '@/components/Markdown';
import { updateContent, type ContentDocument, type ContentField } from '@/services/admin-api';
import { asText, SchemaForm } from './SchemaForm';
import { StatusText } from './status';
import { Badge, Button, FieldValue, Icon, Kicker, TextInput } from './ui';

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
  onSaved: () => Promise<void> | void;
  onAuthLost: () => void;
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
      await props.onSaved();
    } catch (error) {
      if (error instanceof Error && error.name === 'Unauthorized') {
        props.onAuthLost();
        return;
      }
      toast.error(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const status = asText(values.status);
  const title = asText(values.title);
  const content = asText(values.content);

  // 正文自动增高：textarea 若自带滚动，面板里就会同时存在两根滚动条，
  // 且内容长短变化时互相干扰。先置 auto 再按 scrollHeight 赋值，避免只增不减。
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, [content, mode]);

  // 切到分屏/预览时把正文区滚到视野顶部：
  // 详情列上方还有标题与一整组元信息字段，不滚的话「预览」按下去只看到表单，
  // 得手动往下拖才能看到正文 —— 这是实测中第一个会让人困惑的点。
  const bodySecRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (mode === 'edit') return;
    bodySecRef.current?.scrollIntoView({ block: 'start' });
  }, [mode]);

  const body = content.trim() ? (
    <Markdown source={content} />
  ) : (
    <span style={{ color: 'var(--text-3)', fontSize: 13 }}>
      {mode === 'split' ? '左侧输入后，这里实时预览' : '正文为空'}
    </span>
  );

  return (
    <div className={['adm-detail', mode === 'preview' ? 'adm-detail--measure' : ''].filter(Boolean).join(' ')}>
      <Kicker num="06" label="MANAGE" />

      <TextInput value={title} big onChange={(next) => update('title', next)} placeholder="文章标题" />

      <div className="adm-dmeta">
        <span>{asText(values.category) || '未分类'}</span>
        <span>{asText(values.publishDate) || '未设日期'}</span>
        <span>{asText(props.article.viewCount) || '0'} 次阅读</span>
        <StatusText value={status} />
        {status === 'published' ? (
          <a
            className="adm-link"
            href={`#/post/${props.article._id}`}
            target="_blank"
            rel="noreferrer"
            style={{ color: 'var(--brand)' }}
          >
            在站点查看
          </a>
        ) : null}
      </div>

      <div className="adm-sec">
        <span className="label-site">元信息</span>
        <hr className="adm-divider" style={{ flex: 1 }} />
        {dirty ? <Badge tone="brand">未保存</Badge> : null}
      </div>

      <SchemaForm
        fields={props.fields}
        values={values}
        onChange={update}
        exclude={['title', 'content']}
      />

      <div className="adm-sec" ref={bodySecRef}>
        <span className="label-site">正文</span>
        <hr className="adm-divider" style={{ flex: 1 }} />
        <span className="adm-sec-note">Markdown</span>
      </div>

      {mode === 'edit' ? (
        <textarea
          ref={taRef}
          className="adm-textarea adm-textarea--code"
          value={content}
          spellCheck={false}
          placeholder="在此写正文…"
          onChange={(event) => update('content', event.target.value)}
        />
      ) : mode === 'split' ? (
        <div className="adm-split">
          <textarea
            ref={taRef}
            className="adm-textarea adm-pane-input"
            value={content}
            spellCheck={false}
            placeholder="在此写正文…"
            onChange={(event) => update('content', event.target.value)}
          />
          {/* 分屏两栏都不自带滚动条：高度由内容撑开，滚动交给 .adm-pane，
              否则同一屏里会出现两根滚动条且互相干扰 */}
          <div className="adm-preview adm-scroll">{body}</div>
        </div>
      ) : (
        <div className="adm-card adm-preview" style={{ padding: '26px 30px' }}>
          {body}
        </div>
      )}

      <FieldValue label="ID">
        <span className="font-mono-site" style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
          {props.article._id}
        </span>
      </FieldValue>

      {/* 浮动工具条 */}
      <div className="adm-dock">
        {MODES.map((item) => (
          <button
            key={item.value}
            type="button"
            className="adm-dock-btn"
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
