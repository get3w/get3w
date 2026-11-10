/** Only native Artifact operations may cross this bridge. Never a general proxy. */
export function artifactRoute(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(k => !['userId','path','method','body'].includes(k)) ||
      !['GET','POST'].includes(input.method) || typeof input.path !== 'string' || input.path.length > 1024) throw Error('Invalid artifact request.');
  const url = new URL(input.path, 'https://artifact.invalid');
  if (url.origin !== 'https://artifact.invalid' || !input.path.startsWith('/v1/') || url.hash ||
      [...url.searchParams.keys()].some(k => !['revisionId','receiptId','timeZone'].includes(k))) throw Error('Invalid artifact route.');
  const route = url.pathname;
  const valid = input.method === 'GET'
    ? /^\/v1\/(apps(?:\/[A-Za-z0-9_-]+)?|mcp-apps)$/.test(route)
    : /^\/v1\/(apps(?:\/[A-Za-z0-9_-]+\/(save|dashboard|revisions))?|artifact-views\/[A-Za-z0-9_-]+\/retire|config-objects\/[A-Za-z0-9_-]+\/delete)$/.test(route);
  if (!valid || (input.method === 'GET' && input.body !== undefined)) throw Error('Invalid artifact operation.');
  if (JSON.stringify(input.body ?? {}).length > 1_500_000) throw Error('Artifact is too large.');
  return url.pathname + url.search;
}
