/** @jsxImportSource react */
import React from "react";
import { createRoot } from "react-dom/client";
import { GeneralSettingsView } from "../src/react-app/domains/settings/pages/general-view";
import { t, setLocale, useLocale } from "../src/i18n";
import "../src/app/index.css";
function Proof() {
 useLocale();
 return <div className="min-h-screen bg-dls-background text-dls-text p-8"><div className="mb-6 flex gap-4"><button onClick={()=>setLocale("zh")}>简体中文</button><button onClick={()=>setLocale("en")}>English</button></div><h1 className="text-xl mb-6">{t("settings_ui.74a883a037bc")}</h1><GeneralSettingsView developerMode onNavigateTab={()=>{}} onSendFeedback={()=>{}} onJoinDiscord={()=>{}} onReportIssue={()=>{}} /></div>;
}
setLocale("zh");createRoot(document.getElementById("root")!).render(<Proof/>);
