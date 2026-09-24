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
//
// ⚠️ 详情必须是**带 key 的子组件**：useDocumentDraft 的 values 只在挂载时读一次
// 草稿/文档，而这里原先的详情是内联渲染的（切配置项不重挂载）。少了 key，
// 切到另一条会把上一条的值整份写进当前条的草稿 —— 静默数据损坏。
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { bulkUpdateContent, type ContentDocument, type ContentField } from '@/services/admin-api';
import { asText } from './SchemaForm';
import { clearDraft, getDraft, subscribeDrafts } from './draftStore';
import { resolveSelection } from './selection';
import { SaveDock } from './SaveDock';
import { useCtrlS } from './useCtrlS';
import { useDocumentDraft } from './useDocumentDraft';
import { useSaveAction } from './useSaveAction';
import {
  Badge,
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

const COLLECTION = 'site_config';

/** 多行值的键名：这些 key 用文本域，其余用单行输入 */
const LONG_KEYS = new Set(['bio', 'footer_note']);

function SiteConfigDetail(props: {
  document: ContentDocument;
  fields: ContentField[];
  /** 待保存的配置项 id —— 跨文档的列表级状态，由面板下发（别在子组件里重扫全列表） */
  changedIds: string[];
  onDiscardAll: () => void;
  onReload: () => Promise<void>;
  onAuthLost: () => void;
}) {
  const draft = useDocumentDraft({
    collection: COLLECTION,
    document: props.document,
    fields: props.fields,
  });
  const changedCount = props.changedIds.length;
  const isLong = LONG_KEYS.has(asText(draft.values.key));

  const { saving, run: save } = useSaveAction({
    fields: props.fields,
    values: draft.values,
    setErrors: draft.setErrors,
    onAuthLost: props.onAuthLost,
    save: async () => {
      const updated = await bulkUpdateContent(
        COLLECTION,
        props.changedIds.map((id) => ({ _id: id, ...getDraft(COLLECTION, id)?.values })),
      );
      for (const id of props.changedIds) clearDraft(COLLECTION, id);
      // 文案用服务端返回的实际条数，而不是本地待保存项数：两者不一致本身就是信号
      toast.success(`已保存 ${updated} 项设置`);
    },
    onSuccess: props.onReload,
  });

  // Ctrl/Cmd+S：与文章编辑器一致，四个面板都能手不离键盘保存（审计 P4）
  useCtrlS({ onSave: () => void save(), disabled: saving });

  return (
    <div className="adm-detail">
      <Kicker num="06" label="SITE CONFIG" />

      <TextInput
        value={asText(draft.values.description)}
        big
        fieldName="description"
        placeholder={asText(props.document.key)}
        onChange={(next) => draft.update('description', next)}
      />

      <div className="adm-dmeta">
        <span>{asText(draft.values.key)}</span>
        <span>{asText(draft.values.group) || '未分组'}</span>
        <span style={{ color: asText(draft.values.value) ? undefined : 'var(--brand)' }}>
          {asText(draft.values.value) ? '已设置' : '未设置'}
        </span>
        {draft.dirty ? <Badge tone="brand">未保存</Badge> : null}
      </div>

      <div className="adm-sec">
        <span className="label-site">字段</span>
        <hr className="adm-divider" style={{ flex: 1 }} />
      </div>

      <div className="adm-fields">
        <FieldRow label="值" top={isLong}>
          {isLong ? (
            <TextArea
              value={asText(draft.values.value)}
              rows={3}
              fieldName="value"
              onChange={(next) => draft.update('value', next)}
            />
          ) : (
            <TextInput
              value={asText(draft.values.value)}
              fieldName="value"
              onChange={(next) => draft.update('value', next)}
            />
          )}
        </FieldRow>
        {/* P0-3：前台按 key 读值，改键名 = 前台该处静默失联。hint 而非禁用：
            确有迁移场景，但必须让人在按下保存前知道后果。
            key 在 schema 里是 required，所以这里也吃共享保存的客户端校验（本地拦下、
            不把整批发给服务端再被打回） */}
        <FieldRow
          label="键名"
          error={draft.errors.key}
          hint="站点前台按键名读取配置；修改后原键将失效，前台对应位置会显示为空。"
        >
          <TextInput
            value={asText(draft.values.key)}
            monospace
            fieldName="key"
            onChange={(next) => draft.update('key', next)}
          />
        </FieldRow>
        <FieldRow label="分组">
          <TextInput
            value={asText(draft.values.group)}
            fieldName="group"
            onChange={(next) => draft.update('group', next)}
          />
        </FieldRow>
      </div>

      <FieldValue label="ID">
        <span className="font-mono-site" style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
          {props.document._id}
        </span>
      </FieldValue>

      {/* 保存入口（P4 一致性）：与文章/项目/评论用同一个浮动 dock ——
          四个面板的「保存在哪」不再需要分别记忆。
          批量保存的判定是「待保存项数」而非当前这条是否 dirty，所以走 disabled 覆盖。 */}
      <SaveDock
        status={changedCount > 0 ? `${changedCount} 项待保存` : '没有改动'}
        statusFixed={false}
        saving={saving}
        disabled={changedCount === 0}
        saveLabel="保存全部"
        onSave={() => void save()}
        before={
          <>
            <span style={{ flex: 1 }} />
            <LinkButton disabled={changedCount === 0} onClick={props.onDiscardAll}>
              放弃改动
            </LinkButton>
          </>
        }
      />
    </div>
  );
}

export function SiteConfigPanel(props: {
  fields: ContentField[];
  documents: ContentDocument[];
  onReload: () => Promise<void>;
  onAuthLost: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
  const selected = resolveSelection(ordered, selectedId);

  // 草稿从 draftStore 读：有草稿的项即「已改动」项。这里跨文档，hook 管不到，
  // 所以列表级仍直接读 draftStore。
  const changedIds = ordered
    .filter((doc) => getDraft(COLLECTION, doc._id) !== null)
    .map((doc) => doc._id);
  const valueOf = (doc: ContentDocument): string =>
    asText(getDraft(COLLECTION, doc._id)?.values.value ?? doc.value);

  const discardAll = () => {
    for (const id of changedIds) clearDraft(COLLECTION, id);
  };

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
            tone={valueOf(doc) ? 'on' : 'off'}
            pending={getDraft(COLLECTION, doc._id) !== null}
            onSelect={() => setSelectedId(doc._id)}
          />
        ))}
      </Rail>

      <section className="adm-pane">
        {selected ? (
          <SiteConfigDetail
            key={selected._id}
            document={selected}
            fields={props.fields}
            changedIds={changedIds}
            onDiscardAll={discardAll}
            onReload={props.onReload}
            onAuthLost={props.onAuthLost}
          />
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
