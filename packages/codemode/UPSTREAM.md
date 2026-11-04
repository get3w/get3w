# Upstream provenance

- Repository: https://github.com/anomalyco/opencode
- Branch: `dev`
- Commit: `38e10eb`
- Vendored: 2026-08-09

## Dropped upstream files

- `src/openapi/`
- `test/openapi.test.ts`
- `test/fixtures/` (used only by the dropped OpenAPI test)

## Local divergences

- The package is published internally as `@openwork/codemode` with repository-local package metadata and TypeScript configuration.
- The OpenAPI export was removed with the dropped OpenAPI implementation.
- Host-supplied named bindings can be exposed as read-only program-scope variables through `CodeMode.execute` and `CodeMode.make`.
- Upstream pins `acorn` 8.15.0; this workspace pins 8.16.0 to reuse the existing workspace resolution.
