# AGENTS.md

Get3W is a local-first desktop workspace. This release contains `apps/app`,
`apps/desktop`, local `apps/server` and their shared packages.

Preserve personal files, profiles, credentials and history. Use isolated test data.
Keep original third-party notices. Do not publish to an upstream remote.

## Coding

* pnpm only, never npm/yarn. TypeScript: never `any`, typecasts, or `as` unless
  100% necessary or instructed.
* Prefer Tailwind, React, shadcn/ui (Base UI), TanStack Query, Zustand, Zod,
  Drizzle, Better-Auth. Reuse `@/components`; end users are non-technical.
* Any user-facing UI (desktop app, MCP Apps, artifact views) follows
  `DESIGN.md`: read it before designing, cite its rule ids in PRs, and attach
  screenshots of new UI.

## Verification

Run `pnpm typecheck` and the relevant `scripts/check-public-*.py` and
`scripts/verify-public-*.py` checks. Prefer headless tests for renderer work;
use a separate profile for native acceptance. Never treat a build as proof of an
installed or signed release. Do not open the user's installed app for automated tests.
