import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

execSync("pnpm --filter ./apps/desktop build", { stdio: "inherit", cwd: root });
