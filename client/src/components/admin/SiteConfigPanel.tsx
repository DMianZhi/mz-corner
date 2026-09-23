// 站点设置面板：左索引（按分组排序的配置项）+ 右详情。
//
// site_config 在库里是若干条 key-value 文档（key/value/group/description），
// 天然适合做成「索引 + 详情」。但保存走**集合级批量**：用户的心智是
// 「改完几项一起保存」，逐条 PATCH 会产生 N 次请求，中途失败还会留下
// 「改了一半」的状态。
//
// 本轮（UX 审计修复）：
// - 草稿接入 draftStore（P0-1）：改一半切标签/刷新不再丢，索引栏带未保存点（P3）
// - 「键名」加快名提示（P0-3）：前台按 key 读值，改名会让旧 key 静默失联
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { bulkUpdateContent, type ContentDocument, type ContentField } from '@/services/admin-api';
import { asText } from './SchemaForm';
import {
  clearDraft,
  getDraft,
  setDraft,
  subscribeDrafts,
} from './draftStore';
import {
  Badge,
  Button,
  EmptyState,
  FieldRow,
  FieldValue,
  Icon,
  Kicker,
  LinkButton,
  Rail,
  RailItem,
  TextArea,
  TextInput,
} from './ui';

/** 多行值的键名：这些 key 用文本域，其余用单行输入 */
const LONG_KEYS = new Set(['bio', 'footer_note']);

export function SiteConfigPanel(props: {
  fields: ContentField[];
  documents: ContentDocument[];
  onReload: () => Promise<void>;
  onAuthLost: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // draftStore 变化时重渲（未保存点与「N 项待保存」都从草稿推导）
  const [, forceRender] = useState(0);
  useEffect(() => subscribeDrafts(() => forceRender((n) => n + 1)), []);

  // 按分组聚拢，组内按键名排序：索引栏读起来像一份目录，而不是随机顺序
  const ordered = [...props.documents].sort((a, b) => {
    const groupA = asText(a.group) || '未分组';
    const groupB = asText(b.group) || '未分组';
    if (groupA !== groupB) return groupA.localeCompare(groupB, 'zh-Hans-CN');
    return asText(a.key).localeCompare(asText(b.key));
  });

  // 未选中时默认落到第一条：切标签后右栏不该是一片空白
  const selected = ordered.find((doc) => doc._id === selectedId) ?? ordered[0] ?? null;

  // 草稿从 draftStore 读：有草稿的项即「已改动」项
  const draftOf = (docId: string): Record<string, unknown> =>
    getDraft('site_config', docId)?.values ?? {};
  const changedIds = ordered.filter((doc) => getDraft('site_config', doc._id) !== null).map((doc) => doc._id);

  const fieldOf = (doc: ContentDocument, name: string): string =>
    name in draftOf(doc._id) ? asText(draftOf(doc._id)[name]) : asText(doc[name]);

  const setField = (doc: ContentDocument, name: string, value: string) => {
    const next = { ...draftOf(doc._id), [name]: value };
    setDraft('site_config', doc._id, next);
  };

  const discardAll = () => {
    for (const id of changedIds) clearDraft('site_config', id);
  };

  const save = async () => {
    if (changedIds.length === 0) return;
    setSaving(true);
    try {
      const updated = await bulkUpdateContent(
        'site_config',
        changedIds.map((id) => ({ _id: id, ...draftOf(id) })),
      );
      for (const id of changedIds) clearDraft('site_config', id);
      toast.success(`已保存 ${updated} 项设置`);
      await props.onReload();
    } catch (error) {
      if (error instanceof Error && error.name === 'Unauthorized') {
        props.onAuthLost();
        return;
      }
      toast.error(error instanceof Error ? error.message : '保存失败', {
        action: { label: '重试', onClick: () => void save() },
      });
    } finally {
      setSaving(false);
    }
  };

  // Ctrl/Cmd+S：与文章编辑器一致，四个面板都能手不离键盘保存（审计 P4）
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (!saving) void save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  return (
    <div className="adm-workbench">
      <Rail title="站点设置" count={props.documents.length}>
        {ordered.map((doc, index) => (
          <RailItem
            key={doc._id}
            index={index + 1}
            title={asText(doc.description) || asText(doc.key) || '(未命名) '}
            selected={doc._id === selected?._id}
            // 空值 = 这一项还没配，空心点比「有值」更值得一眼看出
            tone={fieldOf(doc, 'value') ? 'on' : 'off'}
            pending={getDraft('site_config', doc._id) !== null}
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
              fieldName="description"
              placeholder={asText(selected.key)}
              onChange={(next) => setField(selected, 'description', next)}
            />

            <div className="adm-dmeta">
              <span>{fieldOf(selected, 'key')}</span>
              <span>{fieldOf(selected, 'group') || '未分组'}</span>
              <span style={{ color: fieldOf(selected, 'value') ? undefined : 'var(--brand)' }}>
                {fieldOf(selected, 'value') ? '已设置' : '未设置'}
              </span>
              {getDraft('site_config', selected._id) ? <Badge tone="brand">未保存</Badge> : null}
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
                    fieldName="value"
                    onChange={(next) => setField(selected, 'value', next)}
                  />
                ) : (
                  <TextInput
                    value={fieldOf(selected, 'value')}
                    fieldName="value"
                    onChange={(next) => setField(selected, 'value', next)}
                  />
                )}
              </FieldRow>
              {/* P0-3：前台按 key 读值，改键名 = 前台该处静默失联。hint 而非禁用：
                  确有迁移场景，但必须让人在按下保存前知道后果 */}
              <FieldRow
                label="键名"
                hint="站点前台按键名读取配置；修改后原键将失效，前台对应位置会显示为空。"
              >
                <TextInput
                  value={fieldOf(selected, 'key')}
                  monospace
                  fieldName="key"
                  onChange={(next) => setField(selected, 'key', next)}
                />
              </FieldRow>
              <FieldRow label="分组">
                <TextInput
                  value={fieldOf(selected, 'group')}
                  fieldName="group"
                  onChange={(next) => setField(selected, 'group', next)}
                />
              </FieldRow>
            </div>

            <FieldValue label="ID">
              <span className="font-mono-site" style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
                {selected._id}
              </span>
            </FieldValue>

            {/* 保存入口（P4 一致性）：与文章/项目/评论用同一个浮动 dock ——
                四个面板的「保存在哪」不再需要分别记忆 */}
            <div className="adm-dock">
              <span className="label-site">
                {changedIds.length > 0 ? `${changedIds.length} 项待保存` : '没有改动'}
              </span>
              <span style={{ flex: 1 }} />
              <LinkButton disabled={changedIds.length === 0} onClick={discardAll}>
                放弃改动
              </LinkButton>
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
