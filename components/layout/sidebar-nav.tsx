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
      <Link href="/dashboard" onClick={onNavigate} className="flex items-center gap-2 px-3 pt-1">
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <CandlestickChart className="size-4" />
        </div>
        <span className="text-lg font-semibold tracking-tight">Trading Hub</span>
      </Link>

      <nav className="flex flex-col gap-5 overflow-y-auto">
        {navGroups.map((group) => (
          <div key={group.title} className="flex flex-col gap-1">
            <p className="px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {group.title}
            </p>
            {group.items.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                      : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" />
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
