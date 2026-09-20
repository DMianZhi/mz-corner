import { defineEventHandler } from "h3";
import { listProjects } from "~~/services/blog-service";
import { errorMessage } from "~~/utils/errors";

/** GET /api/blog/projects — 项目列表（按排序字段升序） */
export default defineEventHandler(async () => {
  try {
    return { code: 0, data: { items: await listProjects() } };
  } catch (error: unknown) {
    console.error("[blog/projects]", errorMessage(error));
    return { code: 1, message: "failed to load projects", data: { items: [] } };
  }
});
