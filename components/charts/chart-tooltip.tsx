/** Einheitlicher Tooltip: Wert zuerst und kräftig, Beschriftung dezent darunter. */
export function ChartTooltipBox({ value, label, detail }: { value: string; label: string; detail?: string }) {
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-popover-foreground shadow-md">
      <p className="text-sm font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
      {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}
