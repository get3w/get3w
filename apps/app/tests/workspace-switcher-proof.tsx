import {createRoot} from "react-dom/client";
import {WorkspaceSidebarFixture} from "./workspace-sidebar-fixture";
import {setLocale} from "../src/i18n";
import "../src/app/index.css";
setLocale("zh");
createRoot(document.getElementById("root")!).render(<WorkspaceSidebarFixture/>);
