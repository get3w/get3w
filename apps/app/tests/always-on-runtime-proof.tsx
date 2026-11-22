import { useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { CreateWorkspaceModal } from "../src/react-app/domains/workspace/create-workspace-modal";
import { AlwaysOnWorkspaceControl } from "../src/react-app/domains/workspace/always-on-workspace-control";
import { WorkspaceProvider } from "../src/react-app/shell/workspace-provider";
import { createGet3wServerClient } from "../src/app/lib/get3w-server";
import type { CreateWorkspaceOptions } from "../src/react-app/domains/workspace/types";
import { setLocale } from "../src/i18n";
import "../src/app/index.css";
setLocale("zh");
// Separate, disposable local acceptance server; never the user's profile.
const client = createGet3wServerClient({ baseUrl: "http://127.0.0.1:4331", token: "fixture-client", hostToken: "fixture-host" });
function Proof() {
 const [workspaceId, setWorkspaceId] = useState("");
 const [error, setError] = useState<string | null>(null);
 const [busy, setBusy] = useState(false);
 async function create(_preset: string, folder: string | null, options?: CreateWorkspaceOptions) {
  if (!folder) return;setBusy(true);setError(null);
  try {
   const list = await client.createLocalWorkspace({ folderPath: folder, name: "持续运行验收", preset: "starter", workspaceType: options?.workspaceType, alwaysOn: options?.alwaysOn, defaultModel: { providerID: "fixture", modelID: "fixture" } });
   setWorkspaceId(list.activeId ?? list.workspaces[0]?.id ?? "");
  } catch(error) {setError(String(error));}finally{setBusy(false);}
 }
 return <MemoryRouter><WorkspaceProvider client={null} get3wServerClient={client} workspaceId={workspaceId} selectedWorkspaceRoot="">
  <div className="min-h-screen bg-background p-6"><h1 className="text-base font-medium">持续运行 · 隔离验收</h1>{workspaceId ? <div className="mt-4 max-w-sm"><AlwaysOnWorkspaceControl workspaceId={workspaceId}/></div> : null}</div>
  <CreateWorkspaceModal open={!workspaceId} onClose={()=>{}} onConfirm={(...args)=>void create(...args)} onPickFolder={async()=>String(await (await fetch("http://127.0.0.1:4332")).text())} submitting={busy} localError={error}/>
 </WorkspaceProvider></MemoryRouter>;
}
createRoot(document.getElementById("root")!).render(<Proof/>);
