import {useState} from "react";
import {createRoot} from "react-dom/client";
import {CreateWorkspaceModal} from "../src/react-app/domains/workspace/create-workspace-modal";
import {setLocale} from "../src/i18n";
import "../src/app/index.css";
setLocale("zh");
function Proof(){
 const [open,setOpen]=useState(true);
 return <CreateWorkspaceModal open={open} onClose={()=>setOpen(false)} onConfirm={()=>{}} onPickFolder={async()=>"/Users/demo/Projects/设计项目"}/>;
}
createRoot(document.getElementById("root")!).render(<Proof/>);
