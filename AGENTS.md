<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

Product requirements live in `prd.md` (loaded automatically as an OpenCode instruction via `opencode.jsonc`). Treat it as the single source of truth for scope, features, data model, and success criteria.

## Tooling, dependencies, and CI parity

- **Use npm 11+ (Node 24) exclusively.** `package-lock.json` is written by npm 11 and `package.json` enforces `"engines": { "npm": ">=11" }`. Never install packages or update the lockfile with `pnpm`, `yarn`, or npm 10 (Node 22): mixing package managers hides lockfile drift locally, and npm 10 fails `npm ci` on Linux with `EBADPLATFORM` on `@typescript/native` platform entries.
- **Keep CI aligned with local tooling.** `.github/workflows/ci.yml` must match `package.json#engines` (Node 24 / npm 11) and use current GitHub Actions majors (`v5+`). Whenever you modify `package.json`, `package-lock.json`, or CI, verify clean Linux installation in a scratch directory containing copies of `package.json` and `package-lock.json` (`npm ci --os=linux --cpu=x64 --ignore-scripts`) so you don't overwrite local macOS `node_modules`.
- **Keep build and lint config single-sourced.** Put ESLint ignore patterns only in `eslint.config.mjs` (`globalIgnores`), not on the `lint` script in `package.json`. `next.config.ts` sets `typescript.ignoreBuildErrors: true`, so `npm run typecheck` (already invoked by `npm run build`) is the actual type gate—never rely on `next build` alone, and don't add a duplicate typecheck step in CI.

## Auth and route protection

- **Fail-closed `proxy.ts` matcher.** Exclude static assets strictly by an explicit list of file extensions. Never use a catch-all dot pattern like `.*\..*`, which silently lets dynamic page paths containing dots (for example, `/exercises/1.5x`) bypass the auth guard.
- **Single source of truth for route rules.** Keep redirect and public-route logic in `lib/routeGuard.ts`; do not duplicate `/auth` or `/signin` checks in `proxy.ts`.
- **Enforce auth in Convex.** `proxy.ts` only guards page shells. Every public Convex query and mutation must enforce authentication and ownership via `convex/lib/auth.ts` (`requireAuthUserId`, `requireOwnedById`, `requireReadableExercise`, `requireEditableExercise`). Do not add unused wrapper helpers around Convex Auth primitives.

## Seeds, setup steps, and dead code

- **Wire up internal setup and seed mutations end-to-end.** Never leave an internal seed or initialization mutation (such as `convex/seed.ts`'s `seedGlobalExercises`) without a caller. Make it idempotent, hook it into `npm run dev` (via `convex dev --run ...`) or the relevant lifecycle flow so fresh dev environments work automatically, and document the production command (`npx convex run ... --prod`) in `README.md`.
- **Avoid dead code and unverified assumptions.** Remove unused exports/wrappers before committing, and verify tooling or runtime hypotheses locally before changing code for them.

## Pre-PR verification

Before pushing or opening a PR, run the checks CI runs:

```bash
npm run lint
NEXT_PUBLIC_CONVEX_URL=https://ci-placeholder.convex.cloud npm run build
npx prettier --check <changed-files>
```

- When editing `proxy.ts` or `lib/routeGuard.ts`, test the matcher and redirect behavior directly against concrete paths (protected pages, dot-containing routes, `/signin`, `/auth/*`, `/authors`, `/_next/*`, and static file extensions).
- When changing `convex/schema.ts` (especially dropping or altering existing tables), note any required `npm run dev` schema push or Convex dashboard cleanup so deployments do not fail unexpectedly.
