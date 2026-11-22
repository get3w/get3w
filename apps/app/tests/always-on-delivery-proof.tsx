import { createRoot } from "react-dom/client";
import { AlwaysOnDeliveryPage, type DeliveryPreviewRecord } from "../src/react-app/domains/workspace/always-on-delivery-page";
import { setLocale } from "../src/i18n";
import "../src/app/index.css";
setLocale("zh");
const statuses: DeliveryPreviewRecord["status"][] = ["failed", "pending", "submitted", "unconfirmed", "blocked", "cancelled"];
const mode = new URLSearchParams(location.search).get("state");
export const preview = {
 results: [{id:"report",title:"资料更新检查报告",summary:"发现两处资料更新，已保存对比报告。",createdAt:1795190400000,files:[{path:"reports/资料检查.md",content:"# 资料检查报告\n\n发现两处资料更新。\n\n此内容为隔离界面示例。"}]},{id:"conclusion",title:"本轮核对结论",summary:"没有新增变化，已保存本轮核对结果。",createdAt:1795186800000,files:[]}],
 deliveries: statuses.map((status,index)=>({id:`delivery-${index}`,resultId:"report",title:"资料更新检查报告",text:"发现两处资料更新，可查看对比报告。",status,createdAt:1795190400000-index*60000,notBefore:1795309200000,expiresAt:1795395600000,submittedAt:status==="submitted"?1795309201500:undefined,attempts:status==="pending"?0:1,lastAttemptAt:status==="pending"?undefined:1795190400000,error:status==="failed"?"send_failed":status==="blocked"?"preference_off":status==="unconfirmed"?"uncertain":undefined}))
};
createRoot(document.getElementById("root")!).render(<div className="min-h-screen bg-background text-foreground"><AlwaysOnDeliveryPage preview={mode==="empty"?undefined:preview} onClose={()=>{}}/></div>);
