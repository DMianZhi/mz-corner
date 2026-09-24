// 保存决策层：把「校验 → 归类 → 计数」从组件里抽成纯函数。
//
// 抽它的原因很具体：这三件事原先在四个面板里各写一遍 ——
// 「N 处需要修正」的计数散在 3 个文件共 9 处，401 判定散在 6 个文件共 11 处，
// 任何一处漏改就是行为不一致。收敛到这里后只剩一份，且有单测兜住。
//
// 纯函数只做决策，副作用（toast / 聚焦 / setSaving）留给 useSaveAction。
import type { ContentField } from '@/services/admin-api';
import { mapLabelErrorsToFields, validateValues, type FieldErrors } from './SchemaForm';

export type { FieldErrors };

/** 客户端预检结果：不过则一个请求都不发 */
export type SavePlan =
  | { kind: 'invalid'; errors: FieldErrors; message: string }
  | { kind: 'proceed' };

/** 服务端失败的三种结局 */
export type FailurePlan =
  | { kind: 'auth-lost' }
  | { kind: 'field-errors'; errors: FieldErrors; message: string }
  | { kind: 'retry'; message: string };

export function errorCount(errors: FieldErrors): number {
  return Object.keys(errors).length;
}

/** 保存前的客户端校验（用服务端下发的同一份 schema 预检，审计 P2-5） */
export function planSave(options: {
  fields: ContentField[];
  values: Record<string, unknown>;
}): SavePlan {
  const errors = validateValues(options.fields, options.values);
  if (errorCount(errors) > 0) {
    return { kind: 'invalid', errors, message: `保存失败，有 ${errorCount(errors)} 处需要修正` };
  }
  return { kind: 'proceed' };
}

/**
 * 服务端失败的归类（审计 P2-4）：
 * 401 优先判定 —— 会话过期时该看到重新登录，而不是一堆红色报错；
 * 其余按「服务端中文句子以字段 label 开头」映射回字段；
 * 映射不到才退回顶部 toast（带重试入口）。
 */
export function planFailure(options: { fields: ContentField[]; error: unknown }): FailurePlan {
  const { error } = options;
  if (error instanceof Error && error.name === 'Unauthorized') return { kind: 'auth-lost' };

  const message = error instanceof Error ? error.message : '保存失败';
  const errors = mapLabelErrorsToFields(options.fields, message);
  if (errors) {
    return { kind: 'field-errors', errors, message: `保存失败，有 ${errorCount(errors)} 处需要修正` };
  }
  return { kind: 'retry', message };
}
