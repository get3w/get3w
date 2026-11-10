import {Button} from "@/components/ui/button";
import {useNavigate} from "react-router";
export function DashboardConnectionCard({onConnected}: {toolName:string;toolCallId:string;output:unknown;onConnected:()=>void}) {
  const navigate=useNavigate();
  return <div className="flex items-center gap-3"><p role="status" className="text-sm">Connect your account to refresh this artifact.</p><Button variant="outline" onClick={()=>navigate("/settings/connections")}>Open connections</Button><Button variant="ghost" onClick={onConnected}>Try again</Button></div>;
}
