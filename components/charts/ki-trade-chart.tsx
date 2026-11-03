"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { RotateCcw } from "lucide-react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  TickMarkType,
  createChart,
  createSeriesMarkers,
  type AutoscaleInfo,
  type IChartApi,
  type IPriceLine,
  type IPrimitivePaneRenderer,
  type IPrimitivePaneView,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type ISeriesPrimitive,
  type ITimeScaleApi,
  type Logical,
  type PrimitiveHoveredItem,
  type SeriesAttachedParameter,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { tradeState, type KiBar } from "@/lib/ki";
import {
  TIMEFRAMES,
  aggregateBars,
  placeTrade,
  visibleRange,
  type ChartCandle,
  type ChartTrade,
  type Timeframe,
  type TradePlacement,
} from "@/lib/ki-chart";
import { formatR, pnlClass } from "@/lib/trading";
import { cn } from "@/lib/utils";

export type LinkedTrade = ChartTrade & { href?: string };

/** Pixel je Kerze zu Beginn: in M15 auf dem Handy gut 40 Kerzen, am Rechner gut 130 */
const START_SPACING: Record<Timeframe, number> = { M15: 6, H1: 8, H4: 12 };
/** Pixel je Viertelstunde, ab denen die Marker ihren Text bekommen; darunter überlagern sich die Beschriftungen */
const TEXT_SPACING = 5;
const HOUR = 3_600_000;

// Farben ---------------------------------------------------------------------------------

type Rgba = [number, number, number, number];
type Palette = Record<"profit" | "loss" | "line" | "axis" | "grid" | "foreground", Rgba> & { font: string };

const rgba = ([r, g, b, a]: Rgba, alpha = 1) => `rgba(${r}, ${g}, ${b}, ${Math.round(a * alpha * 1000) / 1000})`;

/**
 * Die Farb-Tokens der App als rgba: Die Chart-Bibliothek zeichnet auf ein Canvas und versteht kein oklch(). Der
 * Umweg über ein Pixel liefert jede CSS-Farbe so, wie der Browser sie darstellt.
 */
function readPalette(el: HTMLElement): Palette {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const probe = document.createElement("span");
  el.appendChild(probe);
  const read = (token: string): Rgba => {
    probe.style.color = `var(${token})`;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = getComputedStyle(probe).color;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return [r, g, b, a / 255];
  };
  const palette = {
    profit: read("--profit"),
    loss: read("--loss"),
    line: read("--chart-line"),
    axis: read("--chart-axis"),
    grid: read("--chart-grid"),
    foreground: read("--foreground"),
    font: getComputedStyle(el).fontFamily,
  };
  probe.remove();
  return palette;
}

// Zahlen und Zeiten ------------------------------------------------------------------------

const PRICE = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const price = (value: number | null | undefined) => (value == null ? "–" : PRICE.format(value));

// Die Zeitstempel sind schon auf Berliner Uhrzeit verschoben (chartTime), deshalb hier mit UTC formatieren.
const utcFormat = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("de-DE", { ...options, timeZone: "UTC" });
const CROSSHAIR_TIME = utcFormat({ weekday: "short", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
const TICK_FORMATS: Record<TickMarkType, Intl.DateTimeFormat> = {
  [TickMarkType.Year]: utcFormat({ year: "numeric" }),
  [TickMarkType.Month]: utcFormat({ month: "short" }),
  [TickMarkType.DayOfMonth]: utcFormat({ day: "2-digit", month: "2-digit" }),
  [TickMarkType.Time]: utcFormat({ hour: "2-digit", minute: "2-digit" }),
  [TickMarkType.TimeWithSeconds]: utcFormat({ hour: "2-digit", minute: "2-digit", second: "2-digit" }),
};
const seconds = (time: Time) => (time as number) * 1000;

// Long-/Short-Boxen ------------------------------------------------------------------------

type Box = {
  key: string;
  href?: string;
  from: number;
  to: number;
  entry: number;
  stop: number | null;
  target: number | null;
};

type Renderer = IPrimitivePaneRenderer["draw"];

/**
 * Zeichnet jeden gedachten Trade wie das Long-/Short-Werkzeug von TradingView: vom Einstieg bis zum Ausstieg grün
 * die Fläche bis zum Ziel, rot die bis zum Stop, dazwischen der Einstiegskurs. Liegt unter den Kerzen, meldet die
 * Box unter dem Mauszeiger (hitTest) und hält SL und TP im sichtbaren Preisbereich.
 */
class TradeBoxes implements ISeriesPrimitive<Time> {
  private boxes: Box[] = [];
  private hovered: string | null = null;
  private labels = false;
  private palette: Palette | null = null;
  private chart: SeriesAttachedParameter<Time>["chart"] | null = null;
  private series: SeriesAttachedParameter<Time>["series"] | null = null;
  private requestUpdate: (() => void) | null = null;
  private readonly views: IPrimitivePaneView[] = [
    { zOrder: () => "bottom", renderer: () => ({ draw: (target) => this.draw(target) }) },
  ];

  attached({ chart, series, requestUpdate }: SeriesAttachedParameter<Time>) {
    this.chart = chart;
    this.series = series;
    this.requestUpdate = requestUpdate;
  }

  detached() {
    this.chart = this.series = this.requestUpdate = null;
  }

  set(changes: { boxes?: Box[]; hovered?: string | null; labels?: boolean; palette?: Palette }) {
    if (changes.boxes) this.boxes = changes.boxes;
    if (changes.hovered !== undefined) this.hovered = changes.hovered;
    if (changes.labels !== undefined) this.labels = changes.labels;
    if (changes.palette) this.palette = changes.palette;
    this.requestUpdate?.();
  }

  href(key: string) {
    return this.boxes.find((b) => b.key === key)?.href;
  }

  paneViews() {
    return this.views;
  }

  autoscaleInfo(start: Logical, end: Logical): AutoscaleInfo | null {
    let min = Infinity;
    let max = -Infinity;
    for (const box of this.boxes) {
      if (box.to < start || box.from > end) continue;
      for (const p of [box.entry, box.stop, box.target]) {
        if (p == null) continue;
        min = Math.min(min, p);
        max = Math.max(max, p);
      }
    }
    return min <= max ? { priceRange: { minValue: min, maxValue: max } } : null;
  }

  hitTest(x: number, y: number): PrimitiveHoveredItem | null {
    for (const box of [...this.boxes].reverse()) {
      const r = this.rect(box);
      if (r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        // Gezeichnet wird unter den Kerzen, getroffen über ihnen: sonst gewinnt die Kerze unter dem Mauszeiger
        return { externalId: box.key, zOrder: "top", cursorStyle: box.href ? "pointer" : undefined };
      }
    }
    return null;
  }

  /** Lage einer Box in Pixeln; die Ränder liegen eine halbe Kerze neben der ersten bzw. letzten Kerze. */
  private rect(box: Box) {
    if (!this.chart || !this.series) return null;
    const scale = this.chart.timeScale();
    const x1 = scale.logicalToCoordinate(box.from as Logical);
    const x2 = scale.logicalToCoordinate(box.to as Logical);
    const next = scale.logicalToCoordinate((box.to + 1) as Logical);
    const yEntry = this.series.priceToCoordinate(box.entry);
    if (x1 == null || x2 == null || next == null || yEntry == null) return null;
    const half = Math.max(1, (next - x2) / 2);
    const yStop = box.stop == null ? null : this.series.priceToCoordinate(box.stop);
    const yTarget = box.target == null ? null : this.series.priceToCoordinate(box.target);
    const ys: number[] = [yEntry, yStop, yTarget].filter((v) => v != null);
    return { left: x1 - half, right: x2 + half, yEntry, yStop, yTarget, top: Math.min(...ys), bottom: Math.max(...ys) };
  }

  private draw(target: Parameters<Renderer>[0]) {
    const palette = this.palette;
    if (!palette) return;
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      ctx.font = `11px ${palette.font}`;
      ctx.textBaseline = "middle";
      for (const box of this.boxes) {
        const r = this.rect(box);
        if (!r || r.right < 0 || r.left > mediaSize.width) continue;
        const hot = this.hovered === box.key;
        const width = r.right - r.left;
        const zones: [number | null, number | null, Rgba, string][] = [
          [r.yTarget, box.target, palette.profit, "TP"],
          [r.yStop, box.stop, palette.loss, "SL"],
        ];
        for (const [y, value, color, name] of zones) {
          if (y == null || value == null) continue;
          ctx.fillStyle = rgba(color, hot ? 0.3 : 0.16);
          ctx.fillRect(r.left, Math.min(y, r.yEntry), width, Math.abs(y - r.yEntry));
          ctx.fillStyle = rgba(color, 0.75);
          ctx.fillRect(r.left, Math.round(y) - 0.5, width, 1);
          // Beschriftung am äußeren Rand der Fläche, wenn Platz ist
          const room = Math.abs(y - r.yEntry);
          if ((this.labels || hot || width > 110) && room > 16) {
            ctx.fillStyle = rgba(color);
            ctx.fillText(`${name} ${price(value)}`, r.left + 5, y + (y < r.yEntry ? 9 : -9), Math.max(0, width - 10));
          }
        }
        ctx.fillStyle = rgba(palette.foreground, hot ? 0.8 : 0.5);
        ctx.fillRect(r.left, Math.round(r.yEntry) - 0.5, width, 1);
      }
    });
  }
}

// Marker -----------------------------------------------------------------------------------

const keyOf = (t: Pick<ChartTrade, "side" | "signal_at">) => `${t.side}|${t.signal_at}`;

/**
 * Pfeil beim Einstieg (bzw. beim Signal, solange der Einstieg aussteht), Punkt mit Ergebnis beim Ausstieg. Beim
 * fokussierten Trade zusätzlich die Signalkerze, an deren Schluss die KI entschieden hat.
 */
function tradeMarkers(candles: ChartCandle[], placed: [LinkedTrade, TradePlacement][], palette: Palette, focus?: string) {
  const markers: SeriesMarker<Time>[] = [];
  for (const [t, at] of placed) {
    const long = t.side === "long";
    const arrow = {
      position: long ? ("belowBar" as const) : ("aboveBar" as const),
      shape: long ? ("arrowUp" as const) : ("arrowDown" as const),
      color: rgba(palette.line),
      id: keyOf(t),
    };
    if (t.status === "wartet" && at.signal != null) {
      markers.push({ ...arrow, time: candles[at.signal].time as UTCTimestamp, text: `Signal ${long ? "Long" : "Short"}` });
    } else if (focus === t.signal_at && at.signal != null && at.signal !== at.entry) {
      // auf der anderen Seite der Kerze, damit sich die Beschriftung nicht mit dem Einstiegspfeil daneben überlagert
      markers.push({ ...arrow, time: candles[at.signal].time as UTCTimestamp, position: long ? "aboveBar" : "belowBar", shape: "circle", text: "Signal" });
    }
    if (at.entry != null && t.entry_price != null) {
      markers.push({ ...arrow, time: candles[at.entry].time as UTCTimestamp, text: long ? "Long" : "Short" });
    }
    if (t.status === "zu" && at.exit != null && t.exit_price != null) {
      const r = t.r_net ?? 0;
      markers.push({
        time: candles[at.exit].time as UTCTimestamp,
        position: "atPriceMiddle",
        price: t.exit_price,
        shape: "circle",
        color: rgba(r > 0 ? palette.profit : r < 0 ? palette.loss : palette.foreground),
        text: formatR(t.r_net),
        id: keyOf(t),
      });
    }
  }
  return markers.sort((a, b) => (a.time as number) - (b.time as number));
}

// Chart ------------------------------------------------------------------------------------

type Chart = {
  chart: IChartApi;
  series: ISeriesApi<"Candlestick">;
  last: IPriceLine;
  boxes: TradeBoxes;
  markers: ISeriesMarkersPluginApi<Time>;
  /** alle Marker mit Text; ob der Text gerade gezeigt wird, hängt von der Kerzenbreite ab */
  markerList: SeriesMarker<Time>[];
  markerText: boolean | null;
  focused: boolean;
  /** Minuten je Kerze */
  minutes: number;
};

/** Marker mit Text nur, wenn die Trades weit genug auseinanderliegen – sonst überlagern sich die Beschriftungen. */
function showMarkers(c: Chart) {
  const scale = c.chart.timeScale();
  const range = scale.getVisibleLogicalRange();
  const spacing = range == null ? 0 : scale.width() / Math.max(1, range.to - range.from);
  const text = c.focused || (spacing * 15) / c.minutes >= TEXT_SPACING;
  if (text === c.markerText) return;
  c.markerText = text;
  c.markers.setMarkers(text ? c.markerList : c.markerList.map((m) => ({ ...m, text: undefined })));
}

/**
 * Kerzenchart eines KI-Markts (XAUUSD-VIP oder NAS100.) mit den gedachten Trades der KI, gebaut mit TradingView Lightweight Charts: Mausrad
 * oder zwei Finger zoomen, Ziehen verschiebt, das Fadenkreuz zeigt Kurs und Uhrzeit (Berlin). Ohne `focus` öffnet ein
 * Klick auf eine Box die Seite des Trades; mit `focus` (Signalzeit) zeigt der Chart diesen Trade samt Umfeld.
 */
export function KiTradeChart({
  bars,
  trades,
  focus,
  symbol = "XAUUSD-VIP",
  className = "h-[22rem] sm:h-[28rem]",
}: {
  bars: KiBar[];
  trades: LinkedTrade[];
  focus?: string;
  symbol?: string;
  className?: string;
}) {
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  /** Zeitrahmen und Kerzenzahl beim letzten Zeichnen: entscheidet, ob der Ausschnitt neu gesetzt wird */
  const shownRef = useRef<{ timeframe: Timeframe; count: number } | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>("M15");
  const [hover, setHover] = useState<{ index: number | null; key: string | null }>({ index: null, key: null });

  const candles = useMemo(() => aggregateBars(bars, timeframe), [bars, timeframe]);
  const placed = useMemo(
    () => trades.map((t) => [t, placeTrade(candles, t)] as [LinkedTrade, TradePlacement]),
    [candles, trades],
  );
  const focused = focus ? trades.find((t) => t.signal_at === focus) : undefined;
  const ready = bars.length >= 2;

  // Chart einmal anlegen; Farben und Daten setzen die Effekte darunter.
  useEffect(() => {
    const el = containerRef.current;
    if (!ready || !el) return;
    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, fontSize: 11, attributionLogo: true },
      localization: {
        locale: "de-DE",
        priceFormatter: (p: number) => price(p),
        timeFormatter: (t: Time) => CROSSHAIR_TIME.format(seconds(t)),
      },
      // Feste Mindestbreite: Sonst steht die Breite erst nach dem ersten Zeichnen fest, und der Anfangsausschnitt verrutscht.
      rightPriceScale: { borderVisible: false, minimumWidth: 76, scaleMargins: { top: 0.08, bottom: 0.08 } },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        rightOffset: 4,
        barSpacing: START_SPACING.M15,
        minBarSpacing: 1.5,
        tickMarkFormatter: (t: Time, type: TickMarkType) => TICK_FORMATS[type].format(seconds(t)),
      },
      crosshair: { mode: CrosshairMode.Normal },
      // Auf dem Handy scrollt senkrechtes Wischen die Seite, nicht den Chart
      handleScroll: { vertTouchDrag: false },
    });
    // Die eingebaute Beschriftung zeigt den letzten sichtbaren Kurs; wie bei TradingView soll dort der neueste stehen.
    const series = chart.addSeries(CandlestickSeries, {
      borderVisible: false,
      priceFormat: { type: "price", precision: 2, minMove: 0.01 },
      lastValueVisible: false,
      priceLineVisible: false,
    });
    const last = series.createPriceLine({ price: 0, lineStyle: LineStyle.Dotted, lineWidth: 1, axisLabelVisible: true });
    const boxes = new TradeBoxes();
    series.attachPrimitive(boxes);
    const markers = createSeriesMarkers(series, [], { zOrder: "aboveSeries" });

    chart.subscribeCrosshairMove((param) => {
      const key = typeof param.hoveredObjectId === "string" ? param.hoveredObjectId : null;
      boxes.set({ hovered: key });
      setHover({ index: param.logical == null || !param.point ? null : Math.round(param.logical), key });
    });
    chart.subscribeClick((param) => {
      const href = typeof param.hoveredObjectId === "string" ? boxes.href(param.hoveredObjectId) : undefined;
      if (href) router.push(href);
    });

    chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
      if (chartRef.current) showMarkers(chartRef.current);
    });

    chartRef.current = { chart, series, last, boxes, markers, markerList: [], markerText: null, focused: false, minutes: 15 };
    return () => {
      chartRef.current = null;
      shownRef.current = null;
      chart.remove();
    };
  }, [router, ready]);

  // Farben, Kerzen, Boxen, Marker und Ausschnitt; läuft auch beim Wechsel zwischen hell und dunkel
  useEffect(() => {
    const c = chartRef.current;
    const el = containerRef.current;
    if (!c || !el || !candles.length) return;
    const palette = readPalette(el);
    c.chart.applyOptions({
      layout: { textColor: rgba(palette.axis), fontFamily: palette.font },
      grid: { vertLines: { color: rgba(palette.grid, 0.6) }, horzLines: { color: rgba(palette.grid) } },
      crosshair: {
        vertLine: { color: rgba(palette.axis, 0.6), labelBackgroundColor: rgba(palette.axis) },
        horzLine: { color: rgba(palette.axis, 0.6), labelBackgroundColor: rgba(palette.axis) },
      },
    });
    c.series.applyOptions({
      upColor: rgba(palette.profit),
      downColor: rgba(palette.loss),
      wickUpColor: rgba(palette.profit),
      wickDownColor: rgba(palette.loss),
    });

    c.series.setData(
      candles.map((k) => ({ time: k.time as UTCTimestamp, open: k.open, high: k.high, low: k.low, close: k.close })),
    );
    const close = candles.at(-1)!;
    c.last.applyOptions({ price: close.close, color: rgba(close.close >= close.open ? palette.profit : palette.loss) });
    c.boxes.set({
      palette,
      labels: focus != null,
      boxes: placed.flatMap(([t, at]) =>
        at.box && t.entry_price != null
          ? [{ key: keyOf(t), href: t.href, from: at.box[0], to: at.box[1], entry: t.entry_price, stop: t.stop_price, target: t.target_price }]
          : [],
      ),
    });
    c.markerList = tradeMarkers(candles, placed, palette, focus);
    c.markerText = null;
    c.focused = focus != null;
    c.minutes = TIMEFRAMES[timeframe];

    // Ausschnitt: neu bei Zeitrahmenwechsel und beim ersten Zeichnen; sonst nur mitlaufen, wenn die neueste Kerze im Bild war
    const scale = c.chart.timeScale();
    const shown = shownRef.current;
    if (!shown || shown.timeframe !== timeframe) {
      resetView(scale, candles, timeframe, focused);
    } else if (candles.length > shown.count) {
      const now = scale.getVisibleLogicalRange();
      if (now && now.to >= shown.count - 1) {
        const added = candles.length - shown.count;
        scale.setVisibleLogicalRange({ from: now.from + added, to: now.to + added });
      }
    }
    shownRef.current = { timeframe, count: candles.length };
    showMarkers(c);
  }, [candles, placed, focus, focused, timeframe, resolvedTheme]);

  if (!ready) {
    return (
      <div className={cn("flex items-center justify-center text-center text-sm text-muted-foreground", className)}>
        Noch keine Kerzen. Der Schattenbetrieb meldet sie mit jedem Lauf.
      </div>
    );
  }

  const candle = (hover.index != null ? candles[hover.index] : undefined) ?? candles.at(-1);
  const hoveredTrade = hover.key ? trades.find((t) => keyOf(t) === hover.key) : focused;
  const tradesLabel = trades.length === 1 ? "einem gedachten Trade" : `${trades.length} gedachten Trades`;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border bg-background/60 p-0.5" role="group" aria-label="Zeitrahmen">
          {(Object.keys(TIMEFRAMES) as Timeframe[]).map((tf) => (
            <button
              key={tf}
              type="button"
              aria-pressed={timeframe === tf}
              onClick={() => setTimeframe(tf)}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                timeframe === tf ? "bg-secondary text-foreground shadow-[inset_0_0_0_1px_var(--border)]" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tf}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            const c = chartRef.current;
            if (c) resetView(c.chart.timeScale(), candles, timeframe, focused);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <RotateCcw className="size-3.5" aria-hidden /> Ansicht zurücksetzen
        </button>
      </div>

      <div className="relative">
        <div
          ref={containerRef}
          className={cn("w-full", className)}
          role="img"
          aria-label={`Goldkurs ${timeframe} mit ${tradesLabel}, letzter Schluss ${price(candles.at(-1)?.close)}`}
        />
        {/* Legende wie bei TradingView: Kerze unter dem Fadenkreuz, darunter der Trade unter dem Mauszeiger */}
        <div className="pointer-events-none absolute top-1 left-1 z-10 max-w-[calc(100%-5rem)] rounded-md bg-card/80 px-2 py-1 text-[0.6875rem] leading-relaxed tabular-nums backdrop-blur-[2px]">
          {candle && (
            <p className="flex flex-wrap gap-x-2">
              <span className="font-medium">{symbol} · {timeframe}</span>
              {(
                [
                  ["E", candle.open],
                  ["H", candle.high],
                  ["T", candle.low],
                  ["S", candle.close],
                ] as const
              ).map(([label, value]) => (
                <span key={label}>
                  <span className="text-muted-foreground">{label}</span>{" "}
                  <span className={candle.close >= candle.open ? "text-profit" : "text-loss"}>{price(value)}</span>
                </span>
              ))}
            </p>
          )}
          {hoveredTrade && (
            <p className="flex flex-wrap gap-x-2">
              <span className={cn("font-semibold", hoveredTrade.side === "long" ? "text-profit" : "text-loss")}>
                {hoveredTrade.side === "long" ? "Long" : "Short"}
              </span>
              <span className="text-muted-foreground">{tradeState(hoveredTrade)}</span>
              <span>Einstieg {price(hoveredTrade.entry_price)}</span>
              <span className="text-loss">SL {price(hoveredTrade.stop_price)}</span>
              <span className="text-profit">TP {price(hoveredTrade.target_price)}</span>
              {hoveredTrade.r_net != null && <span className={cn("font-semibold", pnlClass(hoveredTrade.r_net))}>{formatR(hoveredTrade.r_net)}</span>}
              {hoveredTrade.href && <span className="text-muted-foreground">· Klick zeigt das Warum</span>}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Anfangsansicht: ohne Fokus die neuesten Kerzen, so viele, wie mit START_SPACING Pixeln je Kerze hineinpassen; mit
 * Fokus acht Stunden vor dem Signal bis vier Stunden nach dem Ausstieg.
 */
function resetView(scale: ITimeScaleApi<Time>, candles: ChartCandle[], timeframe: Timeframe, focused: ChartTrade | undefined) {
  if (!focused) {
    scale.applyOptions({ barSpacing: START_SPACING[timeframe] });
    scale.scrollToRealTime();
    return;
  }
  const end = focused.exit_at ? Date.parse(focused.exit_at) : (candles.at(-1)?.end ?? Date.now());
  const range = visibleRange(candles, Date.parse(focused.signal_at) - 8 * HOUR, end + 4 * HOUR);
  if (range) scale.setVisibleLogicalRange({ from: range.from - 0.5, to: range.to + 2 });
}
