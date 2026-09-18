export default defineEventHandler(async () => {
  try {
    const projects = await listProjectsFromDb();
    return { code: 0, data: { items: projects } };
  } catch (err) {
    console.error("[blog/projects]", err);
    return { code: 1, message: "failed to load projects", data: { items: [] } };
  }
});
