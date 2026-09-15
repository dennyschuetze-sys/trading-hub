"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CandlestickChart } from "lucide-react";
import { navGroups } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col gap-6">
      <Link href="/dashboard" onClick={onNavigate} className="flex items-center gap-2.5 px-3 pt-1">
        <div className="flex size-8 items-center justify-center rounded-lg border border-sidebar-border bg-sidebar-accent text-sidebar-primary">
          <CandlestickChart className="size-4" />
        </div>
        <span className="text-base font-semibold tracking-tight">Trading Hub</span>
      </Link>

      <nav className="flex flex-col gap-6 overflow-y-auto">
        {navGroups.map((group) => (
          <div key={group.title} className="flex flex-col gap-0.5">
            <p className="px-3 pb-1.5 text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">
              {group.title}
            </p>
            {group.items.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-r-full before:bg-sidebar-primary"
                      : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground",
                  )}
                >
                  <Icon className={cn("size-4 shrink-0", active && "text-sidebar-primary")} />
                  {label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </div>
  );
}
