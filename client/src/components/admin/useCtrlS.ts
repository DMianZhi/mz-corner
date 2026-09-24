// Ctrl/Cmd+S 保存。四个面板原先各写一遍，且**四处都没有依赖数组** ——
// 每次渲染都会重注册一次 window 监听（在正文输入框里每敲一个字都重注册一遍）。
//
// 这里用 ref 持最新回调，依赖数组只留 [disabled]，监听只注册一次。
import { useEffect, useRef } from 'react';

export function useCtrlS(options: { onSave: () => void; disabled?: boolean }): void {
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (!latest.current.disabled) latest.current.onSave();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [options.disabled]);
}
