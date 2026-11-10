import { createHash } from "node:crypto";
import { z } from "zod";
import type { ServerConfig } from "./types.js";
import type { OrganizationMcpServers } from "./reserved-mcp-names.js";
import { readEffectiveRuntimeOpencodeConfig } from "./runtime-opencode-config-store.js";
import { loopbackFetch } from "./server-fetch.js";
export const CONNECT_MCP_SERVER_INDEX_URI = "openwork://connect/mcp-servers/index.json";
export const CONNECT_MCP_SERVER_INDEX_SCHEMA_VERSION = "openwork.connect/mcp-servers/1";
export const CONNECT_MCP_APP_HOST_NAME_PREFIX = "openwork-app-host-connect-";
export const CONNECT_MCP_SERVER_NAME_PREFIX = "openwork-connect-";
export const CONNECT_DIRECT_MCP_SERVER_NAME_PREFIX = "openwork-direct-";
export const CONNECT_MCP_APP_HOST_CAPABILITY_HEADER = "x-openwork-mcp-client-capabilities";
export const CONNECT_MCP_APP_HOST_CAPABILITY = "mcp-app-host-v1";
export type OpenWorkConnectMcpServerIndex = { schemaVersion: typeof CONNECT_MCP_SERVER_INDEX_SCHEMA_VERSION; servers: { connectionId: string; name: string; description: string | null; url: string; exposeDirectly: boolean }[] };
export type OpenWorkConnectMcpServerIndexInput = OpenWorkConnectMcpServerIndex;
export type ConnectMcpCatalogDiagnostic = "ready" | "empty" | "missing_app_host_auth" | "untrusted_origin" | "invalid_catalog" | "invalid_proxy_descriptor" | "discovery_unavailable";
export type ConnectMcpCatalogReadResult = { index: OpenWorkConnectMcpServerIndex | null; diagnostic: ConnectMcpCatalogDiagnostic };
export const trustedAppHostCloudEndpoint = async (_config: Record<string, unknown>) => false;
export function connectMcpAppHostName(connectionId: string) { return `${CONNECT_MCP_APP_HOST_NAME_PREFIX}${createHash("sha256").update(connectionId).digest("hex").slice(0, 12)}`; }
export const registeredOrganizationMcpServers = async (_config: ServerConfig, _workspaces: Iterable<string>): Promise<OrganizationMcpServers> => ({});
const appId = z.string().regex(/^cob_[0-7][0-9a-hjkmnp-tv-z]{25}$/);
const gatewaySchema = z.object({type:z.literal("remote"),enabled:z.boolean().optional(),url:z.string(),headers:z.object({Authorization:z.string().regex(/^Bearer [A-Za-z0-9_-]{43}$/)})});
const catalogSchema = z.object({apps:z.array(z.object({connectionId:appId,title:z.string().max(120),description:z.string().nullable()})).max(500)});
async function gateway(config:ServerConfig,workspaceId:string) {
  const runtime=await readEffectiveRuntimeOpencodeConfig(config,workspaceId);
  const parsed=gatewaySchema.safeParse(runtime.mcp?.['get3w-account']);
  if(!parsed.success || parsed.data.enabled===false)return null;
  const url=new URL(parsed.data.url);
  if(url.protocol!=="http:"||url.hostname!=="127.0.0.1"||!url.port||url.pathname!=="/mcp"||url.search||url.hash||url.username||url.password)return null;
  return {origin:url.origin,authorization:parsed.data.headers.Authorization};
}
export async function readOpenWorkConnectMcpAppHostCatalog(config:ServerConfig,workspaceId:string):Promise<OpenWorkConnectMcpServerIndex> {
  const current=await gateway(config,workspaceId);
  if(!current)return {schemaVersion:CONNECT_MCP_SERVER_INDEX_SCHEMA_VERSION,servers:[]};
  const response=await loopbackFetch(`${current.origin}/app-index`,{headers:{Authorization:current.authorization},redirect:"error",signal:AbortSignal.timeout(10_000)});
  if(!response.ok)throw Error("Native artifact catalog is unavailable");
  const length=Number(response.headers.get('content-length'));
  if(length>1_000_000){await response.body?.cancel();throw Error("Native artifact catalog is too large");}
  if(!response.body)throw Error("Native artifact catalog is empty");
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];
  let size=0;
  try{
    while(true){
      const next=await reader.read();if(next.done)break;
      size+=next.value.byteLength;
      if(size>1_000_000)throw Error("Native artifact catalog is too large");
      chunks.push(next.value);
    }
  }finally{await reader.cancel().catch(()=>undefined);}
  const bytes=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  const text=new TextDecoder().decode(bytes);
  const payload=catalogSchema.parse(JSON.parse(text));
  const latest=await gateway(config,workspaceId);
  if(latest?.authorization!==current.authorization||latest.origin!==current.origin)throw Error("Native account changed");
  return {schemaVersion:CONNECT_MCP_SERVER_INDEX_SCHEMA_VERSION,servers:payload.apps.map(app=>({connectionId:app.connectionId,name:app.title,description:app.description,url:`${current.origin}/mcp/apps/${app.connectionId}`,exposeDirectly:false}))};
}
export async function readOpenWorkConnectMcpAppHostAuthorization(config:ServerConfig,workspaceId:string,url:string):Promise<string|null> {
  const current=await gateway(config,workspaceId);if(!current)return null;
  const parsed=new URL(url);
  if(parsed.origin!==current.origin||!/^\/mcp\/apps\/cob_[0-7][0-9a-hjkmnp-tv-z]{25}$/.test(parsed.pathname)||parsed.search||parsed.hash||parsed.username||parsed.password)return null;
  return current.authorization;
}
export async function readOpenWorkConnectMcpAppHostAuthorizationRevision(config:ServerConfig,workspaceId:string):Promise<number|null> {
  const current=await gateway(config,workspaceId);
  return current ? Number.parseInt(createHash('sha256').update(JSON.stringify(current)).digest('hex').slice(0,12),16) : null;
}
export async function findOpenWorkConnectMcpAppHostServer(config:ServerConfig,workspaceId:string,input:{connectionId?:string;serverName?:string}):Promise<OpenWorkConnectMcpServerIndex['servers'][number]|null> {
  const current=await gateway(config,workspaceId);if(!current)return null;
  // A draft is not in the public active catalog. Discovery of this exact id is
  // allowed; the native server must authorize it before serving any tool/source.
  if(input.connectionId && appId.safeParse(input.connectionId).success)return {connectionId:input.connectionId,name:'Artifact',description:null,url:`${current.origin}/mcp/apps/${input.connectionId}`,exposeDirectly:false};
  const catalog=await readOpenWorkConnectMcpAppHostCatalog(config,workspaceId);
  return catalog.servers.find(server=>connectMcpAppHostName(server.connectionId)===input.serverName)??null;
}
export async function refreshOpenWorkConnectMcpAppHostCatalog(config:ServerConfig,workspaceId:string,_fetcher?:(input:string,init?:RequestInit)=>Promise<Response>):Promise<{status:"unavailable"|"synced";appHostNames:string[];diagnostic:ConnectMcpCatalogDiagnostic}> {
  try {
    if (!await gateway(config,workspaceId)) return {status:'unavailable',appHostNames:[],diagnostic:'missing_app_host_auth'};
    const catalog=await readOpenWorkConnectMcpAppHostCatalog(config,workspaceId);return {status:'synced',appHostNames:catalog.servers.map(s=>connectMcpAppHostName(s.connectionId)),diagnostic:catalog.servers.length?'ready':'empty'};}
  catch{return {status:'unavailable',appHostNames:[],diagnostic:'discovery_unavailable'};}
}
// Only configs constructed from the authenticated native descriptor are trusted
// for loopback. JSON workspace config cannot forge this object identity.
const nativeConfigs=new WeakSet<object>();
export function nativeArtifactTransportConfig(url:string,authorization:string,resourceUri?:string):Record<string,unknown> {
  const config={type:'remote',url,enabled:true,headers:{Authorization:authorization,[CONNECT_MCP_APP_HOST_CAPABILITY_HEADER]:CONNECT_MCP_APP_HOST_CAPABILITY}};
  const revision=resourceUri ? /^ui:\/\/openwork\/apps\/cob_[0-7][0-9a-hjkmnp-tv-z]{25}\/revisions\/(cov_[0-7][0-9a-hjkmnp-tv-z]{25})\/index\.html$/.exec(resourceUri)?.[1] : undefined;
  if(revision)Object.assign(config.headers,{'x-get3w-app-revision':revision});
  nativeConfigs.add(config);return config;
}
export function isNativeArtifactTransportConfig(config:Record<string,unknown>){return nativeConfigs.has(config);}
