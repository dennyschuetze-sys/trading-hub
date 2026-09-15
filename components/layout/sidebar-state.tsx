"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SIDEBAR_COOKIE } from "@/lib/navigation";
import { cn } from "@/lib/utils";

const SidebarContext = createContext<{ collapsed: boolean; toggle: () => void }>({ collapsed: false, toggle: () => {} });

/** Merkt sich, ob die Seitenleiste am Desktop ausgeblendet ist (Cookie, damit der Server gleich richtig rendert). */
export function SidebarProvider({ initialCollapsed, children }: { initialCollapsed: boolean; children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  const toggle = useCallback(() => {
    setCollapsed((current) => {
      const next = !current;
      document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "open"}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
  }, []);

  // Strg+B / Cmd+B – nicht beim Tippen in Feldern (dort ist es z. B. Fett im Markdown-Editor)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "b" || !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
      const target = event.target;
      if (target instanceof Element && target.closest("input, textarea, select, [contenteditable]")) return;
      event.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  return <SidebarContext.Provider value={{ collapsed, toggle }}>{children}</SidebarContext.Provider>;
}

export function DesktopSidebar({ children }: { children: React.ReactNode }) {
  const { collapsed } = useContext(SidebarContext);
  return (
    <aside
      id="sidebar"
      inert={collapsed}
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 overflow-hidden bg-sidebar transition-[width] duration-200 ease-out motion-reduce:transition-none lg:block",
        collapsed ? "w-0" : "w-64 border-r",
      )}
    >
      {/* feste Breite, damit der Inhalt beim Einklappen nicht umbricht */}
      <div className="h-full w-64 p-4">{children}</div>
    </aside>
  );
}

export function SidebarToggle() {
  const { collapsed, toggle } = useContext(SidebarContext);
  const label = collapsed ? "Menü einblenden" : "Menü ausblenden";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="hidden lg:inline-flex"
          onClick={toggle}
          aria-label={label}
          aria-expanded={!collapsed}
          aria-controls="sidebar"
        >
          {collapsed ? <PanelLeftOpen className="size-5" /> : <PanelLeftClose className="size-5" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {label} <kbd className="ml-1 rounded border px-1 text-[10px]">Strg B</kbd>
      </TooltipContent>
    </Tooltip>
  );
}
