// 保存编排：原先四个面板各写一遍 40~50 行的「客户端校验 → 字段定位 → 服务端错误映射
// → 重试 toast → 401 退登录门」。收敛到这里后只剩一份，且有 savePlan 单测兜住决策逻辑。
//
// 保存动作由调用方以 `save` 回调注入 —— 所以站点设置的「批量保存」也能复用同一套错误处理。
import { useState } from 'react';
import { toast } from 'sonner';
import type { ContentField } from '@/services/admin-api';
import { focusFirstError, type FieldErrors } from './SchemaForm';
import { planFailure, planSave } from './savePlan';

export function useSaveAction(options: {
  fields: ContentField[];
  values: Record<string, unknown>;
  setErrors: (errors: FieldErrors) => void;
  onAuthLost: () => void;
  /** 真正落库的动作；抛错即走 planFailure 归类 */
  save: () => Promise<void>;
  successMessage?: string;
  /** 保存成功后的额外动作（刷新列表、清选中、跳转等） */
  onSuccess?: () => Promise<void> | void;
}) {
  const { fields, values, setErrors, onAuthLost, save } = options;
  const [saving, setSaving] = useState(false);

  const run = async (): Promise<void> => {
    const plan = planSave({ fields, values });
    if (plan.kind === 'invalid') {
      setErrors(plan.errors);
      focusFirstError(fields, plan.errors);
      toast.error(plan.message);
      return;
    }

    setSaving(true);
    try {
      await save();
      setErrors({});
      if (options.successMessage) toast.success(options.successMessage);
      await options.onSuccess?.();
    } catch (error) {
      const failure = planFailure({ fields, error });
      if (failure.kind === 'auth-lost') {
        onAuthLost();
        return;
      }
      if (failure.kind === 'field-errors') {
        setErrors(failure.errors);
        focusFirstError(fields, failure.errors);
        toast.error(failure.message);
      } else {
        toast.error(failure.message, { action: { label: '重试', onClick: () => void run() } });
      }
    } finally {
      setSaving(false);
    }
  };

  return { saving, run };
}
