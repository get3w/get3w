// Test-only process. Never reads the user's Desktop profile or cloud credentials.
import {join,resolve} from "node:path";
import {writeFile} from "node:fs/promises";
const root=process.env.GET3W_RECOVERY_ROOT;
if(!root)throw Error("An explicit isolated root is required");
Object.assign(process.env,{HOME:root,XDG_CONFIG_HOME:join(root,"config"),XDG_DATA_HOME:join(root,"data"),XDG_CACHE_HOME:join(root,"cache"),XDG_STATE_HOME:join(root,"state"),GET3W_RUNTIME_DB:join(root,"runtime.sqlite"),GET3W_OPENCODE2_BIN:resolve("apps/desktop/resources/sidecars/opencode2"),GET3W_ENGINE_V2_PREVIEW:"1",GET3W_ENGINE_V2_CHAT:"1",OPENCODE_DISABLE_MODELS_FETCH:"true"});
const {resolveServerConfig}=await import("../../src/config");
const {startServer}=await import("../../src/server");
const {writeGlobalRuntimeOpencodeConfig}=await import("../../src/runtime-opencode-config-store");
const config=await resolveServerConfig({configPath:join(root,"server.json"),host:"127.0.0.1",port:0,token:"recovery-client",hostToken:"recovery-host",workspaces:[],corsOrigins:["http://127.0.0.1:4345"],logRequests:false});
await writeGlobalRuntimeOpencodeConfig(config,()=>({provider:{fixture:{npm:"@ai-sdk/openai-compatible",name:"Recovery fixture",options:{baseURL:process.env.GET3W_RECOVERY_PROVIDER,apiKey:"fixture-only"},models:{fixture:{name:"Recovery fixture",limit:{context:128000,output:4096},tool_call:true}}}}}));
const server=await startServer(config);
await writeFile(join(root,"host.json"),JSON.stringify({port:server.port,pid:process.pid}));
let exiting=false;process.on("SIGTERM",()=>{if(exiting)return;exiting=true;void server.stop().finally(()=>process.exit());});
// Keep the main process alive; runtime handles are otherwise unref'ed.
setInterval(()=>{},60000);
