// 站点设置面板：按 `group` 字段分组，一次保存整组。
//
// site_config 在库里是 10 条 key-value 文档（key/value/group/description），
// 天然适合渲染成分组表单。保存走集合级批量 PUT —— 用户按的是一次「保存全部」，
// 逐条 PATCH 会产生 10 次请求，且中途失败会留下「改了一半」的状态。
import { useState } from 'react';
import { toast } from 'sonner';
import { bulkUpdateContent, type ContentDocument, type ContentField } from '@/services/admin-api';
import { asText } from './SchemaForm';
import { Badge, Button, EmptyState, Icon, MonoLabel, TextArea, TextInput } from './ui';

/** 多行值的键名：这些 key 用文本域，其余用单行输入 */
const LONG_KEYS = new Set(['bio', 'footer_note']);

export function SiteConfigPanel(props: {
  fields: ContentField[];
  documents: ContentDocument[];
  onReload: () => Promise<void>;
}) {
  // 只存「改过的」字段：未改动的项不提交，减少无谓写入
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const changedIds = Object.keys(drafts);

  const groups = new Map<string, ContentDocument[]>();
  for (const doc of props.documents) {
    const group = asText(doc.group) || '未分组';
    const list = groups.get(group) ?? [];
    list.push(doc);
    groups.set(group, list);
  }

  const save = async () => {
    if (changedIds.length === 0) return;
    setSaving(true);
    try {
      const updated = await bulkUpdateContent(
        'site_config',
        changedIds.map((id) => ({ _id: id, value: drafts[id] })),
      );
      setDrafts({});
      toast.success(`已保存 ${updated} 项设置`);
      await props.onReload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (props.documents.length === 0) {
    return (
      <div className="adm-card">
        <EmptyState
          icon={<Icon.Sliders size={18} />}
          title="没有站点设置"
          hint="site_config 集合为空。可以用下方的全库导入恢复默认配置。"
        />
      </div>
    );
  }

  return (
    <div className="adm-fade">
      {[...groups.entries()].map(([group, docs]) => (
        <section key={group} style={{ marginBottom: 30 }}>
          <div className="adm-col-head" style={{ marginBottom: 12 }}>
            <MonoLabel style={{ letterSpacing: '0.16em' }}>{group}</MonoLabel>
            <hr className="adm-divider" style={{ flex: 1 }} />
          </div>

          <div className="adm-card" style={{ overflow: 'hidden' }}>
            {docs.map((doc, index) => {
              const key = asText(doc.key);
              const current = drafts[doc._id] ?? asText(doc.value);
              const dirty = drafts[doc._id] !== undefined;
              return (
                <div
                  key={doc._id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(180px, 240px) 1fr',
                    gap: 20,
                    alignItems: 'start',
                    padding: '18px 22px',
                    borderTop: index === 0 ? undefined : '1px solid var(--border-soft)',
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 7,
                        marginBottom: 5,
                      }}
                    >
                      <span style={{ fontSize: 13.5, fontWeight: 600 }}>
                        {asText(doc.description) || key}
                      </span>
                      {dirty ? <Badge tone="brand">已改</Badge> : null}
                    </div>
                    <span className="label-site" style={{ letterSpacing: '0.08em' }}>
                      {key}
                    </span>
                  </div>
                  <div>
                    {LONG_KEYS.has(key) ? (
                      <TextArea
                        value={current}
                        rows={3}
                        onChange={(next) => setDrafts((prev) => ({ ...prev, [doc._id]: next }))}
                      />
                    ) : (
                      <TextInput
                        value={current}
                        onChange={(next) => setDrafts((prev) => ({ ...prev, [doc._id]: next }))}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {/* 保存条：贴底吸附，滚动到哪都能按到 */}
      <div className="adm-sticky-bar">
        <MonoLabel>
          {changedIds.length > 0 ? `${changedIds.length} 项待保存` : '没有改动'}
        </MonoLabel>
        <span style={{ flex: 1 }} />
        <Button
          size="sm"
          variant="quiet"
          disabled={changedIds.length === 0}
          onClick={() => setDrafts({})}
        >
          放弃改动
        </Button>
        <Button
          variant="primary"
          size="sm"
          icon={<Icon.Save size={14} />}
          loading={saving}
          disabled={changedIds.length === 0}
          onClick={save}
        >
          保存全部
        </Button>
      </div>
    </div>
  );
}
