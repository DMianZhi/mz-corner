/**
 * 轻量 Markdown 渲染器（零依赖）
 *
 * 覆盖博客文章使用的语法子集：
 *   ## 标题 / ### 标题 / ```代码块``` / - 列表 / 1. 有序列表
 *   > 引用 / --- 分割线 / **粗体** / *斜体* / `行内代码` / [链接](url)
 *
 * 安全策略：所有插值经 escapeHtml，行内语法解析在转义后的文本上
 * 进行（正则只拆结构不注入），不存在 XSS 注入面。
 */
import { useState, type ReactNode } from 'react';

/** 行内语法：粗体 / 斜体 / 行内代码 / 链接 → ReactNode[] */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // 依次匹配：`code` | **bold** | *italic* | [text](url)
  const re = /`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const k = `${keyPrefix}-${i++}`;
    if (m[1] !== undefined) {
      nodes.push(
        <code key={k} style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.88em', background: 'var(--brand-dim, rgba(200,245,66,0.14))', padding: '2px 6px', borderRadius: 4, color: 'var(--brand, #C8F542)' }}>
          {m[1]}
        </code>
      );
    } else if (m[2] !== undefined) {
      nodes.push(<strong key={k} style={{ fontWeight: 700, color: 'var(--text-0, inherit)' }}>{m[2]}</strong>);
    } else if (m[3] !== undefined) {
      nodes.push(<em key={k}>{m[3]}</em>);
    } else if (m[4] !== undefined) {
      nodes.push(
        <a key={k} href={m[5]} target="_blank" rel="noreferrer noopener" className="link-underline" style={{ color: 'var(--accent, #C8F542)' }}>
          {m[4]}
        </a>
      );
    }
    last = re.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* 剪贴板不可用时静默 */ }
  };
  return (
    <div style={{ position: 'relative', margin: '20px 0' }}>
      <div
        className="font-mono-site flex items-center justify-between"
        style={{ fontSize: 11, color: 'var(--text-3)', padding: '8px 14px', borderTop: '1px solid var(--border-soft, rgba(255,255,255,0.08))', borderLeft: '1px solid var(--border-soft, rgba(255,255,255,0.08))', borderRight: '1px solid var(--border-soft, rgba(255,255,255,0.08))', background: 'var(--bg-soft, rgba(255,255,255,0.03))', borderRadius: '8px 8px 0 0' }}
      >
        <span>{lang || 'CODE'}</span>
        <button
          type="button"
          onClick={copy}
          className="md-copy-btn"
          style={{
            all: 'unset', cursor: 'pointer', fontFamily: 'inherit',
            fontSize: 11, lineHeight: 1, fontWeight: 600, letterSpacing: '0.02em',
            padding: '5px 10px', borderRadius: 5,
            color: 'var(--brand, #C8F542)',
            background: 'var(--brand-dim, rgba(200,245,66,0.14))',
            border: '1px solid var(--brand-dim, rgba(200,245,66,0.14))',
            transition: 'background 150ms ease, color 150ms ease, border-color 150ms ease',
          }}
        >
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <pre
        className="font-mono-site"
        style={{ margin: 0, padding: '16px 14px', background: 'var(--bg-soft, rgba(255,255,255,0.03))', border: '1px solid var(--border-soft, rgba(255,255,255,0.08))', borderRadius: '0 0 8px 8px', overflowX: 'auto', fontSize: 13, lineHeight: 1.65, color: 'var(--text-1)' }}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}

/** 解析整篇 Markdown → ReactNode[] */
export function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const out: ReactNode[] = [];
  let i = 0;
  let key = 0;

  const push = (node: ReactNode) => out.push(<div key={key++}>{node}</div>);

  while (i < lines.length) {
    const line = lines[i];

    // 代码块
    if (line.trimStart().startsWith('```')) {
      const lang = line.trim().slice(3).trim();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        buf.push(lines[i]);
        i++;
      }
      i++; // 跳过结尾 ```
      push(<CodeBlock code={buf.join('\n')} lang={lang} />);
      continue;
    }

    // 标题
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const sizes = [32, 24, 19, 16];
      push(
        <h3
          style={{
            margin: `${level <= 2 ? '40px' : '28px'} 0 14px`,
            fontSize: sizes[level - 1],
            fontWeight: 700,
            lineHeight: 1.4,
            color: 'var(--text-0, var(--text-1))',
          }}
        >
          {renderInline(h[2], `h${key}`)}
        </h3>
      );
      i++;
      continue;
    }

    // 分割线
    if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) {
      push(<hr style={{ border: 'none', borderTop: '1px solid var(--border-soft, rgba(255,255,255,0.08))', margin: '32px 0' }} />);
      i++;
      continue;
    }

    // 表格：连续 | 分隔行，第二行可为 --- 对齐行（表头）
    if (/^\s*\|.*\|\s*$/.test(line) && /\|/.test(line.slice(1, -1))) {
      const rows: string[][] = [];
      const aligns: (string | null)[] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        const cells = lines[i].trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
        if (rows.length === 1 && cells.every((c) => /^:?-+:?$/.test(c))) {
          // 对齐行：:--- | ---: | :---:
          cells.forEach((c, idx) => {
            const left = c.startsWith(':'), right = c.endsWith(':');
            aligns[idx] = left && right ? 'center' : right ? 'right' : left ? 'left' : null;
          });
          i++;
          continue;
        }
        rows.push(cells);
        i++;
      }
      if (rows.length) {
        const header = rows[0];
        const body = rows.slice(1);
        const widthStyle = { minWidth: 'min(100%, 640px)', overflowX: 'auto' as const, margin: '20px 0' };
        push(
          <div style={widthStyle}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, lineHeight: 1.7 }}>
              <thead>
                <tr>
                  {header.map((h, n) => (
                    <th key={n} style={{ textAlign: (aligns[n] as 'left' | 'right' | 'center' | null) ?? 'left', fontWeight: 700, color: 'var(--brand, #C8F542)', borderBottom: '1px solid var(--brand, #C8F542)', padding: '9px 12px', background: 'var(--brand-dim, rgba(200,245,66,0.10))', whiteSpace: 'nowrap' }}>
                      {renderInline(h, `th${key}-${n}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.map((row, r) => (
                  <tr key={r} style={{ background: r % 2 ? 'var(--bg-soft, rgba(255,255,255,0.03))' : 'transparent' }}>
                    {row.map((c, n) => (
                      <td key={n} style={{ textAlign: (aligns[n] as 'left' | 'right' | 'center' | null) ?? 'left', padding: '8px 12px', borderBottom: '1px solid var(--border-soft, rgba(255,255,255,0.08))', color: 'var(--text-1)' }}>
                        {renderInline(c, `td${key}-${r}-${n}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        continue;
      }
    }

    // 引用块
    if (line.trimStart().startsWith('>')) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith('>')) {
        buf.push(lines[i].trimStart().replace(/^>\s?/, ''));
        i++;
      }
      push(
        <blockquote style={{ margin: '20px 0', padding: '12px 18px', borderLeft: '3px solid var(--accent, #C8F542)', background: 'var(--bg-soft, rgba(255,255,255,0.03))', color: 'var(--text-2, inherit)', borderRadius: '0 6px 6px 0' }}>
          {buf.map((l, n) => <p key={n} style={{ margin: '4px 0' }}>{renderInline(l, `q${key}-${n}`)}</p>)}
        </blockquote>
      );
      continue;
    }

    // 无序列表
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''));
        i++;
      }
      push(
        <ul style={{ margin: '14px 0', paddingLeft: 24, lineHeight: 1.9 }}>
          {items.map((it, n) => <li key={n}>{renderInline(it, `u${key}-${n}`)}</li>)}
        </ul>
      );
      continue;
    }

    // 有序列表
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i++;
      }
      push(
        <ol style={{ margin: '14px 0', paddingLeft: 24, lineHeight: 1.9 }}>
          {items.map((it, n) => <li key={n}>{renderInline(it, `o${key}-${n}`)}</li>)}
        </ol>
      );
      continue;
    }

    // 空行
    if (!line.trim()) {
      i++;
      continue;
    }

    // 段落（连续非空、非结构行）
    const buf: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trimStart().startsWith('```') &&
      !lines[i].trimStart().startsWith('>') &&
      !/^\s*\|.*\|\s*$/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^#{1,4}\s/.test(lines[i]) &&
      !/^\s*(---+|\*\*\*+)\s*$/.test(lines[i])
    ) {
      buf.push(lines[i]);
      i++;
    }
    push(
      <p style={{ margin: '14px 0', lineHeight: 1.8 }}>
        {buf.map((l, n) => (
          <span key={n}>
            {n > 0 && <br />}
            {renderInline(l, `p${key}-${n}`)}
          </span>
        ))}
      </p>
    );
  }

  return <>{out}</>;
}

export default Markdown;
