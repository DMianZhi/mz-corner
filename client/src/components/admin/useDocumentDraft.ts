// 逐文档草稿状态：四个面板原先各写一遍同一套「草稿优先初始化 + 统一订阅 + 清错误」。
//
// ⚠️ 调用方约束：使用本 hook 的组件必须**每个文档一个实例**（`key={doc._id}`）。
// 因为 values 只在挂载时初始化一次 —— 若把 hook 直接放进面板本体（详情内联渲染、
// 没有 key 的写法），切换文档时 values 还是上一条的，update 里的
// `{ ...values, [name]: value }` 会把**上一条的值整份写进当前条的草稿**（静默数据损坏）。
import { useState, useSyncExternalStore } from 'react';
import type { ContentDocument, ContentField } from '@/services/admin-api';
import { draftTotal, getDraft, setDraft, subscribeDrafts } from './draftStore';
import type { FieldErrors } from './SchemaForm';

function pickValues(
  fields: ContentField[],
  document: ContentDocument,
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const field of fields) values[field.name] = document[field.name];
  return values;
}

export function useDocumentDraft(options: {
  collection: string;
  document: ContentDocument;
  fields: ContentField[];
  /** 本地新建（未落库）文档的草稿 key，默认用 document._id */
  draftKey?: string;
  /** 本地新建：文档还没落库，「已保存」态不存在，dirty 恒真 */
  isNew?: boolean;
}) {
  const { collection, document, fields } = options;
  const draftKey = options.draftKey ?? document._id;

  // 草稿优先：上次没保存就离开的文档，回到这里要能看到改动还在（审计 P0-1）
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const draft = getDraft(collection, draftKey);
    if (draft) return draft.values;
    return pickValues(fields, document);
  });
  const [errors, setErrors] = useState<FieldErrors>({});

  // draftStore 变化时重渲：dirty 由此推导，左栏的草稿点也靠它
  useSyncExternalStore(subscribeDrafts, draftTotal);

  const dirty = Boolean(options.isNew) || getDraft(collection, draftKey) !== null;

  // 副作用留在 updater 之外：updater 在渲染期执行，里面写草稿会同步通知订阅方改状态
  const update = (name: string, value: unknown) => {
    const next = { ...values, [name]: value };
    setValues(next);
    setDraft(collection, draftKey, next);
    if (name in errors) {
      const cleared: FieldErrors = { ...errors };
      delete cleared[name];
      setErrors(cleared);
    }
  };

  return { values, update, dirty, errors, setErrors, draftKey };
}
