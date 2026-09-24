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
//
// 后台重构 T6：草稿状态与保存编排改走共享单元（useDocumentDraft / useSaveAction /
// useCtrlS / SaveDock），文章独有的部分（三态切换、正文自动增高、ResizeObserver
// 宽度重算、本地新建的 local: 虚拟文档）**全部原样保留**。
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Markdown } from '@/components/Markdown';
import { updateContent, type ContentDocument, type ContentField } from '@/services/admin-api';
import { asText, SchemaForm } from './SchemaForm';
import { StatusText } from './status';
import { clearDraft } from './draftStore';
import { SaveDock } from './SaveDock';
import { useCtrlS } from './useCtrlS';
import { useDocumentDraft } from './useDocumentDraft';
import { useSaveAction } from './useSaveAction';
import {
  Badge,
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

  // 草稿优先初始化 + 统一订阅 + 清字段错误都收在 hook 里（审计 P0-1）。
  // isNew 透传：本地新建的虚拟文档还没有「已保存」态，dirty 恒真。
  // ⚠️ 本组件由 ArticlesPanel 以 key={selected._id} 挂载 —— hook 的 values 只在挂载时
  // 读一次，少了 key 会把上一条的值整份写进当前条草稿。
  const draft = useDocumentDraft({
    collection: 'articles',
    document: props.article,
    fields: props.fields,
    isNew: props.isNew,
  });
  const { values, update, dirty, errors, setErrors } = draft;

  const [mode, setMode] = useState<EditorMode>('edit');

  // 保存编排（客户端校验 → 字段定位 → 服务端错误映射 → 重试 → 401 退登录门）与
  // 其余三个面板共用一份。
  // ⚠️ onSaved 留在 save 内、clearDraft 之后 —— 改前就是这个顺序，**不要**挪到 onSuccess：
  // 「已保存」提示必须晚于列表刷新，否则会出现「提示已保存但列表还是旧的」。
  const action = useSaveAction({
    fields: props.fields,
    values,
    setErrors,
    onAuthLost: props.onAuthLost,
    save: async () => {
      if (props.isNew) {
        if (!props.onSaveNew) throw new Error('本地新建缺少落库回调');
        await props.onSaveNew(values);
        return;
      }
      await updateContent('articles', draftKey, values);
      clearDraft('articles', draftKey);
      await props.onSaved();
    },
    successMessage: '已保存',
  });

  useCtrlS({ onSave: () => void action.run(), disabled: action.saving });

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

      {/* 浮动工具条 —— 与其余三个面板同一个 SaveDock。
          三态按钮组走 leading（排在状态文案之前）、放弃/删除走 before（排在保存按钮之前），
          顺序与改前逐字一致。
          ⚠️ 保存按钮**刻意不设 disabled**：本地新建时 dirty 恒真，已落库文章也允许
          重复保存（改前就没有 disabled）。SaveDock 的 disabled 缺省是 !dirty，
          所以这里必须显式传 false，否则保存按钮会被永久禁用。 */}
      <SaveDock
        leading={
          <>
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
          </>
        }
        status={dirty ? '有改动' : '已同步'}
        disabled={false}
        saving={action.saving}
        onSave={() => void action.run()}
        before={
          props.isNew ? (
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
          )
        }
      />
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
