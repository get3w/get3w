interface DevOpenworkProxyOptions {
  target: string;
  changeOrigin: boolean;
  ws: boolean;
  rewrite: (path: string) => string;
}

export function devOpenworkProxy(env: NodeJS.ProcessEnv): Record<string, DevOpenworkProxyOptions> {
  if (env.GET3W_DEV_MODE !== "1" || !env.GET3W_DEV_GET3W_PROXY_TARGET) return {};
  const target = new URL(env.GET3W_DEV_GET3W_PROXY_TARGET);
  if (target.protocol !== "http:" || target.hostname !== "127.0.0.1" || !target.port
    || target.username || target.password || target.pathname !== "/" || target.search || target.hash) {
    throw new Error("Invalid development-only Get3W proxy configuration.");
  }
  return {
    "/api/openwork": {
      target: target.origin,
      changeOrigin: true,
      ws: true,
      rewrite: (path: string) => path.replace(/^\/api\/openwork(?=\/|\?|$)/, "") || "/",
    },
  };
}
