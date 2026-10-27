import { SidebarMenuBadge } from "@/components/ui/sidebar";

import { SIDEBAR_COUNT_CLASS } from "./styles";

/**
 * The bare count that trails a sidebar row. Intentionally background-free: it
 * reads as plain text aligned to the right edge.
 */
export function SidebarCount({ value }: { value: number }) {
  return (
    <SidebarMenuBadge
      className={`${SIDEBAR_COUNT_CLASS} px-0 bg-transparent`}
    >
      {value}
    </SidebarMenuBadge>
  );
}
