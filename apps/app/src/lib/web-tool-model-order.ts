/** DeepSeek and Bocha first, followed by OpenCode v2.2.0 WebSearchPlugins. */
const searchProviderOrder = ['deepseek', 'bocha', 'exa', 'firecrawl', 'parallel', 'tavily', 'tinyfish'];
const fetchProviderOrder = ['deepseek', 'parallel'];
export function webToolModelRank(type: string, modelId: string): number {
  const providers = type === 'search' ? searchProviderOrder : type === 'fetch' ? fetchProviderOrder : [];
  const index = providers.indexOf(modelId.split('/')[0]);
  return index < 0 ? providers.length : index;
}
