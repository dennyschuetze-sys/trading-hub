import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { isExtreme, type CotSeries } from "@/lib/cot";
import { formatNumber, pnlClass } from "@/lib/trading";
import { cn } from "@/lib/utils";

const signed = (value: number) => `${value > 0 ? "+" : ""}${formatNumber(value, 0)}`;

/**
 * Ein Markt auf einen Blick: Bias, Netto-Position und wie extrem sie im eigenen
 * Verlauf steht. Ein Klick wählt den Markt für den Verlauf darunter aus.
 */
export function MarketCard({
  series,
  href,
  selected,
  owned,
}: {
  series: CotSeries;
  href: string;
  selected: boolean;
  owned: boolean;
}) {
  const { market, latest, index, bias } = series;
  const tone = bias.tone;
  const barColor = tone === "profit" ? "bg-profit" : tone === "loss" ? "bg-loss" : "bg-muted-foreground/50";
  const divergent = (latest.net > 0 && tone === "loss") || (latest.net < 0 && tone === "profit");

  return (
    <Link
      href={href}
      scroll={false}
      aria-current={selected ? "true" : undefined}
      className="rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <Card
        className={cn(
          "h-full gap-0 py-4 transition-colors hover:bg-accent/40",
          owned && (tone === "loss" ? "ring-loss/25" : tone === "profit" ? "ring-profit/25" : "ring-border"),
          selected && "bg-accent/40",
        )}
      >
        <CardContent className="grid gap-0 px-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-medium">
              {market.symbols[0]} <span className="text-sm font-normal text-muted-foreground">· {market.name}</span>
            </p>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-medium",
                tone === "profit" && "bg-profit/15 text-profit",
                tone === "loss" && "bg-loss/15 text-loss",
                !tone && "bg-muted text-muted-foreground",
              )}
            >
              {bias.label}
            </span>
          </div>

          {/* Farbe nach dem Vorzeichen, nicht nach dem Bias: eine positive Netto-Position
              darf nicht rot sein, auch wenn der COT-Index unten steht. */}
          <p className={cn("mt-2.5 text-2xl font-semibold tabular-nums", pnlClass(latest.net))}>{signed(latest.net)}</p>
          <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
            Netto-Kontrakte · {formatNumber(latest.netPct * 100, 1)} % des Open Interest ·{" "}
            <span className={cn(latest.change > 0 ? "text-profit" : latest.change < 0 ? "text-loss" : undefined)}>
              {signed(latest.change)} Wo.
            </span>
          </p>

          <div className="mt-3 flex items-center gap-2.5">
            <div
              className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
              role="meter"
              aria-label={`COT-Index ${market.symbols[0]}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={index === null ? 0 : Math.round(index)}
              aria-valuetext={index === null ? "Noch keine Historie" : `${Math.round(index)} von 100 – ${bias.label}`}
            >
              {index !== null && <div className={cn("h-full rounded-full", barColor)} style={{ width: `${Math.max(2, index)}%` }} />}
            </div>
            <span className={cn("text-xs tabular-nums text-muted-foreground", isExtreme(index) && "font-medium text-warning")}>
              {index === null ? "Index –" : `Index ${Math.round(index)}`}
            </span>
          </div>

          {/* Vorzeichen und Bias können auseinanderlaufen – dann sagt der Index mehr als die Zahl. */}
          {divergent && (
            <p className="mt-2 text-xs text-muted-foreground">
              Netto {latest.net > 0 ? "long" : "short"}, aber am {latest.net > 0 ? "unteren" : "oberen"} Rand der eigenen Historie.
            </p>
          )}

          {market.invert && (
            <p className="mt-2 text-xs text-muted-foreground">
              Gedreht: der Future notiert gegen den Dollar, die Zahlen stehen aus Sicht von {market.symbols[0]}.
            </p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
