// 管理后台页（HashRouter: /#/admin）。
//
// 三态流转：session 探测中 → 未登录（口令表单） → 已登录（文章列表 + 编辑器）。
// 视觉遵循 Apple HIG：系统字体栈、--bg/--text-1 语义色随明暗、内联 SVG 图标。
import { useEffect, useState, type CSSProperties } from 'react';
import { toast } from 'sonner';
import {
  getSession,
  exportData,
  listAllArticles,
  getArticleContent,
  saveArticleContent,
  login,
  type AdminArticle,
} from '@/services/admin-api';
import { Markdown } from '@/components/Markdown';

type Phase = 'probing' | 'locked' | 'ready';

// ---- 内联 SVG 图标（currentColor 继承，无 emoji） ----
const IconLock = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="5" y="10.5" width="14" height="9.5" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
    <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);
const IconSave = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const IconDownload = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 19.5h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const IconLogout = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M14 8V6.5A2.5 2.5 0 0 0 11.5 4H6.5A2.5 2.5 0 0 0 4 6.5v11A2.5 2.5 0 0 0 6.5 20h5a2.5 2.5 0 0 0 2.5-2.5V16M9.5 12H20m0 0l-3.5-3.5M20 12l-3.5 3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const cardStyle: CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border-soft)',
  borderRadius: 18,
  padding: '40px 44px',
  maxWidth: 400,
  margin: '0 auto',
  boxShadow: '0 8px 32px rgba(0,0,0,0.06)',
};

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '11px 14px',
  borderRadius: 10,
  border: '1px solid var(--border-soft)',
  background: 'var(--bg)',
  color: 'var(--text-1)',
  fontSize: 15,
  outline: 'none',
};

const btnPrimaryStyle: CSSProperties = {
  width: '100%',
  padding: '12px 0',
  borderRadius: 10,
  border: 'none',
  background: 'var(--brand)',
  color: '#fff',
  fontSize: 15,
  fontWeight: 600,
  cursor: 'pointer',
};

function LoginGate(props: { onOk: () => void }) {
  const [pwd, setPwd] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    if (!pwd || busy) return;
    setBusy(true);
    setErr('');
    try {
      await login(pwd);
      setPwd('');
      props.onOk();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '登录失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={cardStyle}>
      <div style={{ textAlign: 'center', color: 'var(--text-2)', marginBottom: 18 }}>
        <IconLock />
      </div>
      <h1 className="m-0" style={{ fontSize: 20, fontWeight: 700, textAlign: 'center', color: 'var(--text-1)' }}>
        管理登录
      </h1>
      <p style={{ fontSize: 13, color: 'var(--text-2)', textAlign: 'center', margin: '10px 0 24px' }}>
        输入管理口令解锁内容编辑
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <input
          type="password"
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
          placeholder="管理口令"
          autoFocus
          autoComplete="current-password"
          style={inputStyle}
        />
        {err ? <div style={{ fontSize: 13, color: '#e0524d' }}>{err}</div> : null}
        <button type="submit" disabled={busy || !pwd} style={{ ...btnPrimaryStyle, opacity: busy || !pwd ? 0.5 : 1 }}>
          {busy ? '验证中…' : '登录'}
        </button>
      </form>
    </div>
  );
}

function Dashboard(props: { onLogout: () => void }) {
  const [articles, setArticles] = useState<AdminArticle[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let alive = true;
    listAllArticles()
      .then((items) => {
        if (alive) setArticles(items);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : '加载失败'))
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const openArticle = async (id: string) => {
    try {
      const art = await getArticleContent(id);
      setActiveId(id);
      setDraft(art.content);
      setDirty(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载文章失败');
    }
  };

  const save = async () => {
    if (!activeId || !dirty || saving) return;
    setSaving(true);
    try {
      await saveArticleContent(activeId, draft.trim());
      toast.success('已保存');
      setDirty(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const download = async () => {
    try {
      const data = await exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mz-corner-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('已导出全库 JSON');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '导出失败');
    }
  };

  const active = articles.find((a) => a.id === activeId) ?? null;
  const list = [...articles].sort((a, b) => (a.publishDate < b.publishDate ? 1 : -1));

  return (
    <div className="mx-auto" style={{ maxWidth: 'var(--content-w)', padding: '0 var(--gutter) 80px' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 24 }}>
        <div>
          <div className="kicker-site"><span className="kicker-num">99</span>ADMIN</div>
          <h1 className="text-h1-site m-0 mt-2" style={{ color: 'var(--text-1)', fontSize: 26 }}>内容管理</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => void download()}
            className="flex items-center gap-1.5"
            style={{
              padding: '8px 14px', borderRadius: 10, fontSize: 13,
              border: '1px solid var(--border-soft)', background: 'var(--bg-card)',
              color: 'var(--text-2)', cursor: 'pointer',
            }}
          >
            <IconDownload /> 导出全库
          </button>
          <button
            onClick={props.onLogout}
            className="flex items-center gap-1.5"
            style={{
              padding: '8px 14px', borderRadius: 10, fontSize: 13,
              border: '1px solid var(--border-soft)', background: 'var(--bg-card)',
              color: 'var(--text-2)', cursor: 'pointer',
            }}
          >
            <IconLogout /> 退出
          </button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-12">
        {/* 文章列表 */}
        <div className="md:col-span-4">
          <div style={{ ...cardStyle, padding: 18, margin: 0, maxHeight: 560, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ fontSize: 13, color: 'var(--text-2)', padding: '12px 4px' }}>加载中…</div>
            ) : (
              list.map((a) => (
                <button
                  key={a.id}
                  onClick={() => void openArticle(a.id)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '12px 14px', borderRadius: 10, border: 'none',
                    background: a.id === activeId ? 'rgba(0,122,255,0.10)' : 'transparent',
                    color: a.id === activeId ? 'var(--brand)' : 'var(--text-1)',
                    fontSize: 14, fontWeight: a.id === activeId ? 600 : 400,
                    cursor: 'pointer', marginBottom: 4,
                  }}
                >
                  <div style={{ WebkitLineClamp: 1, overflow: 'hidden' }}>{a.title || a.id}</div>
                  <div className="font-mono-site" style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>
                    {a.publishDate} · {a.viewCount} 阅读 · {a.status}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* 编辑器 */}
        <div className="md:col-span-8">
          {!active ? (
            <div style={{ ...cardStyle, padding: 36, textAlign: 'center', color: 'var(--text-2)', fontSize: 14 }}>
              从左侧选择一篇文章开始编辑
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)' }}>{active.title}</div>
                <button
                  onClick={() => void save()}
                  disabled={!dirty || saving}
                  className="flex items-center gap-1.5"
                  style={{
                    padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                    border: 'none', background: 'var(--brand)', color: '#fff',
                    cursor: dirty && !saving ? 'pointer' : 'default',
                    opacity: dirty && !saving ? 1 : 0.4,
                  }}
                >
                  <IconSave /> {saving ? '保存中…' : '保存'}
                </button>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <textarea
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    setDirty(true);
                  }}
                  spellCheck={false}
                  style={{
                    width: '100%', minHeight: 480, padding: 16, borderRadius: 12,
                    border: '1px solid var(--border-soft)', background: 'var(--bg)',
                    color: 'var(--text-1)', fontSize: 13.5, lineHeight: 1.75,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    outline: 'none', resize: 'vertical',
                  }}
                />
                <div
                  style={{
                    minHeight: 480, padding: 16, borderRadius: 12, overflowY: 'auto',
                    border: '1px solid var(--border-soft)', background: 'var(--bg-card)',
                    maxHeight: 640,
                  }}
                >
                  <Markdown source={draft || '（预览区）'} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [phase, setPhase] = useState<Phase>('probing');

  useEffect(() => {
    let alive = true;
    getSession().then((s) => {
      if (alive) setPhase(s.authenticated ? 'ready' : 'locked');
    });
    return () => {
      alive = false;
    };
  }, []);

  if (phase === 'probing') {
    return (
      <div style={{ paddingTop: 'calc(var(--nav-h) + 80px)', textAlign: 'center', color: 'var(--text-2)', fontSize: 14 }}>
        正在检查登录态…
      </div>
    );
  }
  if (phase === 'locked') {
    return (
      <div style={{ paddingTop: 'calc(var(--nav-h) + 64px)' }}>
        <LoginGate onOk={() => setPhase('ready')} />
      </div>
    );
  }
  return (
    <div className="page-enter" style={{ paddingTop: 'calc(var(--nav-h) + 40px)' }}>
      <Dashboard onLogout={() => setPhase('locked')} />
    </div>
  );
}
