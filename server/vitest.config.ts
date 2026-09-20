import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const serverRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "~~": serverRoot,
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".output/**", ".nitro/**"],
  },
});
