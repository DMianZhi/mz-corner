// 取线上真实文章数据，供 demo 使用（只读）
const fs = require('node:fs');
const base = process.env.UNICLOUD_URL_BASE;
if (!base) throw new Error('缺少 UNICLOUD_URL_BASE');

(async () => {
  const r = await fetch(base + '/api/blog/posts?page=1&pageSize=30');
  const j = await r.json();
  const items = j.items || (j.data && j.data.items) || [];
  console.log('顶层键:', Object.keys(j).join(','));
  console.log('条数:', items.length);
  const first = items[0];
  console.log('字段:', first ? Object.keys(first).join(',') : '(空)');
  const slim = items.map((p, i) => ({
    i: i + 1,
    title: p.title,
    category: p.category || (p.tags && p.tags[0]) || '未分类',
    date: String(p.publishDate || '').slice(0, 10).replace(/\//g, '-'),
    views: p.viewCount || 0,
    status: p.status || 'published',
  }));
  fs.mkdirSync('.wpscomate', { recursive: true });
  fs.writeFileSync('.wpscomate/demo-data.json', JSON.stringify(slim, null, 1));
  console.log(JSON.stringify(slim.slice(0, 5)));
  console.log('类别:', [...new Set(slim.map((x) => x.category))].join(' / '));
})();
