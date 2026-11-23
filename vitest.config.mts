import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "edge-runtime",
    env: {
      CONVEX_CLOUD_URL: "https://test.convex.cloud",
    },
    exclude: [
      ...configDefaults.exclude,
      ".agents/**",
      ".claude/**",
      ".next/**",
    ],
    server: {
      deps: {
        inline: ["convex-test", "@convex-dev/auth"],
      },
    },
  },
});
