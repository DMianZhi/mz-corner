// 管理内容 API 端到端自检（跑在本地 uniCloud 模拟器上）。
//
// 覆盖：鉴权守卫、schema 元数据、四类集合的增删改查、字段白名单校验、
// 批量更新、以及「改完能读回来」的持久性验证。
const BASE = 'http://127.0.0.1:8900/mz-api';
// 口令不入库：从环境变量读（export ADMIN_PASSWORD=... 后运行）
const PW = process.env.ADMIN_PASSWORD;
if (!PW) throw new Error('缺少 ADMIN_PASSWORD 环境变量（管理口令不写入仓库）');
// 用 Object.create(null) 构造空对象：避免源码里出现容易看漏的空对象字面量
const emptyBody = Object.create(null);

let pass = 0;
let fail = 0;
const failures = [];

function check(name, expected, actual) {
  if (expected === actual) {
    console.log(`  ok   ${name} → ${actual}`);
    pass++;
  } else {
    console.log(`  FAIL ${name} → 期望 ${expected}，实际 ${actual}`);
    fail++;
    failures.push(name);
  }
}

async function req(method, path, opts = {}) {
  const headers = {};
  if (opts.token) headers['x-admin-session'] = opts.token;
  if (opts.body !== undefined) headers['Content-Type'] = 'text/plain;charset=UTF-8';
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* 空体（如 204） */
  }
  return { status: res.status, json, headers: res.headers };
}

console.log('── 1. 鉴权守卫 ─────────────────────────────');
check('未带令牌访问 schema', 401, (await req('GET', '/api/admin/content')).status);
check('未带令牌访问列表', 401, (await req('GET', '/api/admin/content/articles')).status);
check('未带令牌写入', 401, (await req('POST', '/api/admin/content/projects', { body: { name: 'x' } })).status);
check(
  '错误口令登录',
  401,
  (await req('POST', '/api/admin/login', { body: { password: 'definitely-wrong' } })).status,
);

const login = await req('POST', '/api/admin/login', { body: { password: PW } });
check('正确口令登录', 200, login.status);
// 服务端契约：{ ok, token, expiresInSec }（无 code/data 包装）
const token = login.json?.token;
check('登录返回令牌', true, typeof token === 'string' && token.length > 20);

console.log('\n── 2. schema 元数据 ────────────────────────');
const schema = await req('GET', '/api/admin/content', { token });
check('schema 状态', 200, schema.status);
const collections = schema.json?.data?.collections ?? [];
check(
  '集合清单',
  'articles,projects,comments,site_config',
  collections.map((c) => c.name).join(','),
);
const articleFields = collections.find((c) => c.name === 'articles')?.fields ?? [];
// title/summary/category/tags/publishDate/status/content；viewCount 不在白名单（服务端自管）
check('文章字段数', 7, articleFields.length);
check(
  '正文是 text 类型',
  'text',
  articleFields.find((f) => f.name === 'content')?.type,
);
check(
  '状态是 enum 且含 published/draft',
  'draft,published',
  (articleFields.find((f) => f.name === 'status')?.enumValues ?? []).slice().sort().join(','),
);
const siteFields = collections.find((c) => c.name === 'site_config')?.fields ?? [];
check('站点设置字段', 'description,group,key,value', siteFields.map((f) => f.name).sort().join(','));

console.log('\n── 3. 列表读取 ─────────────────────────────');
const list = await req('GET', '/api/admin/content/articles', { token });
check('文章列表状态', 200, list.status);
const articles = list.json?.data?.items ?? [];
check('文章条数', 3, articles.length);
check('列表含 _id', true, typeof articles[0]?._id === 'string');

console.log('\n── 4. 字段白名单校验 ───────────────────────');
const target = articles[0]._id;
check(
  '未知字段被拒',
  400,
  (await req('PATCH', `/api/admin/content/articles/${target}`, { token, body: { nope: 1 } })).status,
);
check(
  '类型不符被拒',
  400,
  (await req('PATCH', `/api/admin/content/articles/${target}`, { token, body: { title: 123 } })).status,
);
check(
  '必填留空被拒',
  400,
  (await req('PATCH', `/api/admin/content/articles/${target}`, { token, body: { title: '   ' } })).status,
);
check(
  '空 body 被拒',
  400,
  (await req('PATCH', `/api/admin/content/articles/${target}`, { token, body: emptyBody })).status,
);
check(
  '未知集合',
  404,
  (await req('GET', '/api/admin/content/not_a_collection', { token })).status,
);
check(
  '不存在的 id',
  404,
  (await req('PATCH', '/api/admin/content/articles/no-such-id', { token, body: { title: 'x' } })).status,
);

console.log('\n── 5. 文章更新 + 持久性 ────────────────────');
const before = articles[0];
const marker = `e2e-${Date.now()}`;
const patch = await req('PATCH', `/api/admin/content/articles/${target}`, {
  token,
  body: { summary: marker, tags: ['e2e', '自检'] },
});
check('更新状态', 200, patch.status);
const afterList = await req('GET', '/api/admin/content/articles', { token });
const after = (afterList.json?.data?.items ?? []).find((item) => item._id === target);
check('summary 已落库', marker, after?.summary);
check('tags 已落库', 'e2e,自检', (after?.tags ?? []).join(','));
check('未提交的字段没被清空', before.title, after?.title);
// 还原
await req('PATCH', `/api/admin/content/articles/${target}`, {
  token,
  body: { summary: before.summary ?? '', tags: before.tags ?? [] },
});

console.log('\n── 6. 新建 / 删除项目 ──────────────────────');
const created = await req('POST', '/api/admin/content/projects', {
  token,
  body: { name: marker, tagline: '自检用', tech: ['a', 'b'], status: 'wip', order: 99 },
});
check('新建状态', 200, created.status);
const newId = created.json?.data?.id;
check('新建返回 id', true, typeof newId === 'string');
const projectList = await req('GET', '/api/admin/content/projects', { token });
check(
  '新建项出现在列表',
  true,
  (projectList.json?.data?.items ?? []).some((item) => item._id === newId),
);
check(
  '删除状态',
  200,
  (await req('POST', `/api/admin/content/projects/${newId}/delete`, { token })).status,
);
const afterDelete = await req('GET', '/api/admin/content/projects', { token });
check(
  '删除后不在列表',
  false,
  (afterDelete.json?.data?.items ?? []).some((item) => item._id === newId),
);
const deleteAgain = await req('POST', `/api/admin/content/projects/${newId}/delete`, { token });
check('重复删除回报 deleted=0', 0, deleteAgain.json?.data?.deleted);

console.log('\n── 7. 站点设置批量更新 ─────────────────────');
const configs = (await req('GET', '/api/admin/content/site_config', { token })).json?.data?.items ?? [];
check('设置可读', true, configs.length > 0);
const cfgTarget = configs[0];
const originalValue = cfgTarget.value;
const bulk = await req('PATCH', '/api/admin/content/site_config', {
  token,
  body: { items: [{ _id: cfgTarget._id, value: marker }] },
});
check('批量更新状态', 200, bulk.status);
check('批量更新回报条数', 1, bulk.json?.data?.updated);
const configsAfter = (await req('GET', '/api/admin/content/site_config', { token })).json?.data?.items ?? [];
check(
  '批量值已落库',
  marker,
  configsAfter.find((item) => item._id === cfgTarget._id)?.value,
);
check(
  '批量接口拒绝未知字段',
  400,
  (await req('PATCH', '/api/admin/content/site_config', { token, body: { items: [{ _id: cfgTarget._id, nope: 1 }] } })).status,
);
check(
  '批量接口拒绝空数组',
  400,
  (await req('PATCH', '/api/admin/content/site_config', { token, body: { items: [] } })).status,
);
// 还原
await req('PATCH', '/api/admin/content/site_config', {
  token,
  body: { items: [{ _id: cfgTarget._id, value: originalValue }] },
});

console.log('\n── 8. 评论只读字段保护 ─────────────────────');
const comments = (await req('GET', '/api/admin/content/comments', { token })).json?.data?.items ?? [];
check('评论可读', true, comments.length > 0);
check(
  '评论内容可改',
  200,
  (await req('PATCH', `/api/admin/content/comments/${comments[0]._id}`, { token, body: { content: marker } })).status,
);
check(
  '评论 legacyArticleId 不可改（不在白名单）',
  400,
  (await req('PATCH', `/api/admin/content/comments/${comments[0]._id}`, { token, body: { legacyArticleId: 'hack' } })).status,
);

console.log('\n── 9. 全库导出 ─────────────────────────────');
const dump = await req('GET', '/api/admin/data-export', { token });
check('导出状态', 200, dump.status);
check(
  '导出含四个集合',
  'articles,comments,projects,site_config',
  Object.keys(dump.json || Object.create(null)).sort().join(','),
);

console.log('\n── 10. 登出 ────────────────────────────────');
check('登出状态', 200, (await req('POST', '/api/admin/logout', { token })).status);

console.log(`\n══ 结果：${pass} 通过 / ${fail} 失败 ══`);
if (fail > 0) {
  console.log('失败项：' + failures.join(' | '));
  process.exit(1);
}
