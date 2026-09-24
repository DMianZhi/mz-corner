// 管理后台 UI 基元的桶文件（barrel）。
//
// 由原 ui.tsx（808 行）按职责拆成四份，这里统一重导出 —— 所有 `from './ui'`
// 的调用方一行都不用改。拆分是**纯搬家**：函数体一字未改。
//
// 约定：
// - 颜色/圆角/动效全部走 styles/admin.css 的 `adm-*` 类，那里再引用站点设计令牌，
//   所以这些文件**不出现任何颜色字面量**，明暗主题自动跟随
// - 图标一律内联 SVG（stroke=currentColor），不用 emoji，也不用 × / ✕ 字形
// - 遵循 client/AGENTS.md：单 props 参数 + 内联类型、不用 useMemo/useCallback
export * from './feedback';
export * from './form';
export * from './icon';
export * from './nav';
