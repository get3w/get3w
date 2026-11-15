import {GlobalRegistrator} from '@happy-dom/global-registrator';
import {afterAll,afterEach,expect,test} from 'bun:test';
import React,{act} from 'react';
const ownsDom=typeof window==='undefined';
if(ownsDom)GlobalRegistrator.register({url:'http://localhost/'});
Reflect.set(globalThis,'IS_REACT_ACT_ENVIRONMENT',true);
const {createRoot}=await import('react-dom/client');
const {WorkspaceSidebarFixture,fixtureGroups}=await import('./workspace-sidebar-fixture');
const {useSessionManagementStore}=await import('../src/react-app/domains/session/sidebar/session-management-store');
const {useUiStateStore}=await import('../src/react-app/shell/ui-state-store');
const {readVisibleSessionNumberShortcutTargets}=await import('../src/react-app/shell/session-number-shortcuts');
const {setLocale}=await import('../src/i18n');
let cleanup=()=>{};
afterEach(()=>{cleanup();document.body.innerHTML='';});
afterAll(async()=>{if(ownsDom)await GlobalRegistrator.unregister();});
async function mount(groups=fixtureGroups,initialWorkspace='a'){
 setLocale('zh');useSessionManagementStore.setState({sidebarView:'feed',pinnedIds:['a-pinned','b-pinned'],autoSettleDays:1,groupsByWorkspace:{a:{groups:[{id:'design',label:'设计组'}],assignments:{'a-active':'design'}},b:{groups:[],assignments:{}}}});useUiStateStore.setState({expandedWorkspaceIds:[]});
 const actions:string[]=[];const host=document.createElement('div');document.body.append(host);const root=createRoot(host);cleanup=()=>act(()=>root.unmount());
 await act(async()=>root.render(<WorkspaceSidebarFixture groups={groups} initialWorkspace={initialWorkspace} onAction={value=>actions.push(value)}/>));return {host,actions};
}
async function click(selector:string){const button=document.querySelector(selector);expect(button).not.toBeNull();await act(async()=>{button?.dispatchEvent(new MouseEvent('click',{bubbles:true}));});}
test('current workspace remains visible with legacy feed preference and collapsed workspace state',async()=>{
 const {host}=await mount();expect(host.textContent).toContain('a 当前任务');expect(host.textContent).toContain('设计组');expect(host.textContent).toContain('a 置顶任务');expect(host.textContent).not.toContain('b 当前任务');expect(host.textContent).not.toContain('b 置顶任务');expect(host.querySelector('[data-sidebar-view]')).toBeNull();expect(host.querySelector('[data-sidebar-workspace-title]')).toBeNull();expect(host.querySelector('[data-sidebar-feed]')).toBeNull();
 await click('[data-global-archived-sessions] button');expect(host.textContent).toContain('a 归档任务');expect(host.textContent).not.toContain('b 归档任务');
});
test('toolbar switches workspace and dispatches create and workspace menu actions',async()=>{
 const {host,actions}=await mount();await click('[aria-label="切换工作区"]');const choice=[...document.querySelectorAll('[role="menuitemradio"]')].find(node=>node.textContent?.includes('财务项目'));expect(choice).toBeDefined();await act(async()=>choice?.dispatchEvent(new MouseEvent('click',{bubbles:true})));expect(actions).toContain('select:b');expect(host.textContent).toContain('b 当前任务');expect(host.textContent).not.toContain('a 当前任务');
 const rows=[...host.querySelectorAll<HTMLElement>('[data-session-tab-id]')];
 for(const row of rows)Object.defineProperty(row,'getClientRects',{value:()=>[{width:100,height:32}]});
 const targets=readVisibleSessionNumberShortcutTargets(document);
 expect(targets.length).toBeGreaterThan(0);expect(targets.every(target=>target.workspaceId==='b')).toBe(true);
 await click('[aria-label="添加工作区"]');expect(actions).toContain('create');
 for(const [label,action] of [['编辑名称','rename:b'],['在Finder中显示','reveal:b'],['新建组','group:b'],['移除工作区','remove:b']]){await click('[aria-label="工作区设置"]');const item=[...document.querySelectorAll('[role="menuitem"]')].find(node=>node.textContent?.replaceAll(' ','').includes(label));expect(item).toBeDefined();await act(async()=>item?.dispatchEvent(new MouseEvent('click',{bubbles:true})));expect(actions).toContain(action);}
});
test('no workspace keeps create available and disables workspace settings',async()=>{const {actions}=await mount([],'');expect(document.querySelector<HTMLButtonElement>('[aria-label="工作区设置"]')?.disabled).toBe(true);expect(document.querySelector<HTMLButtonElement>('[aria-label="切换工作区"]')?.disabled).toBe(true);await click('[aria-label="添加工作区"]');expect(actions).toContain('create');});

test('loading, empty and failed workspaces retain the toolbar',async()=>{
 for(const status of ['loading','ready','error']){
  const groups=fixtureGroups.map(group=>({...group,sessions:[],status:status==='loading'?'loading':status==='error'?'error':'ready',error:status==='error'?'Failed to load sessions':undefined}));
  const {host}=await mount(groups);
  expect(host.querySelector('[data-sidebar-workspace-toolbar]')).not.toBeNull();
  if(status==='loading')expect(host.querySelector('[aria-busy="true"]')).not.toBeNull();
  if(status==='ready')expect(host.textContent).toContain('无会话');
  if(status==='error')expect(host.querySelector('[aria-disabled="true"]')).not.toBeNull();
  cleanup();cleanup=()=>{};document.body.innerHTML='';
 }
});

test('brand and search/activity appear once in the main header, not the sidebar',async()=>{
 const {host,actions}=await mount();
 const header=host.querySelector('main header');expect(header?.querySelector('[data-header-brand]')).not.toBeNull();
 expect(header?.querySelector('[data-sidebar-actions]')).not.toBeNull();expect(host.querySelectorAll('[data-notification-bell]').length).toBe(1);
 expect(host.querySelector('[data-sidebar="sidebar"] [data-header-brand]')).toBeNull();
 expect(host.querySelector('[data-sidebar="sidebar"] [data-sidebar-actions]')).toBeNull();
 const search=header?.querySelector('button[aria-keyshortcuts]');expect(search).not.toBeNull();
 await act(async()=>search?.dispatchEvent(new MouseEvent('click',{bubbles:true})));expect(actions).toContain('search');
});

test('Recent counts active root sessions and collapses independently of settled sessions',async()=>{
 const {host}=await mount();
 const recent=host.querySelector('[data-workspace-recent-sessions="a"]');
 const toggle=recent?.querySelector('[role="button"]');expect(toggle?.textContent).toContain('最近');expect(toggle?.textContent).toContain('1');
 expect(toggle?.getAttribute('aria-expanded')).toBe('true');
 await act(async()=>toggle?.dispatchEvent(new MouseEvent('click',{bubbles:true})));
 expect(toggle?.getAttribute('aria-expanded')).toBe('false');
 expect(host.querySelector('[data-workspace-settled-sessions="a"]')).not.toBeNull();
 expect(host.textContent).toContain('a 置顶任务');
 await act(async()=>toggle?.dispatchEvent(new MouseEvent('click',{bubbles:true})));
 expect(toggle?.getAttribute('aria-expanded')).toBe('true');expect(recent?.textContent).toContain('a 当前任务');
});

test('Recent container does not propagate session-row hover and menu states to every child',async()=>{
 const {host}=await mount();
 const recent=host.querySelector('[data-workspace-recent-sessions="a"]');
 expect(recent?.classList.contains('group/menu-sub-item')).toBe(false);
 expect(recent?.getAttribute('data-sidebar')).not.toBe('menu-sub-item');
 const rows=[...host.querySelectorAll('[data-sidebar-session-id]')];
 expect(rows.length).toBeGreaterThan(0);
 for(const row of rows){
  expect(row.parentElement?.closest('.group\\/menu-sub-item')).toBeNull();
 }
});
