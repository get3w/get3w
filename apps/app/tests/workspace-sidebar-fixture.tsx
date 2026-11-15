import React,{useState} from 'react';
import {MemoryRouter} from 'react-router';
import {AppSidebar,type AppSidebarProps} from '../src/react-app/domains/session/sidebar/app-sidebar';
import {SidebarProvider} from '../src/components/ui/sidebar';
import {PlatformProvider,createDefaultPlatform} from '../src/react-app/kernel/platform';
import {ShellConfigProvider} from '../src/react-app/shell/shell-config';
import {DesktopConfigProvider} from '../src/react-app/domains/cloud/desktop-config-provider';
import {HeaderBrand,SidebarActions,MainSidebarControls} from '../src/react-app/domains/session/sidebar/sidebar-chrome';
import type {WorkspaceSessionGroup} from '../src/app/types';
const noop=()=>{};
export const fixtureGroups:WorkspaceSessionGroup[]=['a','b'].map(id=>({workspace:{id,name:id==='a'?'设计项目':'财务项目与一个用于测试截断的非常长的工作区名称',path:`/tmp/sidebar-proof/${id}`,preset:'starter',workspaceType:'local'},status:'ready',sessions:[{id:`${id}-active`,title:`${id} 当前任务`,time:{updated:Date.now()}},{id:`${id}-pinned`,title:`${id} 置顶任务`},{id:`${id}-archived`,title:`${id} 归档任务`,time:{archived:Date.now()}},{id:`${id}-settled`,title:`${id} 已整理任务`,time:{updated:1}}]}));
export function WorkspaceSidebarFixture({onAction=noop,groups=fixtureGroups,initialWorkspace='a'}:{onAction?:(action:string)=>void;groups?:WorkspaceSessionGroup[];initialWorkspace?:string}){
 const [selected,setSelected]=useState(initialWorkspace);
 const props:AppSidebarProps={workspaceSessionGroups:groups,selectedWorkspaceId:selected,selectedSessionId:null,developerMode:false,sessionNumberShortcuts:{os:'macos',modifierHeld:false,targets:[]},connectingWorkspaceId:null,workspaceConnectionStateById:{},newTaskDisabled:false,settleWorkspaceIds:new Set(['a','b']),onSelectWorkspace:id=>{setSelected(id);onAction(`select:${id}`);},onOpenSession:(id,session)=>onAction(`session:${id}:${session}`),onCreateTaskInWorkspace:noop,onCreateSplitTaskInWorkspace:noop,onOpenRenameWorkspace:id=>onAction(`rename:${id}`),onRevealWorkspace:id=>onAction(`reveal:${id}`),onForgetWorkspace:id=>onAction(`remove:${id}`),onOpenCreateGroupModal:id=>onAction(`group:${id}`),onOpenCreateWorkspace:()=>onAction('create'),onOpenDashboard:noop,onOpenOutputs:noop,onOpenAutomations:noop,status:{clientConnected:false,openworkServerStatus:null,developerMode:false,showConnectionStatus:false,providerConnectedIds:[],mcpConnectedCount:0}};
 const platform=createDefaultPlatform();
 return <MemoryRouter><PlatformProvider value={{...platform,capabilities:{...platform.capabilities,revealInFileManager:true}}}><DesktopConfigProvider><ShellConfigProvider><SidebarProvider defaultOpen><AppSidebar {...props}/><main className="min-w-0 flex-1"><header className="window-titlebar flex items-center justify-between gap-3 px-3"><div className="flex min-w-0 items-center gap-3"><MainSidebarControls /><HeaderBrand /><span className="truncate">新建会话 · 设计项目</span></div><SidebarActions onOpenSessionSearch={()=>onAction('search')} /></header><div className="p-8">工作区导航预览</div></main></SidebarProvider></ShellConfigProvider></DesktopConfigProvider></PlatformProvider></MemoryRouter>;
}
