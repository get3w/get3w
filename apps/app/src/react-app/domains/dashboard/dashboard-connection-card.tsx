import { t } from "@/i18n";
import {Button} from "@/components/ui/button";
import {useNavigate} from "react-router";
export function DashboardConnectionCard({onConnected}: {toolName:string;toolCallId:string;output:unknown;onConnected:()=>void}) {
  const navigate=useNavigate();
  return <div className="flex items-center gap-3"><p role="status" className="text-sm">{t("desktop.copy.e9c784825fe4")}</p><Button variant="outline" onClick={()=>navigate("/settings/connections")}>{t("desktop.copy.93a2bb5ea7c4")}</Button><Button variant="ghost" onClick={onConnected}>{t("desktop.copy.d8b8392e2c54")}</Button></div>;
}
