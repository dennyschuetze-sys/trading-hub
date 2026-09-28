"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CandlestickChart } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { activeNavHref, navGroups } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { useSidebar } from "./sidebar-state";

/**
 * Navigation für Seitenleiste und Handy-Menü.
 * `collapsible`: nur die Desktop-Leiste – eingeklappt zeigt sie nur Symbole mit Tooltip.
 */
export function SidebarNav({ onNavigate, collapsible = false }: { onNavigate?: () => void; collapsible?: boolean }) {
  const pathname = usePathname();
  const sidebar = useSidebar();
  const collapsed = collapsible && sidebar.collapsed;
  const activeHref = activeNavHref(pathname);

  return (
    <div className={cn("flex h-full flex-col", collapsed ? "gap-4" : "gap-6")}>
      <Link
        href="/dashboard"
        onClick={onNavigate}
        aria-label={collapsed ? "Trading Hub – Dashboard" : undefined}
        className={cn("flex items-center gap-2.5 pt-1", collapsed ? "justify-center" : "px-3")}
      >
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-sidebar-border bg-sidebar-accent text-sidebar-primary">
          <CandlestickChart className="size-4" />
        </div>
        {!collapsed && <span className="text-base font-semibold tracking-tight">Trading Hub</span>}
      </Link>

      <nav className={cn("flex flex-col overflow-x-hidden overflow-y-auto [scrollbar-width:none]", collapsed ? "gap-1" : "gap-6")}>
        {navGroups.map((group, groupIndex) => (
          <div key={group.title} className={cn("flex flex-col", collapsed ? "items-center gap-1" : "gap-0.5")}>
            {collapsed ? (
              groupIndex > 0 && <div className="my-1.5 h-px w-6 bg-sidebar-border" role="separator" aria-hidden />
            ) : (
              <p className="px-3 pb-1.5 text-[0.65625rem] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">
                {group.title}
              </p>
            )}
            {group.items.map(({ href, label, icon: Icon }) => {
              const active = href === activeHref;
              const link = (
                <Link
                  key={href}
                  href={href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  aria-label={collapsed ? label : undefined}
                  className={cn(
                    "relative flex items-center rounded-lg text-sm transition-colors",
                    collapsed ? "size-10 justify-center" : "gap-3 px-3 py-2",
                    active
                      ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-r-full before:bg-sidebar-primary"
                      : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground",
                  )}
                >
                  <Icon className={cn("shrink-0", collapsed ? "size-[1.125rem]" : "size-4", active && "text-sidebar-primary")} />
                  {!collapsed && label}
                </Link>
              );
              if (!collapsed) return link;
              return (
                <Tooltip key={href}>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right" sideOffset={8}>
                    {label}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        ))}
      </nav>
    </div>
  );
}
