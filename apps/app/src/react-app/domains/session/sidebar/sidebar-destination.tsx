import { t } from "@/i18n";
/** @jsxImportSource react */
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import {
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

type SidebarDestinationProps = {
  active: boolean;
  icon: LucideIcon;
  label: string;
  labelContent?: ReactNode;
  onSelect: () => void;
};

export function SidebarDestination({ active, icon: Icon, label, labelContent, onSelect }: SidebarDestinationProps) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        type="button"
        isActive={active}
        aria-current={active ? "page" : undefined}
        aria-label={label}
        tooltip={label}
        className="text-sidebar-foreground/70"
        onClick={onSelect}
      >
        <Icon className="size-4" />
        {labelContent ?? <span>{label}</span>}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
