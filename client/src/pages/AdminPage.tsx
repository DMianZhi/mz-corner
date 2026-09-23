// 管理后台页面壳（方案 B：主编工作台）。
//
// 结构：
//   登录门 → 顶栏（品牌 + 下划线标签 + 全库导出 / 退出）→ 工作台（左索引 + 右详情）
//   四个内容集合各是一个面板组件，面板内部自带「索引 + 详情」两栏，
//   所以切换标签不会丢失「左栏始终在、右栏只换内容」这一工作台手感。
//
// 样式全部走 styles/admin.css 的 `adm-*` 类，那里引用站点设计令牌，
// 因此配色与前台完全同源，明暗主题跟随 html.light 自动切换。
import '@/styles/admin.css';
import { useEffect, useState } from 'react';
import { draftTotal, subscribeDrafts } from '@/components/admin/draftStore';
import { toast } from 'sonner';
import { ArticlesPanel } from '@/components/admin/ArticlesPanel';
import { CommentsPanel } from '@/components/admin/CommentsPanel';
import { ProjectsPanel } from '@/components/admin/ProjectsPanel';
import { SiteConfigPanel } from '@/components/admin/SiteConfigPanel';
import { asText } from '@/components/admin/SchemaForm';
import {
  Badge,
  Button,
  EmptyState,
  Icon,
  Kicker,
  LinkButton,
  Tabs,
  TextInput,
} from '@/components/admin/ui';
import {
  exportData,
  fetchContentSchema,
  getSession,
  listContent,
  login,
  logout,
  type ContentCollectionMeta,
  type ContentDocument,
} from '@/services/admin-api';

type Phase = 'probing' | 'locked' | 'ready';
type TabKey = 'articles' | 'projects' | 'comments' | 'site_config';

/** 401 一律退回登录门：会话过期时用户该看到重新登录，而不是一堆红色报错 */
function isUnauthorized(error: unknown): boolean {
  return error instanceof Error && error.name === 'Unauthorized';
}

function LoginGate(props: { onOk: () => void }) {
  const [pwd, setPwd] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!pwd || busy) return;
    setBusy(true);
    setError('');
    try {
      const info = await login(pwd);
      if (info.authenticated) props.onOk();
      else setError('口令不正确');
    } catch (err) {
      // 口令错时服务端回 401，parse 会抛出 name=Unauthorized 的错误，
      // 直接展示它的 message（"UNAUTHORIZED"）对用户毫无意义
      if (err instanceof Error && err.name === 'Unauthorized') setError('口令不正确');
      else setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        // shell 已是固定高度 flex 列，这里用 flex:1 吃掉剩余高度；
        // minHeight:0 才允许它在内容过高时收缩并自身滚动，而不是撑破 shell。
        // 顶部让位已由 .adm-shell 的 padding-top 承担，此处不再重复加 nav 高度。
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        display: 'grid',
        placeItems: 'center',
        padding: '24px',
      }}
    >
      <div className="adm-card adm-fade" style={{ width: '100%', maxWidth: 380, padding: 30 }}>
        <Kicker num="06" label="MANAGE" />
        <div className="adm-brand" style={{ margin: '14px 0 6px' }}>
          <span className="adm-brand-mark">
            <Icon.Lock size={13} />
          </span>
          <h1 className="adm-brand-text">管理后台</h1>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 22px', lineHeight: 1.6 }}>
          输入管理口令以编辑站点内容。会话有效期 7 天，期间无需重复登录。
        </p>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <TextInput value={pwd} onChange={setPwd} placeholder="管理口令" disabled={busy} type="password" autoComplete="current-password" autoFocus revealable ariaLabel="管理口令" />
          {error ? (
            <div className="adm-field-error" style={{ marginTop: 8 }}>
              {error}
            </div>
          ) : null}
          <div style={{ marginTop: 16 }}>
            <Button variant="primary" full loading={busy} type="submit" disabled={!pwd}>
              登录
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [phase, setPhase] = useState<Phase>('probing');
  const [tab, setTab] = useState<TabKey>('articles');
  const [schema, setSchema] = useState<ContentCollectionMeta[]>([]);
  const [articles, setArticles] = useState<ContentDocument[]>([]);
  const [projects, setProjects] = useState<ContentDocument[]>([]);
  const [comments, setComments] = useState<ContentDocument[]>([]);
  const [config, setConfig] = useState<ContentDocument[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    void bootstrap();
    // 仅在挂载时探测一次会话
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 未保存草稿计数（顶栏徽标）：draftStore 变化即刷新
  const [pendingCount, setPendingCount] = useState(draftTotal());
  useEffect(() => {
    setPendingCount(draftTotal());
    return subscribeDrafts(() => setPendingCount(draftTotal()));
  }, []);

  // 关闭/刷新标签页前的最后防线（P0-1）：有草稿时让浏览器先问一句。
  // 注意这只兜「整个页面要没了」；站内切换由各面板的草稿层保住。
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (draftTotal() === 0) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, []);

  const loadAll = async () => {
    const [meta, nextArticles, nextProjects, nextComments, nextConfig] = await Promise.all([
      fetchContentSchema(),
      listContent('articles'),
      listContent('projects'),
      listContent('comments'),
      listContent('site_config'),
    ]);
    setSchema(meta);
    setArticles(nextArticles);
    setProjects(nextProjects);
    setComments(nextComments);
    setConfig(nextConfig);
  };

  const bootstrap = async () => {
    const session = await getSession();
    if (!session.authenticated) {
      setPhase('locked');
      return;
    }
    try {
      await loadAll();
      setLoadError('');
      setPhase('ready');
    } catch (error) {
      if (isUnauthorized(error)) {
        setPhase('locked');
        return;
      }
      setLoadError(error instanceof Error ? error.message : '加载失败');
      setPhase('ready');
    }
  };

  const reload = async (name: TabKey) => {
    const items = await listContent(name);
    if (name === 'articles') setArticles(items);
    else if (name === 'projects') setProjects(items);
    else if (name === 'comments') setComments(items);
    else setConfig(items);
  };

  const fieldsOf = (name: string) => schema.find((item) => item.name === name)?.fields ?? [];

  const counts: Record<TabKey, number> = {
    articles: articles.length,
    projects: projects.length,
    comments: comments.length,
    site_config: config.length,
  };

  const doExport = async () => {
    setBusy(true);
    try {
      const data = await exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `mz-corner-export-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success('已导出全库 JSON');
    } catch (error) {
      if (isUnauthorized(error)) setPhase('locked');
      else toast.error(error instanceof Error ? error.message : '导出失败');
    } finally {
      setBusy(false);
    }
  };

  const authLost = () => setPhase('locked');

  if (phase === 'probing') {
    return (
      <div className="adm-shell">
        <EmptyState icon={<Icon.Spinner size={20} />} title="正在校验会话…" />
      </div>
    );
  }

  if (phase === 'locked') {
    return (
      <div className="adm-shell">
        <LoginGate
          onOk={() => {
            setPhase('probing');
            void bootstrap();
          }}
        />
      </div>
    );
  }

  return (
    <div className="adm-shell">
      {/* 键盘用户的第一个停靠点（P4）：省掉「穿过顶栏 6 个链接」才能到内容 */}
      {/* HashRouter 下 href="#x" 会把 hash 当路由改掉（实测直接跳出 /admin），
          所以拦住默认行为、手动把焦点移到主内容 */}
      <a
        className="adm-skip"
        href="#adm-main"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('adm-main')?.focus();
        }}
      >
        跳到主内容
      </a>
      <header className="adm-topbar">
        <div className="adm-brand">
          <span className="adm-brand-mark">
            <Icon.Sliders size={13} />
          </span>
          <h1 className="adm-brand-text">管理后台</h1>
        </div>

        {pendingCount > 0 ? (
          <span title={`${pendingCount} 处改动未保存，站内切换不会丢失，关闭标签页前请先保存`}>
            <Badge tone="brand">{pendingCount} 未保存</Badge>
          </span>
        ) : null}

        <Tabs<TabKey>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'articles', label: '文章', count: counts.articles, panelId: 'adm-tabpanel-articles' },
            { value: 'projects', label: '项目', count: counts.projects, panelId: 'adm-tabpanel-projects' },
            { value: 'comments', label: '评论', count: counts.comments, panelId: 'adm-tabpanel-comments' },
            { value: 'site_config', label: '站点设置', count: counts.site_config, panelId: 'adm-tabpanel-site_config' },
          ]}
        />

        <span style={{ flex: 1 }} />

        <LinkButton onClick={doExport} disabled={busy}>
          导出全库
        </LinkButton>
        <LinkButton
          onClick={async () => {
            await logout();
            setPhase('locked');
            toast.success('已退出登录');
          }}
        >
          退出
        </LinkButton>
      </header>

      {loadError ? (
        <div
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '10px var(--gutter)',
            borderBottom: '1px solid var(--border-soft)',
            background: 'color-mix(in srgb, var(--danger) 10%, transparent)',
            fontSize: 13,
          }}
        >
          <span style={{ color: 'var(--danger)', display: 'flex' }}>
            <Icon.Warning size={16} />
          </span>
          <span>{loadError}</span>
          <span style={{ flex: 1 }} />
          <Button
            size="sm"
            icon={<Icon.Refresh size={14} />}
            onClick={() => {
              setPhase('probing');
              void bootstrap();
            }}
          >
            重试
          </Button>
        </div>
      ) : null}

      <main id="adm-main" tabIndex={-1} className="adm-main">
      {tab === 'articles' ? (
        <div id={`adm-tabpanel-${tab}`} role="tabpanel" aria-labelledby={`adm-tab-${tab}`} className="adm-tabpanel">
        <ArticlesPanel
          fields={fieldsOf('articles')}
          documents={articles}
          onReload={() => reload('articles')}
          onAuthLost={authLost}
        />
        </div>
      ) : null}

      {tab === 'projects' ? (
        <div id={`adm-tabpanel-${tab}`} role="tabpanel" aria-labelledby={`adm-tab-${tab}`} className="adm-tabpanel">
        <ProjectsPanel
          fields={fieldsOf('projects')}
          documents={projects}
          onReload={() => reload('projects')}
          onAuthLost={authLost}
        />
        </div>
      ) : null}

      {tab === 'comments' ? (
        <div id={`adm-tabpanel-${tab}`} role="tabpanel" aria-labelledby={`adm-tab-${tab}`} className="adm-tabpanel">
        <CommentsPanel
          fields={fieldsOf('comments')}
          documents={comments}
          articleTitles={Object.fromEntries(articles.map((doc) => [doc._id, asText(doc.title)]))}
          onReload={() => reload('comments')}
          onAuthLost={authLost}
        />
        </div>
      ) : null}

      {tab === 'site_config' ? (
        <div id={`adm-tabpanel-${tab}`} role="tabpanel" aria-labelledby={`adm-tab-${tab}`} className="adm-tabpanel">
        <SiteConfigPanel
          fields={fieldsOf('site_config')}
          documents={config}
          onReload={() => reload('site_config')}
          onAuthLost={authLost}
        />
        </div>
      ) : null}
      </main>
    </div>
  );
}
