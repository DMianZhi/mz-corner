// 项目面板：左索引 + 右详情表单。
//
// 表单用 `key={doc._id}` 强制重挂载来重置内部状态 —— 比在 useEffect 里手动
// 同步「选中项变了 → 重填表单」更不容易出错（AGENTS.md 也要求少用 effect）。
//
// ⚠️ 这个 key 同时是 useDocumentDraft 的正确性前提：values 只在挂载时初始化一次，
// 少了 key 就会把上一条的值整份写进当前条的草稿。
import { useState } from 'react';
import { toast } from 'sonner';
import {
  createContent,
  deleteContent,
  updateContent,
  type ContentDocument,
  type ContentField,
} from '@/services/admin-api';
import { asText, emptyValues, SchemaForm } from './SchemaForm';
import { statusTone, StatusText } from './status';
import { clearDraft, getDraft } from './draftStore';
import { resolveSelection } from './selection';
import { SaveDock } from './SaveDock';
import { useCtrlS } from './useCtrlS';
import { useDocumentDraft } from './useDocumentDraft';
import { useSaveAction } from './useSaveAction';
import {
  Badge,
  EmptyState,
  FieldValue,
  Icon,
  Kicker,
  LinkButton,
  Rail,
  RailItem,
  TextInput,
} from './ui';

function ProjectDetail(props: {
  document: ContentDocument;
  fields: ContentField[];
  onSaved: () => Promise<void>;
  onDeleted: () => Promise<void>;
  onAuthLost: () => void;
}) {
  const draft = useDocumentDraft({
    collection: 'projects',
    document: props.document,
    fields: props.fields,
  });

  const { saving, run: save } = useSaveAction({
    fields: props.fields,
    values: draft.values,
    setErrors: draft.setErrors,
    onAuthLost: props.onAuthLost,
    save: async () => {
      await updateContent('projects', props.document._id, draft.values);
      clearDraft('projects', props.document._id);
    },
    successMessage: '已保存',
    onSuccess: props.onSaved,
  });

  // Ctrl/Cmd+S：与文章编辑器一致，四个面板都能手不离键盘保存（审计 P4）
  useCtrlS({ onSave: () => void save(), disabled: saving });

  const remove = async () => {
    try {
      await deleteContent('projects', props.document._id);
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

  const color = asText(draft.values.color) || 'var(--brand)';

  return (
    <div className="adm-detail">
      <Kicker num="06" label="PROJECTS" />

      <TextInput
        value={asText(draft.values.name)}
        big
        placeholder="项目名称"
        onChange={(next) => draft.update('name', next)}
      />

      <div className="adm-dmeta">
        <span
          style={{
            width: 9,
            height: 9,
            borderRadius: 3,
            background: color,
            display: 'inline-block',
          }}
        />
        <span>{asText(draft.values.tagline) || '未填简介'}</span>
        <span>排序 {asText(draft.values.order) || '0'}</span>
        <StatusText value={asText(draft.values.status)} />
      </div>

      <div className="adm-sec">
        <span className="label-site">字段</span>
        <hr className="adm-divider" style={{ flex: 1 }} />
        {draft.dirty ? <Badge tone="brand">未保存</Badge> : null}
      </div>

      <SchemaForm
        fields={props.fields}
        values={draft.values}
        onChange={draft.update}
        errors={draft.errors}
        exclude={['name']}
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

export function ProjectsPanel(props: {
  fields: ContentField[];
  documents: ContentDocument[];
  onReload: () => Promise<void>;
  onAuthLost: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // 未选中时默认落到第一条：切标签后右栏不该是一片空白（demo B 的行为）
  const selected = resolveSelection(props.documents, selectedId);

  const create = async () => {
    setCreating(true);
    try {
      const id = await createContent('projects', {
        ...emptyValues(props.fields),
        name: '新项目',
        status: 'wip',
      });
      await props.onReload();
      setSelectedId(id);
      toast.success('已创建，记得补全信息');
    } catch (error) {
      if (error instanceof Error && error.name === 'Unauthorized') {
        props.onAuthLost();
        return;
      }
      toast.error(error instanceof Error ? error.message : '创建失败');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="adm-workbench">
      <Rail
        title="项目"
        count={props.documents.length}
        action={
          <LinkButton tone="brand" loading={creating} onClick={create}>
            ＋ 新建项目
          </LinkButton>
        }
      >
        {props.documents.map((doc, index) => (
          <RailItem
            key={doc._id}
            index={index + 1}
            title={asText(doc.name) || '(未命名)'}
            // 用解析后的 selected（含「未选中时落到第一条」的回退）判定高亮，
            // 否则首屏 selectedId 还是 null，左栏一行都不亮（审计 P3-7）
            selected={doc._id === selected?._id}
            tone={statusTone(asText(doc.status))}
            pending={getDraft('projects', doc._id) !== null}
            onSelect={() => setSelectedId(doc._id)}
          />
        ))}
      </Rail>

      <section className="adm-pane">
        {selected ? (
          <ProjectDetail
            key={selected._id}
            document={selected}
            fields={props.fields}
            onSaved={props.onReload}
            onAuthLost={props.onAuthLost}
            onDeleted={async () => {
              setSelectedId(null);
              await props.onReload();
            }}
          />
        ) : (
          <EmptyState
            icon={<Icon.Folder size={18} />}
            title="还没有项目"
            hint="点左上角「＋ 新建项目」；颜色、符号、排序都会立刻反映在首页项目墙。"
          />
        )}
      </section>
    </div>
  );
}
