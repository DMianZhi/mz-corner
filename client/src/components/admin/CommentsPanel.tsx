// 评论审核面板：左索引（评论正文首行）+ 右详情。
//
// 只支持「改 / 删」不支持「新建」：评论来自读者，后台凭空造一条没有意义，
// 而且 comments 的 articleId 是必填外键，手填容易造出悬空评论。
//
// 索引栏用**正文**而不是昵称做标题：审核时真正要判断的是内容，
// 昵称与时间放在右侧元信息行里，不占用索引栏那一行宽度。
import { useState } from 'react';
import { toast } from 'sonner';
import {
  deleteContent,
  updateContent,
  type ContentDocument,
  type ContentField,
} from '@/services/admin-api';
import { asText, focusFirstError, SchemaForm, validateValues, type FieldErrors } from './SchemaForm';
import { clearDraft, getDraft, setDraft, subscribeDrafts } from './draftStore';
import { mapLabelErrorsToFields as mapErrors } from './SchemaForm';
import { useEffect } from 'react';
import {
  Badge,
  Button,
  DangerConfirm,
  EmptyState,
  FieldValue,
  Icon,
  Kicker,
  Rail,
  RailItem,
  TextInput,
} from './ui';

function CommentDetail(props: {
  document: ContentDocument;
  fields: ContentField[];
  /** 关联文章的标题（拿不到时回退显示 id） */
  articleTitle: string;
  onSaved: () => Promise<void>;
  onDeleted: () => Promise<void>;
  onAuthLost: () => void;
}) {
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    // 草稿优先（P0-1）：上次没保存就离开时，恢复它而不是静默显示已保存值
    const draft = getDraft('comments', props.document._id);
    const base: Record<string, unknown> = {};
    for (const field of props.fields) base[field.name] = props.document[field.name];
    return draft ? draft.values : base;
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  // draftStore 变化时重渲（dirty 由此推导，RailItem 的草稿点也靠它）
  const [, forceRender] = useState(0);
  useEffect(() => subscribeDrafts(() => forceRender((n) => n + 1)), []);


  // dirty 从草稿推导（订阅在上面）；本地保存后 clearDraft 自动复位
  const dirty = getDraft('comments', props.document._id) !== null;

  // 副作用留在 updater 之外：updater 在 React 渲染期执行，里面写草稿会同步通知订阅方改状态
  const update = (name: string, value: unknown) => {
    const next = { ...values, [name]: value };
    setValues(next);
    setDraft('comments', props.document._id, next);
    if (name in errors) {
      const cleared: FieldErrors = { ...errors };
      delete cleared[name];
      setErrors(cleared);
    }
  };

  const save = async () => {
    // 客户端先行校验；服务端错误按 label 映射到字段（P2-4）
    const clientErrors = validateValues(props.fields, values);
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      focusFirstError(props.fields, clientErrors);
      toast.error(`保存失败，有 ${Object.keys(clientErrors).length} 处需要修正`);
      return;
    }
    setSaving(true);
    try {
      await updateContent('comments', props.document._id, values);
      clearDraft('comments', props.document._id);
      setErrors({});
      toast.success('已保存');
      await props.onSaved();
    } catch (error) {
      if (error instanceof Error && error.name === 'Unauthorized') {
        props.onAuthLost();
        return;
      }
      const message = error instanceof Error ? error.message : '保存失败';
      const labelErrors = mapErrors(props.fields, message);
      if (labelErrors) {
        setErrors(labelErrors);
        focusFirstError(props.fields, labelErrors);
        toast.error(`保存失败，有 ${Object.keys(labelErrors).length} 处需要修正`);
      } else {
        toast.error(message);
      }
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      await deleteContent('comments', props.document._id);
      toast.success('已删除');
      await props.onDeleted();
    } catch (error) {
      if (error instanceof Error && error.name === 'Unauthorized') {
        props.onAuthLost();
        return;
      }
      toast.error(error instanceof Error ? error.message : '删除失败');
    }
  };

  const articleId = asText(props.document.articleId);

  return (
    <div className="adm-detail">
      <Kicker num="06" label="COMMENTS" />

      <TextInput
        value={asText(values.author)}
        big
        placeholder="昵称"
        onChange={(next) => update('author', next)}
      />

      <div className="adm-dmeta">
        <span>{asText(values.createTime) || '未记录时间'}</span>
        <span>
          来自{' '}
          {props.articleTitle ? (
            <a
              href={`#/post/${articleId}`}
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--brand)', textDecoration: 'none' }}
            >
              {props.articleTitle}
            </a>
          ) : (
            <span className="font-mono-site">{articleId}</span>
          )}
        </span>
      </div>

      <div className="adm-sec">
        <span className="label-site">字段</span>
        <hr className="adm-divider" style={{ flex: 1 }} />
        {dirty ? <Badge tone="brand">未保存</Badge> : null}
      </div>

      {/* 关联文章不给编辑框：手填外键极易造出悬空评论，
          而且「这条评论属于哪篇文章」上面元信息行已经给了可点标题。
          要改关联，正确做法是删掉重发（评论本来也来自读者）。 */}
      <SchemaForm
        fields={props.fields}
        values={values}
        errors={errors}
        onChange={update}
        exclude={['author', 'articleId']}
      />

      <FieldValue label="ID">
        <span className="font-mono-site" style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
          {props.document._id}
        </span>
      </FieldValue>

      <div className="adm-dock">
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
        <span className="adm-dock-sep" />
        <DangerConfirm size="sm" label="删除" confirmLabel="确认删除" onConfirm={remove} />
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
  onAuthLost: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // 时间倒序：最新评论在最上面，审核时不用翻页
  const ordered = [...props.documents].sort((a, b) =>
    asText(b.createTime).localeCompare(asText(a.createTime)),
  );
  // 未选中时默认落到第一条：切标签后右栏不该是一片空白（demo B 的行为）
  const selected = ordered.find((doc) => doc._id === selectedId) ?? ordered[0] ?? null;

  return (
    <div className="adm-workbench">
      <Rail title="评论" count={props.documents.length}>
        {ordered.map((doc, index) => (
          <RailItem
            key={doc._id}
            index={index + 1}
            title={asText(doc.content) || '(空评论)'}
            // 同 ProjectsPanel：首屏用解析后的 selected 判定，否则一行都不亮
            selected={doc._id === selected?._id}
            pending={getDraft('comments', doc._id) !== null}
            onSelect={() => setSelectedId(doc._id)}
          />
        ))}
      </Rail>

      <section className="adm-pane">
        {selected ? (
          <CommentDetail
            key={selected._id}
            document={selected}
            fields={props.fields}
            articleTitle={props.articleTitles[asText(selected.articleId)] ?? ''}
            onSaved={props.onReload}
            onAuthLost={props.onAuthLost}
            onDeleted={async () => {
              setSelectedId(null);
              await props.onReload();
            }}
          />
        ) : (
          <EmptyState
            icon={<Icon.Comment size={18} />}
            title="还没有评论"
            hint="读者留言会出现在这里；可以修正错别字或删掉垃圾评论，删除不可撤销。"
          />
        )}
      </section>
    </div>
  );
}
