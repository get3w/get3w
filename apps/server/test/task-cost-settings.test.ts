import {test,expect} from "bun:test";
import {mkdtemp} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {approveCostReservation,captureCostRun,costRunKey,initializeTaskCostSettings,readCostRun,reconcileCostReservation,setTaskCostSettings,taskCostSettings} from "../src/task-cost-settings";
import {resolveCostRunContext} from "../src/cost-run-context";
import type {ServerConfig} from "../src/types";
const profile=async()=>({configPath:join(await mkdtemp(join(tmpdir(),"cost-policy-")),"server.json")} as ServerConfig);
const policy={enabled:true,amount:"7",currency:"CNY"} as const;
const quote=(key:string,run:string,amountUsd:string)=>({key,run,amountUsd,quoteId:key,expiresAt:Date.now()+60000});
test("settings persist independently; new roots, children, forks and message snapshots",async()=>{
 const c=await profile();await setTaskCostSettings(c,{enabled:false,amount:null,currency:"USD"},"old");await setTaskCostSettings(c,policy,"current");
 await initializeTaskCostSettings(c,"new");await initializeTaskCostSettings(c,"child","old");await initializeTaskCostSettings(c,"fork","old",true);
 expect((await taskCostSettings(c,"old")).policy.enabled).toBe(false);expect((await taskCostSettings(c,"child")).policy.enabled).toBe(false);
 expect((await taskCostSettings({...c},"new")).policy).toEqual(policy);expect((await taskCostSettings(c,"fork")).policy).toEqual(policy);
 const a=await captureCostRun(c,"ws","current","a");await setTaskCostSettings(c,{...policy,amount:"14"},"current");const b=await captureCostRun(c,"ws","current","b");
 expect((await readCostRun(c,a))?.policy.amount).toBe("7");expect((await readCostRun(c,b))?.policy.amount).toBe("14");
});
test("parallel quotes reserve atomically, threshold is inclusive, retries do not double count",async()=>{
 const c=await profile();await setTaskCostSettings(c,policy,"s");const run=await captureCostRun(c,"w","s","m");let asked=0;
 const ask=async()=>{asked++;return false;};
 const results=await Promise.all([approveCostReservation(c,quote("a",run,"0.6"),ask),approveCostReservation(c,quote("b",run,"0.6"),ask)]);
 expect(results).toEqual([true,false]);expect(asked).toBe(1);
 expect(await approveCostReservation(c,quote("a",run,"0.6"),ask)).toBe(true);
 expect(await approveCostReservation(c,quote("c",run,"0.4"),ask)).toBe(true);
 expect((await readCostRun(c,run))?.committedUsd).toBe("1.000000");
 await expect(approveCostReservation(c,{...quote("a",run,"0.2"),quoteId:"changed"},ask)).rejects.toThrow("identity");
 expect(await approveCostReservation(c,quote("d",run,"0.01"),async summary=>{expect(summary.projectedUsd).toBe("1.010000");return true;})).toBe(true);
 expect(await approveCostReservation(c,quote("e",run,"0.01"),ask)).toBe(false);
});
test("settled charges and definitive releases reconcile; unknown and manual-only remain conservative",async()=>{
 const c=await profile();await setTaskCostSettings(c,policy,"s");const run=await captureCostRun(c,"w","s","m");
 await approveCostReservation(c,quote("a",run,"1"),async()=>false);
 await reconcileCostReservation(c,"a",{chargedUsd:"0.2"});expect((await readCostRun(c,run))?.committedUsd).toBe("0.200000");
 await reconcileCostReservation(c,"a",{released:true});expect((await readCostRun(c,run))?.committedUsd).toBe("0.000000");
 expect(await approveCostReservation(c,quote("unverified","missing","0.1"),async()=>false)).toBe(false);
 await expect(approveCostReservation(c,{...quote("expired",run,"0.1"),expiresAt:0},async()=>true)).rejects.toThrow("expired");
 const next=await captureCostRun(c,"w","s","new");expect((await readCostRun(c,next))?.committedUsd).toBe("0.000000");
});
test("subagent resolves original parent message across newer user prompts, no inference on missing link",async()=>{
 const c=await profile();await setTaskCostSettings(c,policy,"parent");await captureCostRun(c,"w","parent","user");
 const read=async(path:string):Promise<unknown>=>{
  if(path==="/api/session/child")return {data:{id:"child",parentID:"parent"}};
  if(path==="/api/session/parent")return {data:{id:"parent"}};
  return {data:[{id:"newer",type:"user"},{id:"assistant",type:"assistant",parts:[{tool:"subagent",state:{metadata:{sessionId:"child"}}}]},{id:"user",type:"user"}]};
 };
 expect(await resolveCostRunContext(c,"w","child","child-assistant",read)).toBe(costRunKey("w","parent","user"));
 expect(await resolveCostRunContext(c,"other","child","child-assistant",read)).toBeUndefined();
});

test("fresh defaults enable one dollar while saved choices and historical tasks are preserved",async()=>{
 const c=await profile();
 expect((await taskCostSettings(c)).policy).toEqual({enabled:true,amount:"1",currency:"USD"});
 expect((await taskCostSettings(c,"historical")).policy).toEqual({enabled:true,amount:"1",currency:"USD"});
 await initializeTaskCostSettings(c,"fresh");
 const run=await captureCostRun(c,"w","fresh","m");
 expect(await approveCostReservation(c,quote("one-dollar",run,"1"),async()=>false)).toBe(true);
 expect(await approveCostReservation(c,quote("over",run,"0.01"),async()=>false)).toBe(false);
 await setTaskCostSettings(c,{enabled:false,amount:null,currency:"USD"},"fresh");
 await initializeTaskCostSettings(c,"next");
 expect((await taskCostSettings(c,"next")).policy.enabled).toBe(false);
});

test("legacy unset defaults and tasks upgrade once without changing admitted message budgets",async()=>{
 const c=await profile();
 const {openRuntimeSqliteDatabase,runtimeDbPath}=await import("../src/runtime-db");
 const db=await openRuntimeSqliteDatabase(runtimeDbPath(c));
 db.sqlite.exec("CREATE TABLE task_cost_settings (workspace_id TEXT PRIMARY KEY,state_json TEXT NOT NULL,updated_at INTEGER NOT NULL)");
 const manual={enabled:false,amount:null,currency:"USD"};
 const state={defaults:manual,sessions:{old:manual,custom:{enabled:false,amount:"2",currency:"USD"}},runs:{oldrun:{workspaceId:"w",sessionId:"old",messageId:"m",policy:manual}},reservations:{}};
 db.sqlite.prepare("INSERT INTO task_cost_settings VALUES(?,?,?)").run("__local__",JSON.stringify(state),Date.now());db.close();
 expect((await taskCostSettings(c)).policy.amount).toBe("1");
 expect((await taskCostSettings(c,"old")).policy.enabled).toBe(true);
 expect((await taskCostSettings(c,"custom")).policy).toEqual({enabled:false,amount:"2",currency:"USD"});
 expect((await readCostRun(c,"oldrun"))?.policy.enabled).toBe(false);
 await setTaskCostSettings(c,manual,"old");
 expect((await taskCostSettings(c,"old")).policy.enabled).toBe(false);
});
