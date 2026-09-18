import { errorMessage, getSiteConfig } from "~~/utils/blog-db";

export default defineEventHandler(async (event) => {
  try {
    const config = await getSiteConfig();
    return { code: 0, data: config };
  } catch (err) {
    console.error('[blog/config]', errorMessage(err));
    throw createError({ statusCode: 500, statusMessage: 'failed to load site config' });
  }
});
