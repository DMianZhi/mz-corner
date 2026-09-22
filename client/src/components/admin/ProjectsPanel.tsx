// 项目管理面板：左列项目清单，右列编辑表单。
//
// 表单用 `key={doc._id}` 强制重挂载来重置内部状态 —— 比在 useEffect 里手动
// 同步「选中项变了 → 重填表单」更不容易出错（AGENTS.md 也要求少用 effect）。
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
import { Badge, Button, DangerConfirm, EmptyState, Icon, MonoLabel } from './ui';

const STATUS_LABELS: Record<string, string> = {
  live: '在线',
  wip: '开发中',
  archived: '已归档',
};

function ProjectForm(props: {
  document: ContentDocument;
  fields: ContentField[];
  onSaved: () => Promise<void>;
  onDeleted: () => Promise<void>;
}) {
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const initial: Record<string, unknown> = {};
    for (const field of props.fields) initial[field.name] = props.document[field.name];
    return initial;
  });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const update = (name: string, value: unknown) => {
    setValues((current) => ({ ...current, [name]: value }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await updateContent('projects', props.document._id, values);
      setDirty(false);
      toast.success('已保存');
      await props.onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="adm-card adm-fade" style={{ padding: 22 }}>
      <div className="adm-col-head" style={{ marginBottom: 18 }}>
        <span className="label-site">项目详情</span>
        <span style={{ flex: 1 }} />
        {dirty ? <Badge tone="brand">未保存</Badge> : null}
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
      </div>

      <SchemaForm fields={props.fields} values={values} onChange={update} />

      <hr className="adm-divider" style={{ margin: '22px 0 16px' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <MonoLabel>ID {props.document._id}</MonoLabel>
        <span style={{ flex: 1 }} />
        <DangerConfirm
          size="sm"
          label="删除项目"
          confirmLabel="确认删除"
          onConfirm={async () => {
            try {
              await deleteContent('projects', props.document._id);
              toast.success('已删除');
              await props.onDeleted();
            } catch (error) {
              toast.error(error instanceof Error ? error.message : '删除失败');
            }
          }}
        />
      </div>
    </div>
  );
}

export function ProjectsPanel(props: {
  fields: ContentField[];
  documents: ContentDocument[];
  onReload: () => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const selected = props.documents.find((doc) => doc._id === selectedId) ?? null;

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
      toast.error(error instanceof Error ? error.message : '创建失败');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="adm-masterdetail">
      <div className="adm-list">
        <div className="adm-col-head">
          <span className="label-site">项目 · {props.documents.length}</span>
          <span style={{ flex: 1 }} />
          <Button size="sm" variant="quiet" icon={<Icon.Plus size={14} />} loading={creating} onClick={create}>
            新建
          </Button>
        </div>

        {props.documents.length === 0 ? (
          <div className="adm-card">
            <EmptyState icon={<Icon.Folder size={18} />} title="还没有项目" />
          </div>
        ) : (
          props.documents.map((doc) => (
            <button
              key={doc._id}
              type="button"
              className="adm-row"
              aria-current={doc._id === selectedId}
              onClick={() => setSelectedId(doc._id)}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 3,
                  flexShrink: 0,
                  background: asText(doc.color) || 'var(--brand)',
                }}
              />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="adm-row-title" style={{ display: 'block' }}>
                  {asText(doc.name) || '(未命名)'}
                </span>
                <span
                  style={{
                    display: 'block',
                    fontSize: 12,
                    color: 'var(--text-3)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {asText(doc.tagline) || '—'}
                </span>
              </span>
              <Badge tone={asText(doc.status) === 'live' ? 'brand' : 'default'}>
                {STATUS_LABELS[asText(doc.status)] ?? asText(doc.status) ?? '—'}
              </Badge>
            </button>
          ))
        )}
      </div>

      <div>
        {selected ? (
          <ProjectForm
            key={selected._id}
            document={selected}
            fields={props.fields}
            onSaved={props.onReload}
            onDeleted={async () => {
              setSelectedId(null);
              await props.onReload();
            }}
          />
        ) : (
          <div className="adm-card">
            <EmptyState
              icon={<Icon.Folder size={18} />}
              title="选择左侧项目进行编辑"
              hint="修改会直接写入线上数据库；颜色、符号、排序都会立刻反映在首页项目墙。"
            />
          </div>
        )}
      </div>
    </div>
  );
}
