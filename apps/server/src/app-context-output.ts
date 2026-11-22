function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Keep discovery usable before the engine's byte/line truncation boundary.
 * Full affordance schemas stay in availableAffordances, once; repeated provider
 * catalogs use references. Off-screen lists explicitly report omitted entries.
 */
export function formatAppContextOutput(value: unknown): string {
  if (!record(value) || !record(value.context)) return JSON.stringify(value, null, 2);
  const context = { ...value.context };
  const conversations = record(context.conversations) ? { ...context.conversations } : undefined;
  if (conversations && Array.isArray(conversations.tabs)) {
    const tabs = conversations.tabs;
    const screen = record(context.screen) ? context.screen : {};
    const relevant = tabs.filter(tab => record(tab) && tab.workspaceId === screen.workspaceId);
    const others = tabs.filter(tab => !relevant.includes(tab));
    conversations.tabs = [...relevant, ...others].slice(0, 8);
    conversations.tabsTotal = tabs.length;
    conversations.tabsOmitted = Math.max(0, tabs.length - 8);
    conversations.discovery = "Use session.search then session.read for other conversations; this is a bounded preview.";
    context.conversations = conversations;
  }
  if (Array.isArray(context.resources)) {
    const resources = context.resources;
    context.resources = resources.slice(0, 8);
    context.resourcesTotal = resources.length;
    context.resourcesOmitted = Math.max(0, resources.length - 8);
  }
  if (Array.isArray(context.contributions)) {
    context.contributions = context.contributions.map(item => {
      if (!record(item) || !Array.isArray(item.affordances)) return item;
      const { affordances, ...rest } = item;
      return { ...rest, affordanceIds: affordances.filter(record).map(affordance => affordance.id) };
    });
  }
  // Pretty JSON gives the engine real line boundaries: an unexpectedly large
  // future field must never turn the entire snapshot into "showing 0 lines".
  return JSON.stringify({ ...value, context }, null, 2);
}
