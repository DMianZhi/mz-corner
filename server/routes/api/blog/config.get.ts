import { createError, defineEventHandler } from "h3";
import { getSiteConfig } from "~~/services/blog-service";
import { errorMessage } from "~~/utils/errors";

/** GET /api/blog/config — 站点配置（key-value，缺项回退默认值） */
export default defineEventHandler(async () => {
  try {
    return { code: 0, data: await getSiteConfig() };
  } catch (error: unknown) {
    console.error("[blog/config]", errorMessage(error));
    throw createError({ statusCode: 500, statusMessage: "failed to load site config" });
  }
});
