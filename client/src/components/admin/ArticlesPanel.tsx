// 文章面板：左索引 + 右详情（ArticleEditor）。
//
// 本轮（UX 审计修复）相对旧版的三处结构变化：
// 1. 新建不再立即写库（审计 P0-2：线上那条空「未命名文章」就是这么来的）——
//    先造一个 `local:` 前缀 id 的虚拟文档登记到 draftStore 的 pending 列表，
//    首次保存（ArticleEditor 的 onSaveNew）才 POST；「放弃」直接丢弃不产生任何数据。
// 2. 删除改用真正的 deleteContent（POST …/delete，网关原因走 POST）。
// 3. 左栏条目带 pending 草稿点（审计 P3），且刷新后选中位置可恢复。
import { useState } from 'react';
import { toast } from 'sonner';
import {
  createContent,
  deleteContent,
  type ContentDocument,
  type ContentField,
} from '@/services/admin-api';
import { ArticleEditor, blankArticleDraft } from './ArticleEditor';
import { asText } from './SchemaForm';
import { statusTone } from './status';
import {
  addPending,
  clearDraft,
  getDraft,
  isLocalId,
  listPending,
  newLocalId,
  removePending,
} from './draftStore';
import { EmptyState, Icon, LinkButton, Rail, RailItem } from './ui';

type ArticleFields = ContentField[];

/** 本地新建的虚拟文档在内存里的形态 */
type PendingArticle = Record<string, unknown> & { _id: string };

export function ArticlesPanel(props: {
  fields: ArticleFields;
  documents: ContentDocument[];
  onReload: () => Promise<void>;
  onAuthLost: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingList, setPendingList] = useState<PendingArticle[]>(() => listPending('articles'));
  const [creating, setCreating] = useState(false);

  // 文章索引按发布日期倒序（审计 P3）：之前是数据库自然顺序 —— 默认落在哪一条
  // 纯看运气，而列表里又没有日期列，人眼也判断不出顺序。空日期（含本地草稿）排最后。
  const ordered = [...props.documents].sort((a, b) => {
    const da = asText(a.publishDate);
    const db = asText(b.publishDate);
    if (da !== db) return db.localeCompare(da);
    return asText(b._id).localeCompare(asText(a._id));
  });

  // 本地草稿（未落库）排在真实文档后面，一样可以选中编辑
  const allDocs: ContentDocument[] = [...ordered, ...pendingList];

  // 未选中时默认落到第一条；selectedId 失效（文档被删）同样回退
  const selected =
    allDocs.find((doc) => doc._id === selectedId) ?? allDocs[0] ?? null;
  const effectiveSelectedId = selected?._id ?? null;

  const create = () => {
    setCreating(true);
    const id = newLocalId();
    const doc = { ...blankArticleDraft(props.fields), _id: id } as PendingArticle;
    addPending('articles', doc);
    setPendingList(listPending('articles'));
    setSelectedId(id);
    toast.success('本地草稿已创建，首次保存后落库');
    setCreating(false);
  };

  const discardNew = async (docId: string) => {
    removePending('articles', docId);
    clearDraft('articles', docId);
    setPendingList(listPending('articles'));
    setSelectedId(null);
    toast.success('已放弃本地草稿');
  };

  const saveNew = async (docId: string, values: Record<string, unknown>): Promise<string | null> => {
    try {
      const id = await createContent('articles', values);
      removePending('articles', docId);
      clearDraft('articles', docId);
      setPendingList(listPending('articles'));
      await props.onReload();
      return id;
    } catch (error) {
      if (error instanceof Error && error.name === 'Unauthorized') {
        props.onAuthLost();
        return null;
      }
      toast.error(error instanceof Error ? error.message : '保存失败');
      return null;
    }
  };

  return (
    <div className="adm-workbench">
      <Rail
        title="文章"
        count={allDocs.length}
        action={
          <LinkButton tone="brand" loading={creating} onClick={create}>
            ＋ 新建
          </LinkButton>
        }
      >
        {allDocs.map((doc, index) => {
          const id = doc._id;
          const isPendingDraft = isLocalId(id);
          return (
            <RailItem
              key={id}
              index={index + 1}
              title={asText(doc.title) || (isPendingDraft ? '（本地草稿）' : '（未命名）')}
              selected={id === effectiveSelectedId}
              tone={isPendingDraft ? 'warn' : statusTone(asText(doc.status))}
              pending={getDraft('articles', id) !== null}
              onSelect={() => setSelectedId(id)}
            />
          );
        })}
      </Rail>

      {selected ? (
        <ArticleDetail
          key={selected._id}
          document={selected}
          fields={props.fields}
          isNew={isLocalId(selected._id)}
          onSaved={props.onReload}
          onSaveNew={async (values) => {
            const created = await saveNew(selected._id, values);
            if (created) setSelectedId(created);
          }}
          onDiscard={() =>
            isLocalId(selected._id) ? void discardNew(selected._id) : discardDraft(selected._id)
          }
          onDelete={
            isLocalId(selected._id)
              ? undefined
              : () => void removeArticle(selected._id, async () => {
                  await props.onReload();
                  setSelectedId(null);
                }, props.onAuthLost)
          }
          onAuthLost={props.onAuthLost}
        />
      ) : (
        <div className="adm-detail">
          <EmptyState
            icon={<Icon.Article size={22} />}
            title="还没有文章"
            hint="点右上角「＋ 新建」开始写作；本地草稿首次保存后才写入数据库。"
            action={
              <LinkButton tone="brand" onClick={create}>
                ＋ 新建文章
              </LinkButton>
            }
          />
        </div>
      )}
    </div>
  );
}

function discardDraft(docId: string) {
  clearDraft('articles', docId);
  toast.success('已放弃未保存改动');
}

/** 删除一篇已落库的文章（本地草稿没有删除，只有放弃） */
async function removeArticle(
  docId: string,
  done: () => Promise<void>,
  onAuthLost: () => void,
) {
  try {
    await deleteContent('articles', docId);
    clearDraft('articles', docId);
    toast.success('已删除');
    await done();
  } catch (error) {
    if (error instanceof Error && error.name === 'Unauthorized') {
      onAuthLost();
      return;
    }
    toast.error(error instanceof Error ? error.message : '删除失败');
  }
}

/** 文章详情：表单与删除入口都由 ArticleEditor 的 dock 承担 */
function ArticleDetail(props: {
  document: ContentDocument;
  fields: ArticleFields;
  isNew?: boolean;
  onSaved: () => Promise<void>;
  onSaveNew: (values: Record<string, unknown>) => Promise<void>;
  onDiscard: () => void;
  onDelete?: () => void;
  onAuthLost: () => void;
}) {
  return (
    <section className="adm-pane">
      <ArticleEditor
        article={props.document}
        fields={props.fields}
        isNew={props.isNew}
        onSaveNew={props.onSaveNew}
        onSaved={props.onSaved}
        onDiscard={props.onDiscard}
        onDelete={props.onDelete}
        onAuthLost={props.onAuthLost}
      />
    </section>
  );
}
