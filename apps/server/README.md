# Get3W local Server

The Server hosts the desktop workspace API, local engine integration, file access,
personal Provider and MCP configuration. It is a private workspace package;
upstream npm publication commands are not part of this release.

Build from the repository root with `pnpm --filter openwork-server build`.
Run `pnpm --filter openwork-server typecheck` and the targeted tests for your
change. The `openwork-server` package and command name are
retained as internal compatibility identifiers.

Organization services, enterprise Gateway and cloud resource synchronization are
unavailable. Do not expose the local authenticated API to the internet.
