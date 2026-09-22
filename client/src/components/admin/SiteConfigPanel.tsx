// 站点设置面板：左索引（按分组排序的配置项）+ 右详情。
//
// site_config 在库里是若干条 key-value 文档（key/value/group/description），
// 天然适合做成「索引 + 详情」。但保存仍走**集合级批量**：用户的心智是
// 「改完几项一起保存」，逐条 PATCH 会产生 N 次请求，中途失败还会留下
// 「改了一半」的状态。
//
// drafts 因此按 _id 存**部分字段**（{ [docId]: { value, description, ... } }），
// 未改动的字段不进请求体，减少无谓写入。
import { useState } from 'react';
import { toast } from 'sonner';
import { bulkUpdateContent, type ContentDocument, type ContentField } from '@/services/admin-api';
import { asText } from './SchemaForm';
import { Badge, Button, EmptyState, FieldRow, FieldValue, Icon, Kicker, Rail, RailItem, TextArea, TextInput } from './ui';

/** 多行值的键名：这些 key 用文本域，其余用单行输入 */
const LONG_KEYS = new Set(['bio', 'footer_note']);

export function SiteConfigPanel(props: {
  fields: ContentField[];
  documents: ContentDocument[];
  onReload: () => Promise<void>;
  onAuthLost: () => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, Record<string, unknown>>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // 按分组聚拢，组内按键名排序：索引栏读起来像一份目录，而不是随机顺序
  const ordered = [...props.documents].sort((a, b) => {
    const groupA = asText(a.group) || '未分组';
    const groupB = asText(b.group) || '未分组';
    if (groupA !== groupB) return groupA.localeCompare(groupB, 'zh-Hans-CN');
    return asText(a.key).localeCompare(asText(b.key));
  });

  // 未选中时默认落到第一条：切标签后右栏不该是一片空白（demo B 的行为）
  const selected = ordered.find((doc) => doc._id === selectedId) ?? ordered[0] ?? null;
  const changedIds = Object.keys(drafts);

  const fieldOf = (doc: ContentDocument, name: string): string =>
    drafts[doc._id] && name in drafts[doc._id]
      ? asText(drafts[doc._id][name])
      : asText(doc[name]);

  const setField = (doc: ContentDocument, name: string, value: string) => {
    setDrafts((prev) => ({ ...prev, [doc._id]: { ...prev[doc._id], [name]: value } }));
  };

  const save = async () => {
    if (changedIds.length === 0) return;
    setSaving(true);
    try {
      const updated = await bulkUpdateContent(
        'site_config',
        changedIds.map((id) => ({ _id: id, ...drafts[id] })),
      );
      setDrafts({});
      toast.success(`已保存 ${updated} 项设置`);
      await props.onReload();
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

  return (
    <div className="adm-workbench">
      <Rail title="站点设置" count={props.documents.length}>
        {ordered.map((doc, index) => (
          <RailItem
            key={doc._id}
            index={index + 1}
            title={asText(doc.description) || asText(doc.key) || '(未命名) '}
            selected={doc._id === selectedId}
            // 空值 = 这一项还没配，空心点比「有值」更值得一眼看出
            tone={asText(doc.value) ? 'on' : 'off'}
            onSelect={() => setSelectedId(doc._id)}
          />
        ))}
      </Rail>

      <section className="adm-pane">
        {selected ? (
          <div className="adm-detail">
            <Kicker num="06" label="SITE CONFIG" />

            <TextInput
              value={fieldOf(selected, 'description')}
              big
              placeholder={asText(selected.key)}
              onChange={(next) => setField(selected, 'description', next)}
            />

            <div className="adm-dmeta">
              <span>{fieldOf(selected, 'key')}</span>
              <span>{fieldOf(selected, 'group') || '未分组'}</span>
              <span style={{ color: asText(selected.value) ? undefined : 'var(--brand)' }}>
                {asText(selected.value) ? '已设置' : '未设置'}
              </span>
              {drafts[selected._id] ? <Badge tone="brand">未保存</Badge> : null}
            </div>

            <div className="adm-sec">
              <span className="label-site">字段</span>
              <hr className="adm-divider" style={{ flex: 1 }} />
            </div>

            <div className="adm-fields">
              <FieldRow label="值" top={LONG_KEYS.has(fieldOf(selected, 'key'))}>
                {LONG_KEYS.has(fieldOf(selected, 'key')) ? (
                  <TextArea
                    value={fieldOf(selected, 'value')}
                    rows={3}
                    onChange={(next) => setField(selected, 'value', next)}
                  />
                ) : (
                  <TextInput
                    value={fieldOf(selected, 'value')}
                    onChange={(next) => setField(selected, 'value', next)}
                  />
                )}
              </FieldRow>
              <FieldRow label="键名">
                <TextInput
                  value={fieldOf(selected, 'key')}
                  monospace
                  onChange={(next) => setField(selected, 'key', next)}
                />
              </FieldRow>
              <FieldRow label="分组">
                <TextInput
                  value={fieldOf(selected, 'group')}
                  onChange={(next) => setField(selected, 'group', next)}
                />
              </FieldRow>
            </div>

            <FieldValue label="ID">
              <span className="font-mono-site" style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
                {selected._id}
              </span>
            </FieldValue>

            {/* 保存条：贴底吸附，滚动到哪都能按到 */}
            <div className="adm-sticky-bar">
              <span className="label-site">
                {changedIds.length > 0 ? `${changedIds.length} 项待保存` : '没有改动'}
              </span>
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
        ) : (
          <EmptyState
            icon={<Icon.Sliders size={18} />}
            title="没有站点设置"
            hint="首页标语、社交链接、页脚与 SEO 关键词都在这里改。"
          />
        )}
      </section>
    </div>
  );
}
