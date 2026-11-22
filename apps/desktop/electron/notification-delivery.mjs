// Keep native notifications alive after their submission promise settles.
const activeNotifications = new Set();
export function retainDesktopNotification(notification, lifetimeMs = 24 * 60 * 60 * 1000) {
  activeNotifications.add(notification);
  const release = () => {
    clearTimeout(timer);
    notification.removeListener("close", release);
    notification.removeListener("click", release);
    notification.removeListener("failed", release);
    activeNotifications.delete(notification);
  };
  const timer = setTimeout(release, lifetimeMs);
  timer.unref?.();
  notification.once("close", release);
  notification.once("click", release);
  notification.once("failed", release);
  return release;
}
/**
 * System acknowledgement only; this does not prove the user saw the notification.
 * @param {import("electron").Notification} notification
 * @param {number} timeoutMs
 * @returns {Promise<import("@get3w/types/desktop-ipc").DesktopNotificationResult>}
 */
export function submitDesktopNotification(notification, timeoutMs = 10000) {
  const release = retainDesktopNotification(notification);
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      notification.removeListener("show", onShow);
      notification.removeListener("failed", onFailed);
    };
    const onShow = () => { cleanup(); resolve({ ok: true }); };
    const onFailed = (_event, error) => { cleanup(); resolve({ ok: false, reason: String(error || "Notification submission failed") }); };
    const timer = setTimeout(() => { cleanup(); reject(new Error("Notification submission was not confirmed")); }, timeoutMs);
    notification.once("show", onShow);
    notification.once("failed", onFailed);
    try { notification.show(); }
    catch (error) { cleanup(); release(); resolve({ ok: false, reason: error instanceof Error ? error.message : "Notification submission failed" }); }
  });
}
export function notificationRunHref(value) {
  return typeof value === "string" && /^\/workspace\/[A-Za-z0-9_%.-]+\/session\/[A-Za-z0-9_%.-]+\?runMessage=[A-Za-z0-9_%.-]+$/.test(value) ? value : null;
}

/** Keep click navigation identical for native acceptance and the desktop window. */
export async function openNotificationRun(value, focus, navigate) {
  await focus();
  const href = notificationRunHref(value);
  if (href) await navigate(href);
}

/** Use the same branded options for application notifications and native acceptance. */
export function desktopNotificationOptions({ title, body, silent, icon, platform = process.platform }) {
  return {
    title,
    ...(body ? { body } : {}),
    ...(silent === true ? { silent: true } : {}),
    ...(platform !== "darwin" && icon && !icon.isEmpty() ? { icon } : {}),
  };
}
