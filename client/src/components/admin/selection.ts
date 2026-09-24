// 左栏选中项的解析 —— 抽成纯函数（而不是 hook）有两个好处：
//   1. 它是纯计算，没有生命周期，没必要占一个 hook
//   2. 纯函数可以单测，而 hook 在本仓库没有 jsdom 的前提下测不了
//
// 解决审计 P3-7：首屏 selectedId 还是 null，右栏已经在编辑第一条，
// 但左栏一行都不亮 —— 高亮必须用「解析后」的选中项判定。
export function resolveSelection<T extends { _id: string }>(
  documents: T[],
  selectedId: string | null,
): T | null {
  return documents.find((doc) => doc._id === selectedId) ?? documents[0] ?? null;
}
