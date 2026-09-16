import { ArrowDownRight, ArrowUpRight, Star } from "lucide-react";
import type { TradeDraft, TradePreview } from "@/lib/trade-preview";
import { formatMoney, formatNumber, formatR, pnlClass } from "@/lib/trading";
import { cn } from "@/lib/utils";

const localFormatter = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const timeFormatter = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" });

/** datetime-local-Werte sind Browser-Ortszeit – genauso anzeigen. */
const local = (value: string | null, withDate = true) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : (withDate ? localFormatter : timeFormatter).format(date);
};

export function formatDuration(minutes: number | null) {
  if (minutes == null) return null;
  if (minutes < 60) return `${minutes} Min.`;
  const h = Math.floor(minutes / 60);
  if (h < 48) return `${h} Std.${minutes % 60 ? ` ${minutes % 60} Min.` : ""}`;
  return `${Math.round(h / 24)} Tage`;
}

const price = (v: number | null) => (v == null ? "—" : formatNumber(v));

function Row({ label, value, className, strong }: { label: string; value: string; className?: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-sm">
      <dt className={strong ? "font-semibold" : "text-muted-foreground"}>{label}</dt>
      <dd className={cn("font-semibold tabular-nums", strong && "text-base", value === "—" && "font-normal text-muted-foreground", className)}>{value}</dd>
    </div>
  );
}

/** Kopfzeile der Zusammenfassung – auch als eingeklappte Mobile-Ansicht. */
export function SummaryHeadline({ draft, preview, currency }: { draft: TradeDraft; preview: TradePreview; currency: string }) {
  const long = draft.direction === "long";
  const Arrow = long ? ArrowUpRight : ArrowDownRight;
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className={cn("truncate text-xl font-semibold tracking-tight", !draft.symbol && "text-muted-foreground")}>{draft.symbol || "Symbol"}</span>
      <span className="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-profit/12 px-1.5 py-0.5 text-[0.6875rem] font-bold tracking-wider text-profit">
        <Arrow className="size-3" aria-hidden />
        {long ? "LONG" : "SHORT"}
      </span>
      {draft.status === "open" && <span className="shrink-0 rounded-md border px-1.5 py-0.5 text-[0.6875rem] text-muted-foreground">OFFEN</span>}
      <span className={cn("ml-auto shrink-0 text-sm font-semibold tabular-nums", pnlClass(preview.netPnl))}>
        {preview.netPnl == null ? "—" : formatMoney(preview.netPnl, currency, true)}
      </span>
    </div>
  );
}

/** Live-Zusammenfassung: nur eingegebene oder daraus berechnete Werte, sonst „—“. */
export function TradeSummary({
  draft,
  preview,
  currency,
  quantityUnit = "Lots",
}: {
  draft: TradeDraft;
  preview: TradePreview;
  currency: string;
  quantityUnit?: string;
}) {
  const money = (v: number | null, signed = false) => (v == null ? "—" : formatMoney(v, currency, signed));
  const entry = local(draft.entryTime);
  const exit = local(draft.exitTime, draft.exitTime?.slice(0, 10) !== draft.entryTime?.slice(0, 10));
  const duration = formatDuration(preview.holdMinutes);

  return (
    <div className="grid gap-3">
      <div>
        <SummaryHeadline draft={draft} preview={preview} currency={currency} />
        <p className="mt-1 text-xs text-muted-foreground tabular-nums">
          {[entry && (exit ? `${entry} → ${exit}` : entry), draft.quantity != null && `${formatNumber(draft.quantity)} ${quantityUnit}`]
            .filter(Boolean)
            .join(" · ") || "Noch keine Eckdaten"}
        </p>
      </div>

      <dl className="border-t pt-2">
        <Row label="Entry" value={price(draft.entryPrice)} />
        <Row label="Exit" value={draft.status === "open" ? "offen" : price(draft.exitPrice)} />
        <Row label="Stop Loss" value={price(draft.stopLoss)} />
        <Row label="Take Profit" value={price(draft.takeProfit)} />
      </dl>

      <dl className="border-t pt-2">
        <Row label="P&L brutto" value={money(draft.pnl, true)} className={pnlClass(draft.pnl)} />
        <Row label="Kosten" value={preview.costs ? money(preview.costs) : "—"} className={preview.costs < 0 ? "text-loss" : undefined} />
        <Row label="P&L netto" value={money(preview.netPnl, true)} className={pnlClass(preview.netPnl)} strong />
      </dl>

      <dl className="border-t pt-2">
        <Row label={preview.riskEstimated ? "Risiko (berechnet)" : "Geplantes Risiko"} value={money(preview.risk)} />
        <Row label="Bester Kurs" value={price(draft.bestPrice)} />
        <Row label="Schlechtester Kurs" value={price(draft.worstPrice)} />
        <Row label="Haltedauer" value={duration ?? "—"} />
      </dl>

      {/* Ergebnis und Qualität bewusst getrennt: ein Gewinner kann ein schlechter Trade sein */}
      <div className="border-t pt-3">
        <p className="text-[0.6875rem] font-medium tracking-[0.08em] text-muted-foreground uppercase">Ergebnis ≠ Qualität</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-foreground/[0.04] px-3 py-2.5">
            <p className="text-xs text-muted-foreground">Ergebnis</p>
            <p className={cn("mt-0.5 text-lg font-semibold tabular-nums", pnlClass(preview.rMultiple))}>
              {preview.rMultiple == null ? "—" : formatR(preview.rMultiple)}
            </p>
          </div>
          <div className="rounded-lg bg-foreground/[0.04] px-3 py-2.5">
            <p className="text-xs text-muted-foreground">Qualität</p>
            <p className="mt-1 flex gap-0.5" aria-label={draft.rating ? `${draft.rating} von 5 Sternen` : "keine Bewertung"}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Star
                  key={n}
                  className={cn("size-3.5", draft.rating != null && n <= draft.rating ? "fill-profit text-profit" : "text-muted-foreground/30")}
                  aria-hidden
                />
              ))}
            </p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {[draft.setupQuality && `Setup ${draft.setupQuality}`, draft.followedPlan != null && `Plan ${draft.followedPlan ? "✓" : "✗"}`]
                .filter(Boolean)
                .join(" · ") || "—"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
