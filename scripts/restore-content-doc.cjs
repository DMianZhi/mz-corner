'use strict';
/**
 * 按 _id 恢复被误删的内容文档（单条写入，不动其他文档）。
 *
 * 为什么需要显式 _id：评论的 articleId、站点外链都按 id 引用，换 id 会让引用断掉。
 * 走 POST /api/admin/content/articles + 会话鉴权（_id 已存在则 409，防静默覆盖）。
 *
 * 用法: ADMIN_PASSWORD=xxx node scripts/restore-content-doc.cjs [docId]   # 默认 art-01
 */
const fs = require('node:fs');

const targetId = process.argv[2] || 'art-01';

function env(key) {
  const line = fs.readFileSync('.env', 'utf8').split(/\r?\n/).find((l) => l.startsWith(key + '='));
  return line ? line.slice(key.length + 1).trim().replace(/^["']|["']$/g, '') : '';
}

const API = env('UNICLOUD_URL_BASE').replace(/\/$/, '');
const PW = process.env.ADMIN_PASSWORD;
if (!PW) throw new Error('缺少 ADMIN_PASSWORD');

// 只取可写 schema 字段（viewCount 是服务端管理的只读字段，会被 sanitize 丢弃）
const seed = JSON.parse(fs.readFileSync('uniCloud-alipay/database/articles.init_data.json', 'utf8'));
const source = seed.find((a) => a._id === targetId);
if (!source) throw new Error(`seed 里找不到 ${targetId}`);

const body = {
  _id: targetId,
  title: source.title,
  summary: source.summary,
  category: source.category,
  tags: source.tags,
  publishDate: source.publishDate,
  status: source.status,
  content: source.content,
};

(async () => {
  const login = await fetch(`${API}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: PW }),
  });
  if (login.status !== 200) throw new Error('登录失败: ' + login.status);
  const cookie = (login.headers.get('set-cookie') || '').split(';')[0].trim();

  const before = await fetch(`${API}/api/admin/content/articles/${targetId}`, { headers: { Cookie: cookie } });
  console.log(`恢复前 GET ${targetId} →`, before.status, '(404 = 确实缺失)');

  const create = await fetch(`${API}/api/admin/content/articles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(body),
  });
  const created = await create.json().catch(() => null);
  console.log('POST 创建 →', create.status, JSON.stringify(created));

  const after = await fetch(`${API}/api/admin/content/articles/${targetId}`, { headers: { Cookie: cookie } });
  const detail = await after.json().catch(() => null);
  const doc = detail.data || {};
  console.log(`恢复后 GET ${targetId} →`, after.status, '| 标题:', doc.title || '(空)', '| 正文长度:', (doc.content || '').length);

  const list = await fetch(`${API}/api/blog/posts?page=1&pageSize=100`);
  const listData = await list.json();
  const items = (listData.data && listData.data.items) || [];
  console.log('前台文章总数 →', items.length);
  console.log(`${targetId} 在前台列表 →`, items.some((p) => p.id === targetId));
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
