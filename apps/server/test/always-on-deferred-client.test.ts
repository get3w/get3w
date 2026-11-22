import {expect,test} from "bun:test";
import {createAlwaysOnDeferredClient} from "../src/always-on-deferred-client";
const token="isolated-client-host-token-32bytes";
test("private deferred client rejects non-loopback destinations and ordinary workspaces",async()=>{
 for(const baseUrl of ["https://example.com","http://localhost:1234","http://127.0.0.1:1234/path","http://user:pass@127.0.0.1:1234"]){
  expect(()=>createAlwaysOnDeferredClient({baseUrl,token})).toThrow();
 }
 const server=Bun.serve({hostname:"127.0.0.1",port:0,fetch:()=>{throw Error("Must not send")}});
 try {const client=createAlwaysOnDeferredClient({baseUrl:server.url.origin,token});await expect(client.bind({id:"local",workspaceType:"local"},"ses",false)).rejects.toThrow("always-on");}finally{await server.stop(true)}
});
test("private deferred client uses authenticated POST without forwarding redirects or leaking errors",async()=>{
 let calls=0;
 const server=Bun.serve({hostname:"127.0.0.1",port:0,fetch:async request=>{
  calls++;expect(request.headers.get("authorization")).toBe(`Bearer ${token}`);
  expect(new URL(request.url).pathname).toBe("/get3w/deferred");expect(request.method).toBe("POST");
  const body=await request.json();
  if(body.action==="bind")return Response.json({workspaceID:body.workspaceID,sessionID:body.sessionID,paused:true});
  if(body.action==="pause")return Response.json({paused:body.paused});
  if(body.action==="read")return Response.json({binding:{workspaceID:"wrong",sessionID:body.sessionID,paused:true}});
  return new Response("private database detail",{status:409});
 }});
 try{
  const client=createAlwaysOnDeferredClient({baseUrl:server.url.origin,token});
  expect(await client.bind({id:"workspace",workspaceType:"always-on"},"ses",false)).toMatchObject({paused:true});
  await client.setPaused("workspace","ses",false);
  await expect(client.read("workspace","ses","call")).rejects.toThrow("identity mismatch");
  await expect(client.commit("workspace","ses","call")).rejects.toThrow("Deferred host request failed (409)");
  expect(calls).toBe(4);
 }finally{await server.stop(true)}
});
test("private handshake rejects mismatched protocol despite a healthy endpoint",async()=>{
 let version=2;
 const server=Bun.serve({hostname:"127.0.0.1",port:0,fetch:async request=>{
  expect(request.headers.get("authorization")).toBe(`Bearer ${token}`);
  expect(await request.json()).toEqual({action:"capabilities"});
  return Response.json({protocol:"get3w-deferred-questions",version,actions:["bind","pause","list","read","answer","commit","resume","cancel"]});
 }});
 try {const client=createAlwaysOnDeferredClient({baseUrl:server.url.origin,token});await expect(client.capabilities()).rejects.toThrow("Unsupported");version=1;await client.capabilities();}finally{await server.stop(true)}
});
