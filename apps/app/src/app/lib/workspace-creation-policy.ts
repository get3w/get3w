import { isGet3wGatewayRuntime } from "./gateway-runtime";

export function canCreateWorkspaces() {
  return !isGet3wGatewayRuntime();
}
