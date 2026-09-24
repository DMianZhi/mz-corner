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
import { asText, SchemaForm } from './SchemaForm';
import { clearDraft, getDraft } from './draftStore';
import { resolveSelection } from './selection';
import { SaveDock } from './SaveDock';
import { useCtrlS } from './useCtrlS';
import { useDocumentDraft } from './useDocumentDraft';
import { useSaveAction } from './useSaveAction';
import { Badge, EmptyState, FieldValue, Icon, Kicker, Rail, RailItem, TextInput } from './ui';

function CommentDetail(props: {
  document: ContentDocument;
  fields: ContentField[];
  /** 关联文章的标题（拿不到时回退显示 id） */
  articleTitle: string;
  onSaved: () => Promise<void>;
  onDeleted: () => Promise<void>;
  onAuthLost: () => void;
}) {
  const draft = useDocumentDraft({
    collection: 'comments',
    document: props.document,
    fields: props.fields,
  });

  const { saving, run: save } = useSaveAction({
    fields: props.fields,
    values: draft.values,
    setErrors: draft.setErrors,
    onAuthLost: props.onAuthLost,
    save: async () => {
      await updateContent('comments', props.document._id, draft.values);
      clearDraft('comments', props.document._id);
    },
    successMessage: '已保存',
    onSuccess: props.onSaved,
  });

  // Ctrl/Cmd+S：与文章编辑器一致，四个面板都能手不离键盘保存（审计 P4）
  useCtrlS({ onSave: () => void save(), disabled: saving });

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
        value={asText(draft.values.author)}
        big
        placeholder="昵称"
        onChange={(next) => draft.update('author', next)}
      />

      <div className="adm-dmeta">
        <span>{asText(draft.values.createTime) || '未记录时间'}</span>
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
        {draft.dirty ? <Badge tone="brand">未保存</Badge> : null}
      </div>

      {/* 关联文章不给编辑框：手填外键极易造出悬空评论，
          而且「这条评论属于哪篇文章」上面元信息行已经给了可点标题。
          要改关联，正确做法是删掉重发（评论本来也来自读者）。 */}
      <SchemaForm
        fields={props.fields}
        values={draft.values}
        errors={draft.errors}
        onChange={draft.update}
        exclude={['author', 'articleId']}
      />

      <FieldValue label="ID">
        <span className="font-mono-site" style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
          {props.document._id}
        </span>
      </FieldValue>

      <SaveDock dirty={draft.dirty} saving={saving} onSave={save} onDelete={remove} />
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
  const selected = resolveSelection(ordered, selectedId);

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
