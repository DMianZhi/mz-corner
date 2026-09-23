// 文章编辑器（方案 B 的右栏详情，不是独立页面）。
//
// 布局取舍：kicker → 标题 → 等宽元信息行 → 字段行（发丝线分隔）→ 正文。
// 整页不滚，滚动由 .adm-pane 容器承担；正文 textarea 自动增高，
// 保证面板内只有一根滚动条 —— 内容长短变化时不会出现滚动条伸缩导致的横向抖动。
//
// 宽度策略：详情列铺满右栏（表单不该受阅读宽度约束，卡 720px 在宽屏下右侧空 880px）；
// 字段区两列网格，多行字段横跨两列。只有「预览」锁 --content-w 居中 ——
// 预览的意义就是「所见即线上」，宽度不跟站点一致就没有参考价值。
//
// 模式切换（编辑 / 分屏 / 预览）放在**浮动 dock** 里而不是面板顶部，
// 因为它属于「写作时的手部动作」，贴着视线下方比回到顶部找按钮顺手。
// dock 是 fixed 定位，会盖住正文最后几行 —— .adm-detail 因此留了 132px 底部内边距。
//
// 本轮（UX 审计修复）接入的能力：
// - 草稿暂存：每处编辑写入 draftStore（内存 + sessionStorage 镜像），切换/刷新可恢复（P0-1）
// - 本地新建：isNew 时走 onSaveNew（首次保存才 POST），放弃不产生垃圾文档（P0-2）
// - 字段级错误：SchemaForm/FieldRow 渲染红框与错误文字，标题错误贴标题框（P2-4）
// - 客户端校验：保存前按 schema 校验（required/max/日期格式），就地报错不发请求（P2-5）
// - Ctrl/Cmd+S 保存；「放弃改动」从站点设置面板补齐到文章（P4）
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Markdown } from '@/components/Markdown';
import { updateContent, type ContentDocument, type ContentField } from '@/services/admin-api';
import {
  asText,
  focusFirstError,
  mapLabelErrorsToFields,
  SchemaForm,
  validateValues,
  type FieldErrors,
} from './SchemaForm';
import { StatusText } from './status';
import { draftStore } from './draftStore';
import {
  Badge,
  Button,
  DangerConfirm,
  FieldValue,
  fitTextarea,
  Icon,
  Kicker,
  LinkButton,
  TextArea,
  TextInput,
} from './ui';

type EditorMode = 'edit' | 'split' | 'preview';

const MODES: Array<{ value: EditorMode; label: string; icon: React.ReactNode }> = [
  { value: 'edit', label: '编辑', icon: <Icon.Pencil size={14} /> },
  { value: 'split', label: '分屏', icon: <Icon.Split size={14} /> },
  { value: 'preview', label: '预览', icon: <Icon.Eye size={14} /> },
];

/** 从文档抽出可编辑字段的当前值（其余系统字段如 viewCount 不参与编辑） */
function pickValues(fields: ContentField[], document: ContentDocument): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const field of fields) values[field.name] = document[field.name];
  return values;
}

export function ArticleEditor(props: {
  article: ContentDocument;
  fields: ContentField[];
  /** 本地新建的虚拟文档（local: 前缀 id）：首次保存走 create 而不是 update */
  isNew?: boolean;
  /** 本地新建的落库回调；普通文档不传 */
  onSaveNew?: (values: Record<string, unknown>) => Promise<void>;
  onSaved: () => Promise<void> | void;
  onAuthLost: () => void;
  /** 传入则渲染「删除」动作（本地新建没有删除，只有放弃） */
  onDelete?: () => void;
  /** 有未保存改动时点「放弃」的确认弹层由父级控制；true = 直接放弃当前草稿 */
  onDiscard: () => void;
}) {
  const draftKey = props.article._id;

  // 初始化顺序：草稿 > 文档当前值。草稿存在说明上次编辑没保存就离开了，恢复它。
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const draft = draftStore.get('articles', draftKey);
    if (draft) return draft.values;
    return pickValues(props.fields, props.article);
  });
  const [mode, setMode] = useState<EditorMode>('edit');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  // 草稿这层「真相」独立于 React 状态：面板卸载（切标签）后依然在。
  // dirty 用「草稿是否存在」推导 —— set/clear 都会触发 draftStore 通知，订阅方自动重渲。
  const dirty = props.isNew ? true : draftStore.get('articles', draftKey) !== null;

  // 每次编辑都写草稿。注意 isNew 的虚拟文档也存草稿（key=articles:local:xxx），
  // 保存成功后由父级 removePending + clearDraft 一并清掉。
  // 副作用（setErrors / 写草稿）必须留在 updater 之外：updater 在 React 渲染期执行，
  // 在里面写草稿会同步通知订阅方（顶栏「N 未保存」徽标）改状态，React 会报
  // 「Cannot update a component while rendering a different component」。
  const update = (name: string, value: unknown) => {
    const next = { ...values, [name]: value };
    setValues(next);
    // 就地清掉该字段的错误：错误只在保存时校验，编辑期间保持安静
    if (errors[name]) {
      const cleared: FieldErrors = { ...errors };
      delete cleared[name];
      setErrors(cleared);
    }
    draftStore.set('articles', draftKey, next);
  };

  const save = async () => {
    // 客户端先行校验（schema 推导：required/max/日期/数字），就地报错、不发请求
    const clientErrors = validateValues(props.fields, values);
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      focusFirstError(props.fields, clientErrors);
      toast.error(`保存失败，有 ${Object.keys(clientErrors).length} 处需要修正`);
      return;
    }
    setSaving(true);
    try {
      if (props.isNew) {
        if (!props.onSaveNew) throw new Error('本地新建缺少落库回调');
        await props.onSaveNew(values);
      } else {
        await updateContent('articles', draftKey, values);
        draftStore.clear('articles', draftKey);
        await props.onSaved();
      }
      setErrors({});
      toast.success('已保存');
    } catch (error) {
      if (error instanceof Error && error.name === 'Unauthorized') {
        props.onAuthLost();
        return;
      }
      // 服务端错误文案形如「标题不能为空」「发布日期长度不能超过 30 字」——
      // 按 label 反查字段名，把错误落到字段上；匹配不到再退回 toast
      const message = error instanceof Error ? error.message : '保存失败';
      const labelErrors = mapLabelErrorsToFields(props.fields, message);
      if (labelErrors) {
        setErrors(labelErrors);
        focusFirstError(props.fields, labelErrors);
        toast.error(`保存失败，有 ${Object.keys(labelErrors).length} 处需要修正`);
      } else {
        toast.error(message);
      }
    } finally {
      setSaving(false);
    }
  };

  // Ctrl/Cmd+S：写作时手不离键盘
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

  const status = asText(values.status);
  const title = asText(values.title);
  const content = asText(values.content);

  // 正文自动增高：textarea 若自带滚动，面板里就会同时存在两根滚动条
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    if (taRef.current) fitTextarea(taRef.current);
  }, [content, mode]);
  // 宽度变化也要重算：只依赖 content/mode 的话，窄屏下会留着按宽屏算出的高度，
  // 正文被截出一大截内部滚动（正是「不要两根滚动条」想避免的情况）。
  // 只在宽度真的变了才重算，避免 setHeight 触发 observer 自循环。
  useEffect(() => {
    const el = taRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    let lastW = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (Math.abs(el.clientWidth - lastW) < 1) return;
      lastW = el.clientWidth;
      fitTextarea(el);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [mode]);

  // 切到分屏/预览时把正文区滚到视野顶部：预览按下去只看到表单会让人困惑
  const bodySecRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (mode === 'edit') return;
    bodySecRef.current?.scrollIntoView({ block: 'start' });
  }, [mode]);

  const titleError = errors.title;
  const body = content.trim() ? (
    <Markdown source={content} />
  ) : (
    <span style={{ color: 'var(--text-3)', fontSize: 13 }}>
      {mode === 'split' ? '左侧输入后，这里实时预览' : '正文为空'}
    </span>
  );

  return (
    <div
      className={['adm-detail', mode === 'preview' ? 'adm-detail--measure' : ''].filter(Boolean).join(' ')}
    >
      <Kicker num="06" label="MANAGE" />

      <FieldRowLike error={titleError}>
        <TextInput
          value={title}
          big
          // 本地新建：直接落在标题框，「新建 → 命名」一步到位（审计 P0-2 补漏）
          autoFocus={props.isNew}
          fieldName="title"
          placeholder="文章标题"
          onChange={(next) => update('title', next)}
        />
      </FieldRowLike>

      <div className="adm-dmeta">
        <span>{asText(values.category) || '未分类'}</span>
        <span>{asText(values.publishDate) || '未设日期'}</span>
        <span>{asText(props.article.viewCount) || '0'} 次阅读</span>
        <StatusText value={status} />
        {!props.isNew && status === 'published' ? (
          <a
            className="adm-link"
            href={`#/post/${draftKey}`}
            target="_blank"
            rel="noreferrer"
            style={{ color: 'var(--brand)' }}
          >
            在站点查看
          </a>
        ) : null}
      </div>

      <div className="adm-sec">
        <span className="label-site">元信息</span>
        <hr className="adm-divider" style={{ flex: 1 }} />
        {dirty ? <Badge tone="brand">未保存</Badge> : null}
      </div>

      <SchemaForm
        fields={props.fields}
        values={values}
        errors={errors}
        onChange={update}
        exclude={['title', 'content']}
      />

      <div className="adm-sec" ref={bodySecRef}>
        <span className="label-site">正文</span>
        <hr className="adm-divider" style={{ flex: 1 }} />
        <span className="adm-sec-note">Markdown</span>
      </div>

      {mode === 'edit' ? (
        <TextArea
          textareaRef={taRef}
          code
          autoGrow={false}
          rows={14}
          fieldName="content"
          value={content}
          placeholder="在此写正文…"
          monospace
          onChange={(next) => update('content', next)}
        />
      ) : mode === 'split' ? (
        <div className="adm-split">
          <TextArea
            textareaRef={taRef}
            autoGrow={false}
            rows={14}
            value={content}
            placeholder="在此写正文…"
            monospace
            onChange={(next) => update('content', next)}
          />
          {/* 分屏两栏都不自带滚动条：高度由内容撑开，滚动交给 .adm-pane，
              否则同一屏里会出现两根滚动条且互相干扰 */}
          <div className="adm-preview adm-scroll">{body}</div>
        </div>
      ) : (
        <div className="adm-card adm-preview" style={{ padding: '26px 30px' }}>
          {body}
        </div>
      )}

      {!props.isNew ? (
        <FieldValue label="ID">
          <span className="font-mono-site" style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
            {draftKey}
          </span>
        </FieldValue>
      ) : (
        <FieldValue label="状态">
          <span className="font-mono-site" style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
            本地草稿 —— 首次保存后落库
          </span>
        </FieldValue>
      )}

      {/* 浮动工具条 */}
      <div className="adm-dock">
        {MODES.map((item) => (
          <button
            key={item.value}
            type="button"
            className="adm-dock-btn"
            aria-pressed={mode === item.value}
            onClick={() => setMode(item.value)}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
        <span className="adm-dock-sep" />
        <span className="label-site" style={{ padding: '0 8px', minWidth: 62, textAlign: 'center' }}>
          {dirty ? '有改动' : '已同步'}
        </span>
        {props.isNew ? (
          <LinkButton onClick={props.onDiscard}>放弃</LinkButton>
        ) : (
          <>
            {/* 已落库文章：放弃（丢弃草稿）与删除并列 —— 之前只渲染了删除，
                onDiscard 传了却没有入口，改完只能靠保存或刷新才能脱身 */}
            <LinkButton onClick={props.onDiscard} disabled={!dirty}>
              放弃
            </LinkButton>
            {props.onDelete ? (
              <DangerConfirm size="sm" label="删除" confirmLabel="确认删除" onConfirm={props.onDelete} />
            ) : null}
          </>
        )}
        <Button
          variant="primary"
          size="sm"
          icon={<Icon.Save size={14} />}
          loading={saving}
          onClick={save}
        >
          保存
        </Button>
      </div>
    </div>
  );
}

/** 标题的错误包裹：贴着标题框渲染（红边 + 错误文字），而不是只弹 toast
 *
 * 补漏：之前这里只渲染了错误文字，标题框本身没有红边 —— 因为通用的
 * `.adm-fv--error .adm-input` 规则要求外层带 `.adm-fv--error`，而标题是
 * 自定义字段（无框、只靠底线），根本没这个类。结果最显眼的字段出错时
 * 只有一行红字。现在补上类名，具体视觉在 CSS 里按标题的语言单独处理。 */
function FieldRowLike(props: { error?: string; children: React.ReactNode }) {
  if (!props.error) return <>{props.children}</>;
  return (
    <span className="adm-fv--error adm-fv--title" style={{ display: 'block' }}>
      {props.children}
      <span className="adm-field-error" role="alert" style={{ display: 'block', marginTop: 6 }}>
        {props.error}
      </span>
    </span>
  );
}

/** 新建文章的空白值（本地草稿用，不再直接写库） */
export function blankArticleDraft(fields: ContentField[]): Record<string, unknown> {
  const draft: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.type === 'string[]') draft[field.name] = [];
    else if (field.type === 'enum') draft[field.name] = field.enumValues?.[0] ?? '';
    else if (field.type === 'number') draft[field.name] = 0;
    else draft[field.name] = '';
  }
  draft.title = '';
  draft.status = 'draft';
  draft.content = '';
  return draft;
}
