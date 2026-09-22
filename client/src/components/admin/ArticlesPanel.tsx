// 文章面板：左索引（序号 + 标题 + 状态点）+ 右详情编辑器。
//
// 与项目/评论/站点设置三个面板同构，只是右侧换成带 Markdown 三态的 ArticleEditor。
import { useState } from 'react';
import { toast } from 'sonner';
import { createContent, type ContentDocument, type ContentField } from '@/services/admin-api';
import { ArticleEditor, blankArticleDraft } from './ArticleEditor';
import { asText } from './SchemaForm';
import { statusTone } from './status';
import { Button, EmptyState, Icon, LinkButton, Rail, RailItem } from './ui';

export function ArticlesPanel(props: {
  fields: ContentField[];
  documents: ContentDocument[];
  onReload: () => Promise<void>;
  onAuthLost: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // 未选中时默认落到第一条：切标签后右栏不该是一片空白（demo B 的行为）
  const selected = props.documents.find((doc) => doc._id === selectedId) ?? props.documents[0] ?? null;

  const create = async () => {
    setCreating(true);
    try {
      const id = await createContent('articles', blankArticleDraft(props.fields));
      await props.onReload();
      setSelectedId(id);
      toast.success('已新建草稿');
    } catch (error) {
      if (error instanceof Error && error.name === 'Unauthorized') {
        props.onAuthLost();
        return;
      }
      toast.error(error instanceof Error ? error.message : '新建失败');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="adm-workbench">
      <Rail
        title="文章"
        count={props.documents.length}
        action={
          <LinkButton tone="brand" loading={creating} onClick={create}>
            ＋ 新建文章
          </LinkButton>
        }
      >
        {props.documents.map((doc, index) => (
          <RailItem
            key={doc._id}
            index={index + 1}
            title={asText(doc.title) || '(无标题)'}
            selected={doc._id === selectedId}
            tone={statusTone(asText(doc.status))}
            onSelect={() => setSelectedId(doc._id)}
          />
        ))}
      </Rail>

      <section className="adm-pane">
        {selected ? (
          <ArticleEditor
            key={selected._id}
            article={selected}
            fields={props.fields}
            onSaved={props.onReload}
            onAuthLost={props.onAuthLost}
          />
        ) : (
          <EmptyState
            icon={<Icon.Article size={18} />}
            title="还没有文章"
            hint="点左上角「＋ 新建文章」开始写第一篇。"
            action={
              <Button variant="primary" size="sm" icon={<Icon.Plus size={14} />} onClick={create}>
                新建文章
              </Button>
            }
          />
        )}
      </section>
    </div>
  );
}
