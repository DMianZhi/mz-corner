// 管理后台页面壳（方案 B：顶部标签 + 全页沉浸编辑）。
//
// 结构：
//   登录门 → 顶栏（品牌 + 分段标签 + 全库导出 / 退出）→ 四个内容面板
//   文章面板选中一篇后，整页切换为沉浸式编辑器（列表被替换，而非弹窗/侧滑）
//
// 样式全部走 styles/admin.css 的 `adm-*` 类，那里引用站点设计令牌，
// 因此配色与前台完全同源，明暗主题跟随 html.light 自动切换。
import '@/styles/admin.css';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ArticleEditor, blankArticleDraft } from '@/components/admin/ArticleEditor';
import { CommentsPanel } from '@/components/admin/CommentsPanel';
import { ProjectsPanel } from '@/components/admin/ProjectsPanel';
import { asText } from '@/components/admin/SchemaForm';
import { SiteConfigPanel } from '@/components/admin/SiteConfigPanel';
import { Badge, Button, EmptyState, Icon, MonoLabel, Tabs, TextInput } from '@/components/admin/ui';
import {
  createContent,
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

const STATUS_LABELS: Record<string, string> = { published: '已发布', draft: '草稿' };

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
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        // 登录卡在 nav 以下的区域居中（与其它页面同一套让位约定）
        padding: 'calc(var(--nav-h) + 24px) 24px 24px',
      }}
    >
      <div className="adm-card adm-fade" style={{ width: '100%', maxWidth: 380, padding: 30 }}>
        <div className="adm-brand" style={{ marginBottom: 6 }}>
          <span className="adm-brand-mark">
            <Icon.Lock size={14} />
          </span>
          <span className="adm-brand-text">管理后台</span>
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
          <TextInput value={pwd} onChange={setPwd} placeholder="管理口令" disabled={busy} />
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    void bootstrap();
    // 仅在挂载时探测一次会话
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const createArticle = async () => {
    setBusy(true);
    try {
      const id = await createContent('articles', blankArticleDraft(fieldsOf('articles')));
      await reload('articles');
      setEditingId(id);
      toast.success('已新建草稿');
    } catch (error) {
      if (isUnauthorized(error)) setPhase('locked');
      else toast.error(error instanceof Error ? error.message : '新建失败');
    } finally {
      setBusy(false);
    }
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

  if (phase === 'probing') {
    return (
      <div className="adm-shell" style={{ minHeight: '100vh' }}>
        <div className="adm-empty" style={{ paddingTop: 120 }}>
          <Icon.Spinner size={22} />
          <span style={{ fontSize: 13 }}>正在校验会话…</span>
        </div>
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

  const editing = editingId ? articles.find((doc) => doc._id === editingId) ?? null : null;

  return (
    <div className="adm-shell" style={{ minHeight: '100vh' }}>
      <header className="adm-topbar">
        <div className="adm-brand">
          <span className="adm-brand-mark">
            <Icon.Sliders size={14} />
          </span>
          <span className="adm-brand-text">管理后台</span>
        </div>

        <Tabs<TabKey>
          value={tab}
          onChange={(next) => {
            setTab(next);
            setEditingId(null);
          }}
          options={[
            { value: 'articles', label: '文章', icon: <Icon.Article size={14} />, count: counts.articles },
            { value: 'projects', label: '项目', icon: <Icon.Folder size={14} />, count: counts.projects },
            { value: 'comments', label: '评论', icon: <Icon.Comment size={14} />, count: counts.comments },
            { value: 'site_config', label: '站点设置', icon: <Icon.Sliders size={14} />, count: counts.site_config },
          ]}
        />

        <span style={{ flex: 1 }} />

        <Button size="sm" variant="quiet" icon={<Icon.Download size={14} />} loading={busy} onClick={doExport}>
          导出全库
        </Button>
        <Button
          size="sm"
          variant="quiet"
          icon={<Icon.Logout size={14} />}
          onClick={async () => {
            await logout();
            setPhase('locked');
            toast.success('已退出登录');
          }}
        >
          退出
        </Button>
      </header>

      <main className="adm-page">
        {loadError ? (
          <div
            className="adm-card"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '14px 18px',
              marginBottom: 20,
              borderColor: 'var(--danger)',
            }}
          >
            <span style={{ color: 'var(--danger)' }}>
              <Icon.Warning size={16} />
            </span>
            <span style={{ fontSize: 13 }}>{loadError}</span>
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

        {tab === 'articles' ? (
          editing ? (
            <ArticleEditor
              article={editing}
              fields={fieldsOf('articles')}
              onSaved={() => reload('articles')}
              onBack={() => setEditingId(null)}
            />
          ) : (
            <div className="adm-fade">
              <div className="adm-col-head" style={{ marginBottom: 14 }}>
                <MonoLabel style={{ letterSpacing: '0.16em' }}>
                  全部文章 · {articles.length}
                </MonoLabel>
                <hr className="adm-divider" style={{ flex: 1 }} />
                <Button
                  size="sm"
                  variant="primary"
                  icon={<Icon.Plus size={14} />}
                  loading={busy}
                  onClick={createArticle}
                >
                  新建文章
                </Button>
              </div>

              {articles.length === 0 ? (
                <div className="adm-card">
                  <EmptyState
                    icon={<Icon.Article size={18} />}
                    title="还没有文章"
                    hint="点右上角「新建文章」开始写第一篇。"
                  />
                </div>
              ) : (
                <div className="adm-list">
                  {articles.map((doc) => {
                    const status = asText(doc.status);
                    return (
                      <button
                        key={doc._id}
                        type="button"
                        className="adm-row"
                        onClick={() => setEditingId(doc._id)}
                      >
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span className="adm-row-title" style={{ display: 'block' }}>
                            {asText(doc.title) || '(无标题)'}
                          </span>
                          <span
                            style={{
                              display: 'block',
                              fontSize: 12,
                              color: 'var(--text-3)',
                              marginTop: 3,
                            }}
                          >
                            {asText(doc.category) || '未分类'} ·{' '}
                            {asText(doc.publishDate) || '未设日期'}
                          </span>
                        </span>
                        <span className="adm-row-meta">
                          {asText(doc.viewCount) ? `${asText(doc.viewCount)} 次阅读` : ''}
                        </span>
                        <Badge tone={status === 'published' ? 'brand' : 'muted'}>
                          {STATUS_LABELS[status] ?? status ?? '—'}
                        </Badge>
                        <span style={{ color: 'var(--text-3)' }}>
                          <Icon.ChevronRight size={15} />
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* 数据概览：给「这台后台管着多少东西」一个总览 */}
              <div style={{ marginTop: 34 }}>
                <MonoLabel style={{ letterSpacing: '0.16em' }}>概览</MonoLabel>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                    gap: 12,
                    marginTop: 10,
                  }}
                >
                  {(
                    [
                      ['文章', counts.articles],
                      ['项目', counts.projects],
                      ['评论', counts.comments],
                      ['站点设置', counts.site_config],
                    ] as Array<[string, number]>
                  ).map(([label, count]) => (
                    <div key={label} className="adm-card" style={{ padding: '16px 18px' }}>
                      <MonoLabel>{label}</MonoLabel>
                      <div
                        style={{
                          fontSize: 26,
                          fontWeight: 600,
                          letterSpacing: '-0.02em',
                          marginTop: 6,
                          color: 'var(--brand)',
                        }}
                      >
                        {count}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )
        ) : null}

        {tab === 'projects' ? (
          <ProjectsPanel
            fields={fieldsOf('projects')}
            documents={projects}
            onReload={() => reload('projects')}
          />
        ) : null}

        {tab === 'comments' ? (
          <CommentsPanel
            fields={fieldsOf('comments')}
            documents={comments}
            articleTitles={Object.fromEntries(articles.map((doc) => [doc._id, asText(doc.title)]))}
            onReload={() => reload('comments')}
          />
        ) : null}

        {tab === 'site_config' ? (
          <SiteConfigPanel
            fields={fieldsOf('site_config')}
            documents={config}
            onReload={() => reload('site_config')}
          />
        ) : null}
      </main>
    </div>
  );
}
