// 评论审核面板：左列评论流，右列可编辑详情。
//
// 只支持「改 / 删」不支持「新建」：评论来自读者，后台凭空造一条没有意义，
// 而且 comments 的 articleId 是必填外键，手填容易造出悬空评论。
import { useState } from 'react';
import { toast } from 'sonner';
import {
  deleteContent,
  updateContent,
  type ContentDocument,
  type ContentField,
} from '@/services/admin-api';
import { asText, SchemaForm } from './SchemaForm';
import { Badge, Button, DangerConfirm, EmptyState, Icon, MonoLabel } from './ui';

function CommentForm(props: {
  document: ContentDocument;
  fields: ContentField[];
  /** 关联文章的标题（拿不到时回退显示 id） */
  articleTitle: string;
  onSaved: () => Promise<void>;
  onDeleted: () => Promise<void>;
}) {
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const initial: Record<string, unknown> = {};
    for (const field of props.fields) initial[field.name] = props.document[field.name];
    return initial;
  });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const update = (name: string, value: unknown) => {
    setValues((current) => ({ ...current, [name]: value }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await updateContent('comments', props.document._id, values);
      setDirty(false);
      toast.success('已保存');
      await props.onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="adm-card adm-fade" style={{ padding: 22 }}>
      <div className="adm-col-head" style={{ marginBottom: 18 }}>
        <span className="label-site">评论详情</span>
        <span style={{ flex: 1 }} />
        {dirty ? <Badge tone="brand">未保存</Badge> : null}
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

      <div style={{ marginBottom: 18 }}>
        <MonoLabel>来自文章</MonoLabel>
        <div style={{ fontSize: 13.5, marginTop: 4 }}>
          {props.articleTitle ? (
            <a
              href={`#/post/${asText(props.document.articleId)}`}
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--brand)', textDecoration: 'none' }}
            >
              {props.articleTitle}
            </a>
          ) : (
            <span style={{ color: 'var(--text-3)' }}>{asText(props.document.articleId)}</span>
          )}
        </div>
      </div>

      <SchemaForm fields={props.fields} values={values} onChange={update} />

      <hr className="adm-divider" style={{ margin: '22px 0 16px' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <MonoLabel>ID {props.document._id}</MonoLabel>
        <span style={{ flex: 1 }} />
        <DangerConfirm
          size="sm"
          label="删除评论"
          confirmLabel="确认删除"
          onConfirm={async () => {
            try {
              await deleteContent('comments', props.document._id);
              toast.success('已删除');
              await props.onDeleted();
            } catch (error) {
              toast.error(error instanceof Error ? error.message : '删除失败');
            }
          }}
        />
      </div>
    </div>
  );
}

export function CommentsPanel(props: {
  fields: ContentField[];
  documents: ContentDocument[];
  /** articleId → 文章标题，用于把外键翻译成人看得懂的东西 */
  articleTitles: Record<string, string>;
  onReload: () => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = props.documents.find((doc) => doc._id === selectedId) ?? null;

  // 时间倒序：最新评论在最上面，审核时不用翻页
  const ordered = [...props.documents].sort((a, b) =>
    asText(b.createTime).localeCompare(asText(a.createTime)),
  );

  return (
    <div className="adm-masterdetail">
      <div className="adm-list">
        <div className="adm-col-head">
          <span className="label-site">评论 · {props.documents.length}</span>
        </div>

        {ordered.length === 0 ? (
          <div className="adm-card">
            <EmptyState icon={<Icon.Comment size={18} />} title="还没有评论" />
          </div>
        ) : (
          ordered.map((doc) => (
            <button
              key={doc._id}
              type="button"
              className="adm-row"
              aria-current={doc._id === selectedId}
              onClick={() => setSelectedId(doc._id)}
              style={{ alignItems: 'flex-start' }}
            >
              <span style={{ flex: 1, minWidth: 0 }}>
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 8,
                    marginBottom: 4,
                  }}
                >
                  <span className="adm-row-title">{asText(doc.author) || '(匿名)'}</span>
                  <span className="adm-row-meta">{asText(doc.createTime)}</span>
                </span>
                <span
                  style={{
                    fontSize: 12.5,
                    lineHeight: 1.55,
                    color: 'var(--text-2)',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {asText(doc.content)}
                </span>
              </span>
            </button>
          ))
        )}
      </div>

      <div>
        {selected ? (
          <CommentForm
            key={selected._id}
            document={selected}
            fields={props.fields}
            articleTitle={props.articleTitles[asText(selected.articleId)] ?? ''}
            onSaved={props.onReload}
            onDeleted={async () => {
              setSelectedId(null);
              await props.onReload();
            }}
          />
        ) : (
          <div className="adm-card">
            <EmptyState
              icon={<Icon.Comment size={18} />}
              title="选择左侧评论进行编辑"
              hint="可以修正错别字或删掉垃圾评论。删除不可撤销。"
            />
          </div>
        )}
      </div>
    </div>
  );
}
