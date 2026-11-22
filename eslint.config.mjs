import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import convexPlugin from "@convex-dev/eslint-plugin";

export default defineConfig([
  globalIgnores([".agents/**", ".claude/**", "convex/_generated/**"]),
  ...nextCoreWebVitals,
  ...nextTypescript,
  ...convexPlugin.configs.recommended,
]);
