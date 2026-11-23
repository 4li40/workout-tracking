import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
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
