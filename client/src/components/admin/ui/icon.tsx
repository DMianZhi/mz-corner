// 管理后台 UI 基元 · 图标。
//
// 约定（颜色/圆角全走 styles/admin.css 的 adm-* 类、不出现颜色字面量；图标一律内联 SVG；
// 单 props 参数 + 内联类型、不用 useMemo/useCallback）见 ./index.ts。
import type { ReactNode } from 'react';

/* ── 图标 ─────────────────────────────────────────────── */

function Svg(props: { children: ReactNode; size?: number; strokeWidth?: number }) {
  return (
    <svg
      width={props.size ?? 16}
      height={props.size ?? 16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={props.strokeWidth ?? 1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0, display: 'block' }}
    >
      {props.children}
    </svg>
  );
}

export const Icon = {
  Lock: (props: { size?: number }) => (
    <Svg size={props.size}>
      <rect x="4" y="10.5" width="16" height="10.5" rx="2.5" />
      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
    </Svg>
  ),
  Download: (props: { size?: number }) => (
    <Svg size={props.size}>
      <path d="M12 3v12" />
      <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
      <path d="M4 20h16" />
    </Svg>
  ),
  Logout: (props: { size?: number }) => (
    <Svg size={props.size}>
      <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
      <path d="m10 8-4 4 4 4" />
      <path d="M6 12h9" />
    </Svg>
  ),
  Plus: (props: { size?: number }) => (
    <Svg size={props.size}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </Svg>
  ),
  Trash: (props: { size?: number }) => (
    <Svg size={props.size}>
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="m6 7 1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </Svg>
  ),
  Check: (props: { size?: number }) => (
    <Svg size={props.size}>
      <path d="m5 13 4 4L19 7" />
    </Svg>
  ),
  Save: (props: { size?: number }) => (
    <Svg size={props.size}>
      <path d="M5 4h11l3 3v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" />
      <path d="M8 4v6h7" />
      <path d="M8 20v-5h8v5" />
    </Svg>
  ),
  Eye: (props: { size?: number }) => (
    <Svg size={props.size}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </Svg>
  ),
  EyeOff: (props: { size?: number }) => (
    <Svg size={props.size}>
      <path d="M4 4l16 16" />
      <path d="M10.6 6.1A9.6 9.6 0 0 1 12 6c6.5 0 9.5 6 9.5 6a17.6 17.6 0 0 1-2.1 2.9M6.6 7.4A16.8 16.8 0 0 0 2.5 12S6 18 12 18c1.4 0 2.7-.3 3.8-.8" />
      <path d="M9.9 10.2a3 3 0 0 0 4 4" />
    </Svg>
  ),
  Split: (props: { size?: number }) => (
    <Svg size={props.size}>
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
      <path d="M12 4.5v15" />
    </Svg>
  ),
  Pencil: (props: { size?: number }) => (
    <Svg size={props.size}>
      <path d="M4 20h4L19 9a2.5 2.5 0 0 0-3.5-3.5L4 16.5V20Z" />
      <path d="m14.5 6.5 3 3" />
    </Svg>
  ),
  ChevronRight: (props: { size?: number }) => (
    <Svg size={props.size}>
      <path d="m9.5 6 6 6-6 6" />
    </Svg>
  ),
  ChevronDown: (props: { size?: number }) => (
    <Svg size={props.size}>
      <path d="m6 9.5 6 6 6-6" />
    </Svg>
  ),
  ArrowLeft: (props: { size?: number }) => (
    <Svg size={props.size}>
      <path d="M19 12H5" />
      <path d="m11 6-6 6 6 6" />
    </Svg>
  ),
  Refresh: (props: { size?: number }) => (
    <Svg size={props.size}>
      <path d="M20 12a8 8 0 1 1-2.4-5.7" />
      <path d="M20 4v4.5h-4.5" />
    </Svg>
  ),
  ExternalLink: (props: { size?: number }) => (
    <Svg size={props.size}>
      <path d="M14 4h6v6" />
      <path d="M20 4 11 13" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </Svg>
  ),
  Warning: (props: { size?: number }) => (
    <Svg size={props.size}>
      <path d="M12 4 2.5 20h19L12 4Z" />
      <path d="M12 10v4" />
      <path d="M12 17.2h.01" />
    </Svg>
  ),
  Article: (props: { size?: number }) => (
    <Svg size={props.size}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6" />
      <path d="M9 17h4" />
    </Svg>
  ),
  Folder: (props: { size?: number }) => (
    <Svg size={props.size}>
      <path d="M3 7a2 2 0 0 1 2-2h3.6l2 2.5H19a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
    </Svg>
  ),
  Comment: (props: { size?: number }) => (
    <Svg size={props.size}>
      <path d="M20 15a3 3 0 0 1-3 3H8l-4 3V6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v9Z" />
    </Svg>
  ),
  Sliders: (props: { size?: number }) => (
    <Svg size={props.size}>
      <path d="M4 8h9" />
      <path d="M19 8h1" />
      <circle cx="16" cy="8" r="2" />
      <path d="M4 16h4" />
      <path d="M14 16h6" />
      <circle cx="11" cy="16" r="2" />
    </Svg>
  ),
  Spinner: (props: { size?: number }) => (
    <Svg size={props.size} strokeWidth={2}>
      <path className="adm-spin" d="M12 3a9 9 0 1 0 9 9" style={{ transformOrigin: '12px 12px' }} />
    </Svg>
  ),
};

