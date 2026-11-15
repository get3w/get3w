// A reload can supersede the first navigation while the runtime is warming up.
// Keep waiting for that replacement instead of treating ERR_ABORTED as fatal.
export async function loadStartupUrl(contents, url) {
  try {
    await contents.loadURL(url);
  } catch (error) {
    if (error?.code !== "ERR_ABORTED" || contents.isDestroyed()) throw error;
    if (contents.getURL() !== url) throw error;
    if (!contents.isLoadingMainFrame()) return;
    await new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        contents.removeListener("did-finish-load", finished);
        contents.removeListener("did-fail-load", failed);
        contents.removeListener("destroyed", destroyed);
      };
      const finished = () => { cleanup(); resolve(); };
      const failed = (_event, code, description, _url, mainFrame) => {
        if (!mainFrame || code === -3) return;
        cleanup(); reject(new Error(`Startup navigation failed: ${description} (${code})`));
      };
      const destroyed = () => { cleanup(); reject(error); };
      const timer = setTimeout(() => { cleanup(); reject(error); }, 120_000);
      contents.on("did-finish-load", finished);
      contents.on("did-fail-load", failed);
      contents.on("destroyed", destroyed);
    });
  }
}
