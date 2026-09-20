import { defineEventHandler } from "h3";
import { activeBlogProviderName, isDatabaseAvailable } from "~~/data";

/**
 * GET /api/health — 部署自检：数据源与云数据库是否就绪。
 *
 * 只暴露「是否就绪」，不返回集合名与条数——这是个公开端点，
 * 数据规模属于内部信息，需要看条数用 seed 接口的回执或控制台。
 */
export default defineEventHandler(() => {
  const provider = activeBlogProviderName();
  const databaseReady = isDatabaseAvailable();

  return {
    code: 0,
    data: {
      ok: databaseReady,
      provider,
      database: databaseReady ? "ready" : "unavailable",
      time: new Date().toISOString(),
    },
  };
});
