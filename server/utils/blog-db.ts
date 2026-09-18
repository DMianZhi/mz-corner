/**
 * 博客数据服务：通过 kdocs-comate-cli 读取 WPS 多维表
 *
 * 沙箱内 CLI 已带用户凭据，可直接访问多维表；
 * 预览环境（子路径代理）下前端通过相对路径 ./api/blog 请求本接口。
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const CLI = "/usr/local/bin/kdocs-comate-cli";
export const BLOG_DB_FILE_ID = "Mm7X2oX261MrecrCKUZfxx1VP1EGEhiyU";
export const ARTICLES_SHEET_ID = 2;
export const COMMENTS_SHEET_ID = 3;
export const PROJECTS_SHEET_ID = 4;

interface ArticleFields {
  标题?: string;
  内容?: string;
  分类?: string;
  标签?: string[];
  发布时间?: string;
  摘要?: string;
  阅读数?: number;
  状态?: string;
}

export interface BlogArticle {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  publishDate: string;
  summary: string;
  viewCount: number;
  status: string;
}

export interface BlogComment {
  id: string;
  articleId: string;
  author: string;
  email: string;
  content: string;
  createTime: string;
}

export interface Project {
  id: string;
  name: string;
  tagline: string;
  description: string;
  tech: string[];
  link: string;
  color: string;
  symbol: string;
  order: number;
  status: string;
}

function parseProject(record: { id: string; fields: unknown }): Project {
  const f = parseRecordFields(record.fields) as Record<string, unknown>;
  return {
    id: record.id,
    name: String(f["名称"] || ""),
    tagline: String(f["简介"] || ""),
    description: String(f["描述"] || ""),
    tech: String(f["技术栈"] || "").split(",").map((s) => s.trim()).filter(Boolean),
    link: String(f["链接"] || ""),
    color: String(f["标志色"] || "#4D6BFE"),
    symbol: String(f["符号"] || "📦"),
    order: Number(f["排序"]) || 0,
    status: String(f["状态"] || "live"),
  };
}

export async function listProjectsFromDb(): Promise<Project[]> {
  const result = await runCli("dbsheet", "list-records", {
    file_id: BLOG_DB_FILE_ID,
    sheet_id: PROJECTS_SHEET_ID,
    max_records: 50,
  });
  const records = result?.data?.detail?.records || [];
  return records
    .map(parseProject)
    .filter((p: Project) => p.name)
    .sort((a: Project, b: Project) => a.order - b.order);
}

function parseRecordFields(fields: unknown): Record<string, unknown> {
  if (typeof fields === "string") {
    try {
      return JSON.parse(fields);
    } catch {
      return {};
    }
  }
  return (fields as Record<string, unknown>) || {};
}

function parseArticle(record: { id: string; fields: unknown }): BlogArticle {
  const f = parseRecordFields(record.fields) as ArticleFields;
  return {
    id: record.id,
    title: String(f.标题 || ""),
    content: String(f.内容 || ""),
    category: String(f.分类 || "未分类"),
    tags: Array.isArray(f.标签) ? f.标签.map(String) : [],
    publishDate: String(f.发布时间 || ""),
    summary: String(f.摘要 || ""),
    viewCount: Number(f.阅读数) || 0,
    status: String(f.状态 || "草稿"),
  };
}

export function parseComment(record: { id: string; fields: unknown }): BlogComment {
  const f = parseRecordFields(record.fields) as Record<string, unknown>;
  return {
    id: record.id,
    articleId: String(f["文章ID"] || ""),
    author: String(f["评论者"] || "匿名"),
    email: String(f["邮箱"] || ""),
    content: String(f["内容"] || ""),
    createTime: String(f["发布时间"] || ""),
  };
}

export async function runCli(service: string, action: string, params: unknown): Promise<any> {
  // 通过登录 shell 调用，确保拿到与终端一致的凭证环境（keychain / WPS_SID）
  const cmd = `kdocs-comate-cli ${service} ${action} '${String(JSON.stringify(params)).replace(/'/g, "'\\''")}'`;
  const { stdout } = await execFileAsync("/bin/sh", ["-lc", cmd], { timeout: 30_000 });
  return JSON.parse(stdout);
}

export async function listArticlesFromDb(): Promise<BlogArticle[]> {
  const result = await runCli("dbsheet", "list-records", {
    file_id: BLOG_DB_FILE_ID,
    sheet_id: ARTICLES_SHEET_ID,
    max_records: 100,
  });
  // CLI 返回结构: { code, data: { result, detail: { records } } }
  const records = result?.data?.detail?.records || [];
  return records
    .map(parseArticle)
    .filter((a: BlogArticle) => a.status === "已发布" && a.title);
}

export async function getArticleFromDb(id: string): Promise<BlogArticle | null> {
  const all = await listArticlesFromDb();
  return all.find((a) => a.id === id) || null;
}

export async function listCommentsFromDb(articleId?: string): Promise<BlogComment[]> {
  const result = await runCli("dbsheet", "list-records", {
    file_id: BLOG_DB_FILE_ID,
    sheet_id: COMMENTS_SHEET_ID,
    max_records: 200,
  });
  // CLI 返回结构: { code, data: { result, detail: { records } } }
  const records = result?.data?.detail?.records || [];
  const comments = records.map(parseComment);
  return articleId ? comments.filter((c: BlogComment) => c.articleId === articleId) : comments;
}

export async function addViewToDb(
  id: string,
  nextCount: number
): Promise<boolean> {
  try {
    await runCli("dbsheet", "update-records", {
      file_id: BLOG_DB_FILE_ID,
      sheet_id: ARTICLES_SHEET_ID,
      prefer_id: false,
      records: [{ id, fields: { 阅读数: nextCount } }],
    });
    return true;
  } catch {
    return false;
  }
}

export async function updateArticleContent(
  id: string,
  content: string
): Promise<boolean> {
  try {
    await runCli("dbsheet", "update-records", {
      file_id: BLOG_DB_FILE_ID,
      sheet_id: ARTICLES_SHEET_ID,
      prefer_id: false,
      records: [{ id, fields: { 内容: content } }],
    });
    return true;
  } catch {
    return false;
  }
}

export async function addCommentToDb(input: {
  articleId: string;
  author: string;
  email: string;
  content: string;
}): Promise<BlogComment | null> {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const createTime = `${now.getFullYear()}/${pad(now.getMonth() + 1)}/${pad(now.getDate())}`;

  const result = await runCli("dbsheet", "create-records", {
    file_id: BLOG_DB_FILE_ID,
    sheet_id: COMMENTS_SHEET_ID,
    prefer_id: false,
    records: [
      {
        fields: {
          文章ID: input.articleId,
          评论者: input.author,
          邮箱: input.email,
          内容: input.content,
          发布时间: createTime,
        },
      },
    ],
  });

  const record = result?.data?.detail?.records?.[0];
  return record ? parseComment(record) : null;
}
