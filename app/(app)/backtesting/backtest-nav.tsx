import Link from "next/link";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/backtesting", label: "Sessions" },
  { href: "/backtesting/compare", label: "Backtest vs. Live" },
  { href: "/backtesting/gallery", label: "Setup-Galerie" },
] as const;

export function BacktestNav({ active }: { active: (typeof LINKS)[number]["href"] }) {
  return (
    <nav aria-label="Backtesting" className="mb-6 flex flex-wrap gap-1 text-sm">
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          aria-current={l.href === active ? "page" : undefined}
          className={cn(
            "rounded-md border px-3 py-1.5 transition-colors hover:text-foreground",
            l.href === active ? "bg-secondary font-medium" : "text-muted-foreground",
          )}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
