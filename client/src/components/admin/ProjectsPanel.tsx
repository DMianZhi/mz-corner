// 项目面板：左索引 + 右详情表单。
//
// 表单用 `key={doc._id}` 强制重挂载来重置内部状态 —— 比在 useEffect 里手动
// 同步「选中项变了 → 重填表单」更不容易出错（AGENTS.md 也要求少用 effect）。
import { useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import {
  createContent,
  deleteContent,
  updateContent,
  type ContentDocument,
  type ContentField,
} from '@/services/admin-api';
import { asText, emptyValues, focusFirstError, SchemaForm, validateValues, type FieldErrors } from './SchemaForm';
import { statusTone, StatusText } from './status';
import { clearDraft, draftTotal, getDraft, setDraft, subscribeDrafts } from './draftStore';
import { mapLabelErrorsToFields as mapErrors } from './SchemaForm';
import {
  Badge,
  Button,
  DangerConfirm,
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
  // 草稿优先：上次没保存就离开的项目，回到这里要能看到改动还在（审计 P0-1）
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const draft = getDraft('projects', props.document._id);
    if (draft) return draft.values;
    const initial: Record<string, unknown> = {};
    for (const field of props.fields) initial[field.name] = props.document[field.name];
    return initial;
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  // draftStore 变化时重渲（dirty 由此推导，RailItem 的草稿点也靠它）
  useSyncExternalStore(subscribeDrafts, draftTotal);

  const dirty = getDraft('projects', props.document._id) !== null;

  // 副作用留在 updater 之外：updater 在渲染期执行，里面写草稿会同步通知订阅方改状态
  const update = (name: string, value: unknown) => {
    const next = { ...values, [name]: value };
    setValues(next);
    setDraft('projects', props.document._id, next);
    if (name in errors) {
      const cleared: FieldErrors = { ...errors };
      delete cleared[name];
      setErrors(cleared);
    }
  };

  const save = async () => {
    const clientErrors = validateValues(props.fields, values);
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      focusFirstError(props.fields, clientErrors);
      toast.error('有字段需要修正');
      return;
    }
    setSaving(true);
    try {
      await updateContent('projects', props.document._id, values);
      clearDraft('projects', props.document._id);
      setErrors({});
      toast.success('已保存');
      await props.onSaved();
    } catch (error) {
      if (error instanceof Error && error.name === 'Unauthorized') {
        props.onAuthLost();
        return;
      }
      const message = error instanceof Error ? error.message : '保存失败';
      const fieldErrors = mapErrors(props.fields, message);
      if (fieldErrors) {
        setErrors(fieldErrors);
        toast.error('有字段需要修正');
      } else {
        toast.error(message);
      }
    } finally {
      setSaving(false);
    }
  };

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

  const color = asText(values.color) || 'var(--brand)';

  return (
    <div className="adm-detail">
      <Kicker num="06" label="PROJECTS" />

      <TextInput
        value={asText(values.name)}
        big
        placeholder="项目名称"
        onChange={(next) => update('name', next)}
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
        <span>{asText(values.tagline) || '未填简介'}</span>
        <span>排序 {asText(values.order) || '0'}</span>
        <StatusText value={asText(values.status)} />
      </div>

      <div className="adm-sec">
        <span className="label-site">字段</span>
        <hr className="adm-divider" style={{ flex: 1 }} />
        {dirty ? <Badge tone="brand">未保存</Badge> : null}
      </div>

      <SchemaForm
        fields={props.fields}
        values={values}
        onChange={update}
        errors={errors}
        exclude={['name']}
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

export function ProjectsPanel(props: {
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
            selected={doc._id === selectedId}
            tone={statusTone(asText(doc.status))}
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
