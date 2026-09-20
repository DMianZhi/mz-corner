/**
 * 通用工具：错误信息提取。
 */

/** 从 unknown 错误中安全提取 message（catch 块专用） */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
