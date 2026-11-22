import {createRoot} from "react-dom/client";
import {WorkspaceSidebarFixture,fixtureGroups} from "./workspace-sidebar-fixture";
import {setLocale} from "../src/i18n";
import "../src/app/index.css";
setLocale("zh");
createRoot(document.getElementById("root")!).render(<WorkspaceSidebarFixture groups={new URLSearchParams(location.search).has("long")?Array.from({length:30},(_,index)=>({...fixtureGroups[0]!,workspace:{...fixtureGroups[0]!.workspace,id:index===0?"a":`proof-${index}`,name:`工作区 ${index+1}`},sessions:[]})):fixtureGroups}/>);
