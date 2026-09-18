import { createClient } from "@wps365-open/appbase-js";

/**
 * Create an AppBase client scoped to the current request.
 *
 * - `projectId`: from Nitro runtimeConfig (production), falls back to
 *   incoming `X-Project-Id` header (local dev, injected by Vite proxy).
 * - Auth: forwards cookies from the incoming request.
 *
 * Usage in a route handler:
 * ```ts
 * export default defineEventHandler(async (event) => {
 *   const client = useAppBase(event)
 *   const { data, error } = await client.from('todos').select()
 *   return { data, error }
 * })
 * ```
 */
export function useAppBase(event: Parameters<Parameters<typeof defineEventHandler>[0]>[0]) {
  const config = useRuntimeConfig(event);
  const cookie = getHeader(event, "cookie");
  const projectId = (config.projectId as string) || getHeader(event, "x-project-id") || "";

  return createClient({
    projectId,
    fetch: (url, init) =>
      globalThis.fetch(url, {
        ...init,
        headers: {
          ...(init?.headers as Record<string, string>),
          ...(cookie ? { cookie } : {}),
        },
      }),
    auth: { persistSession: false },
  });
}
