import { mkdtemp } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import type { ServerConfig } from "../../src/types";
import { nativeProtocolResponse } from "./native-provider-protocol-fixtures";
const root=await mkdtemp(join(tmpdir(),"always-on-computer-use-"));
Object.assign(process.env,{HOME:root,XDG_CONFIG_HOME:join(root,"config"),XDG_DATA_HOME:join(root,"data"),XDG_CACHE_HOME:join(root,"cache"),XDG_STATE_HOME:join(root,"state"),GET3W_RUNTIME_DB:join(root,"runtime.sqlite"),GET3W_OPENCODE2_BIN:resolve("apps/desktop/resources/sidecars/opencode2"),GET3W_ENGINE_V2_PREVIEW:"1",GET3W_ENGINE_V2_CHAT:"1",OPENCODE_DISABLE_MODELS_FETCH:"true"});
const provider=Bun.serve({hostname:"127.0.0.1",port:0,fetch:()=>new Response(nativeProtocolResponse("openai","fixture","隔离验收完成，目标已检查。"),{headers:{"content-type":"text/event-stream"}})});
const {writeGlobalRuntimeOpencodeConfig}=await import("../../src/runtime-opencode-config-store");
const {startServer}=await import("../../src/server");
const config:ServerConfig={host:"127.0.0.1",port:4331,token:"fixture-client",hostToken:"fixture-host",configPath:join(root,"server.json"),approval:{mode:"manual",timeoutMs:1000},corsOrigins:["http://127.0.0.1:4320"],workspaces:[],authorizedRoots:[root],readOnly:false,startedAt:Date.now(),tokenSource:"generated",hostTokenSource:"generated",logFormat:"json",logRequests:false};
await writeGlobalRuntimeOpencodeConfig(config,()=>({provider:{fixture:{npm:"@ai-sdk/openai-compatible",name:"Fixture",options:{baseURL:`http://127.0.0.1:${provider.port}/v1`,apiKey:"fixture"},models:{fixture:{name:"Fixture",limit:{context:128000,output:4096}}}}}}));
const server=await startServer(config);
// Folder is served separately through the same proxy used by the UI fixture.
const proxy=Bun.serve({hostname:"127.0.0.1",port:4332,fetch:()=>new Response(join(root,"workspace"),{headers:{"Access-Control-Allow-Origin":"http://127.0.0.1:4320"}})});
console.log(`Isolated acceptance at ${server.port}, folder endpoint ${proxy.port}`);
process.on("SIGTERM",()=>{void server.stop().finally(()=>{provider.stop(true);proxy.stop(true);process.exit();});});
