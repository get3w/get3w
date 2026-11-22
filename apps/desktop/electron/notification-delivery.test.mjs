import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { submitDesktopNotification, notificationRunHref, openNotificationRun, retainDesktopNotification, desktopNotificationOptions } from "./notification-delivery.mjs";
function fixture(event) {const item=new EventEmitter();item.show=()=>{if(event)item.emit(event,{},"Denied");};return item;}
test("submission requires actual show; failures are reported and unknown outcomes reject",async()=>{
 assert.deepEqual(await submitDesktopNotification(fixture("show")),{ok:true});
 assert.deepEqual(await submitDesktopNotification(fixture("failed")),{ok:false,reason:"Denied"});
 await assert.rejects(submitDesktopNotification(fixture(null),1),/not confirmed/);
});
test("click routes only to an internal run message",()=>{
 const route="/workspace/ws_test/session/ses_test?runMessage=msg_test";
 assert.equal(notificationRunHref(route),route);
 for(const href of ["https://example.com", "javascript:alert(1)", "/workspace/x/session/y?runMessage=z&other=a", "/workspace/x/session/y?runMessage=z#other", "/workspace/x/session/y?runMessage=\";alert(1)"])assert.equal(notificationRunHref(href),null);
});

test("notification click focuses before opening the exact run, invalid targets only focus",async()=>{
 const calls=[];const href="/workspace/ws_fixture/session/ses_fixture?runMessage=msg_fixture";
 await openNotificationRun(href,async()=>{calls.push("focus");},async target=>{calls.push(target);});
 assert.deepEqual(calls,["focus",href]);
 calls.length=0;await openNotificationRun("https://example.com",async()=>{calls.push("focus");},async()=>{calls.push("unexpected");});assert.deepEqual(calls,["focus"]);
});
test("settled and timed-out notifications release listeners",async()=>{
 const shown=fixture("show");await submitDesktopNotification(shown);assert.equal(shown.listenerCount("failed"),1);shown.emit("close");assert.equal(shown.listenerCount("failed"),0);
 const unknown=fixture(null);await assert.rejects(submitDesktopNotification(unknown,1));assert.equal(unknown.listenerCount("show"),0);assert.equal(unknown.listenerCount("failed"),1);unknown.emit("close");assert.equal(unknown.listenerCount("failed"),0);
});

test("native notification lifetime survives submission and releases on click, close or failure",()=>{
 for(const event of ["click","close","failed"]){
  const n=fixture(null);const release=retainDesktopNotification(n);
  assert.equal(n.listenerCount("close"),1);n.emit(event);
  assert.equal(n.listenerCount("close"),0);assert.equal(n.listenerCount("click"),0);assert.equal(n.listenerCount("failed"),0);release();
 }
});

test("notification options preserve the Get3W icon object",()=>{
 const icon={isEmpty:()=>false};
 assert.deepEqual(desktopNotificationOptions({title:"Get3W",body:"Ready",icon,platform:"win32"}),{title:"Get3W",body:"Ready",icon});
 assert.deepEqual(desktopNotificationOptions({title:"Get3W",body:"",silent:false,icon:{isEmpty:()=>true}}),{title:"Get3W"});
});

test("macOS uses its application icon without a duplicate image attachment",()=>{
 assert.deepEqual(desktopNotificationOptions({title:"Get3W",body:"Ready",icon:{isEmpty:()=>false},platform:"darwin"}),{title:"Get3W",body:"Ready"});
});
