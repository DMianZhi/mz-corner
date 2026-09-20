import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { SiteConfig } from '@/types/blog';
import { getSiteConfig } from '@/services/blog-api';

/** 默认配置：接口不可用时的兜底（与后端 DEFAULT_CONFIG 一致） */
const FALLBACK: SiteConfig = {
  name: '敏智',
  nameEn: 'MIN ZHI',
  role: 'FULL-STACK DEVELOPER',
  location: '31.23°N, 121.47°E — SHANGHAI',
  email: 'minzhi@example.com',
  bio: '我是敏智，一名全栈开发者。喜欢把想法变成能跑的产品，关注前端体验与工程效率。这个网站既是我的项目陈列室，也是我写字的地方。',
  skills: ['React', 'TypeScript', 'Node.js', 'Nitro', 'Tailwind', 'Go'],
  github: '',
  twitter: '',
  footerNote: 'DESIGNED & BUILT BY MIN ZHI',
};

const ConfigContext = createContext<SiteConfig>(FALLBACK);

export function useSiteConfig(): SiteConfig {
  return useContext(ConfigContext);
}

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<SiteConfig>(FALLBACK);

  useEffect(() => {
    let alive = true;
    getSiteConfig()
      .then((c) => { if (alive && c?.name) setConfig(c); })
      .catch(() => {/* 接口不可用时保持兜底 */});
    return () => { alive = false; };
  }, []);

  return <ConfigContext.Provider value={config}>{children}</ConfigContext.Provider>;
}
