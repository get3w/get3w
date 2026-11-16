import {afterAll,test,expect} from "bun:test";
import {GlobalRegistrator} from "@happy-dom/global-registrator";


GlobalRegistrator.register({url:"http://localhost/"});Reflect.set(globalThis,"IS_REACT_ACT_ENVIRONMENT",true);
const {act,createElement}=await import("react");
const {createRoot}=await import("react-dom/client");
const {TaskCostControl}=await import("../src/react-app/domains/session/chat/task-cost-control");
const {setLocale}=await import("../src/i18n");
afterAll(()=>GlobalRegistrator.unregister());
test("unset stays manual, editing validates, failures retain draft, save is scoped and currency follows locale",async()=>{
 setLocale("zh");let policy={enabled:false,amount:null as string|null,currency:"USD"};let fail=true;const writes:unknown[]=[];
 Reflect.set(window,"__GET3W_ACCOUNT__",{taskPermissions:async(input:{action:string;policy:typeof policy})=>{if(input.action==="cost-set"){writes.push(input);if(fail)throw Error("fixture failure");policy=input.policy;}return {mode:"default",defaultMode:"default",grants:[],cost:{policy}};}});
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 const edit=async(text:string)=>act(async()=>{const input=host.querySelector<HTMLInputElement>('input[data-slot="input"]')!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")?.set?.call(input,text);input.dispatchEvent(new Event("input",{bubbles:true}));input.dispatchEvent(new Event("change",{bubbles:true}));});
 const button=(text:string)=>[...host.querySelectorAll("button")].find(el=>el.textContent===text);
 try{
  await act(async()=>root.render(createElement(TaskCostControl,{workspaceId:"w",sessionId:"s"})));
  expect(host.textContent).toContain("CNY");expect(host.querySelector('[role="switch"]')?.getAttribute("aria-checked")).toBe("false");
  await edit("-2");expect(host.querySelector('[role="alert"]')).not.toBeNull();expect(button("保存")?.disabled).toBe(true);
  await edit("7");await act(async()=>button("保存")?.click());expect(host.textContent).toContain("费用设置未保存");expect(host.querySelector<HTMLInputElement>('input[data-slot="input"]')?.value).toBe("7");
  fail=false;await act(async()=>button("重试保存")?.click());expect(writes.at(-1)).toEqual({action:"cost-set",workspaceId:"w",sessionId:"s",policy:{enabled:true,amount:"7",currency:"CNY"}});
  await act(async()=>setLocale("en"));expect(host.textContent).toContain("USD");expect(host.querySelector<HTMLInputElement>('input[data-slot="input"]')?.value).toBe("1.00");
 }finally{await act(async()=>root.unmount());host.remove();Reflect.deleteProperty(window,"__GET3W_ACCOUNT__");}
});
test("cancel and disabling preserve the saved amount; unchanged currency conversion does not rewrite money",async()=>{
 setLocale("en");let policy={enabled:true,amount:"0.01",currency:"CNY"};const writes:unknown[]=[];
 Reflect.set(window,"__GET3W_ACCOUNT__",{taskPermissions:async(input:{action:string;policy:typeof policy})=>{if(input.action==="cost-set"){policy=input.policy;writes.push(input);}return {mode:"default",defaultMode:"default",grants:[],cost:{policy}};}});
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
 const button=(label:string)=>Array.from(host.querySelectorAll("button")).find(el=>el.textContent===label);
 try{
  await act(async()=>root.render(createElement(TaskCostControl,{workspaceId:"w",sessionId:"s"})));
  const input=()=>host.querySelector<HTMLInputElement>('input[data-slot="input"]')!;
  expect(input().value).toBe("0.00");
  await act(async()=>host.querySelector<HTMLElement>('[role="switch"]')?.closest('label')?.click());
  await act(async()=>button("Cancel")?.click());expect(writes).toHaveLength(0);expect(host.querySelector('[role="switch"]')?.getAttribute("aria-checked")).toBe("true");
  await act(async()=>host.querySelector<HTMLElement>('[role="switch"]')?.closest('label')?.click());
  await act(async()=>button("Save")?.click());
  expect(writes).toEqual([{action:"cost-set",workspaceId:"w",sessionId:"s",policy:{enabled:false,amount:"0.01",currency:"CNY"}}]);
 }finally{await act(async()=>root.unmount());host.remove();Reflect.deleteProperty(window,"__GET3W_ACCOUNT__");}
});
test("older local service reports why cost controls are unavailable",async()=>{
 setLocale("zh");Reflect.set(window,"__GET3W_ACCOUNT__",{taskPermissions:async()=>({mode:"default",defaultMode:"default",grants:[]})});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{
  await act(async()=>root.render(createElement(TaskCostControl,{})));
  expect(host.querySelector('[role="status"]')?.textContent).toContain('请重启 Desktop 开发服务');
  expect(host.querySelector<HTMLInputElement>('input[data-slot="input"]')?.disabled).toBe(true);
 }finally{await act(async()=>root.unmount());host.remove();Reflect.deleteProperty(window,"__GET3W_ACCOUNT__");}
});
