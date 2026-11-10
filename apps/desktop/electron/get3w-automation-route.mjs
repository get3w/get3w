/** Bounded native personal automation operations; never an arbitrary HTTP proxy. */
export function automationRoute(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some(key => !['userId','path','method','body'].includes(key))
    || typeof input.userId !== 'string' || !input.userId || input.userId.length > 50
    || typeof input.path !== 'string' || input.path.length > 1024) throw Error('Invalid automation request.');
  const url = new URL(input.path, 'https://automation.invalid');
  if (url.origin !== 'https://automation.invalid' || !input.path.startsWith('/v1/') || url.hash
    || [...url.searchParams.keys()].some(key => !['limit','cursor'].includes(key))) throw Error('Invalid automation route.');
  const route = url.pathname;
  const valid = input.method === 'GET' ? route === '/v1/automation-runner/presence' || /^\/v1\/automations(?:\/[A-Za-z0-9_-]+(?:\/runs(?:\/[A-Za-z0-9_-]+)?)?)?$/.test(route)
    : input.method === 'POST' ? /^\/v1\/automations(?:\/[A-Za-z0-9_-]+\/(?:activate|deactivate|run|runs\/[A-Za-z0-9_-]+\/cancel))?$/.test(route)
    : ['PATCH','DELETE'].includes(input.method) && /^\/v1\/automations\/[A-Za-z0-9_-]+$/.test(route);
  if (!valid || (['GET','DELETE'].includes(input.method) && input.body !== undefined)
    || JSON.stringify(input.body ?? {}).length > 150_000) throw Error('Invalid automation operation.');
  return url.pathname.replace(/^\/v1\//,'') + url.search;
}
