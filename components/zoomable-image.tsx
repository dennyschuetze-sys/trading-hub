"use client";

import { useEffect, useRef, useState } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MIN_SCALE = 1;
const MAX_SCALE = 8;
const STEP = 1.5;

type View = { scale: number; x: number; y: number };
type Point = { x: number; y: number };
const RESET: View = { scale: 1, x: 0, y: 0 };

/** Verschiebung so begrenzen, dass das Bild den Rahmen nie freigibt. */
function clampView(v: View, width: number, height: number): View {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale));
  return {
    scale,
    x: Math.min(0, Math.max(width - width * scale, v.x)),
    y: Math.min(0, Math.max(height - height * scale, v.y)),
  };
}

/** Auf `scale` zoomen, wobei der Punkt (px, py) im Rahmen an seiner Stelle bleibt. */
function zoomAround(v: View, scale: number, px: number, py: number, width: number, height: number): View {
  const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
  const k = next / v.scale;
  return clampView({ scale: next, x: px - (px - v.x) * k, y: py - (py - v.y) * k }, width, height);
}

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const middle = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/**
 * Bild mit Zoom: Mausrad bzw. Pinch zoomt zur Zeigerposition, Ziehen verschiebt,
 * Doppelklick wechselt zwischen Einpassen und 2,5×. Tasten: + / − / 0.
 */
export function ZoomableImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<View>(RESET);
  const [view, setView] = useState<View>(RESET);
  const [smooth, setSmooth] = useState(false);
  const [ratio, setRatio] = useState<number | null>(null);
  const pointers = useRef(new Map<number, Point>());
  // Ausgangslage der laufenden Geste (Ansicht + Zeigerpositionen beim Start)
  const baseline = useRef<{ view: View; points: Point[] } | null>(null);

  const apply = (next: View, animate: boolean) => {
    viewRef.current = next;
    setView(next);
    setSmooth(animate);
  };

  const size = () => ({ width: boxRef.current?.clientWidth ?? 0, height: boxRef.current?.clientHeight ?? 0 });

  const relative = (clientX: number, clientY: number): Point => {
    const rect = boxRef.current!.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const zoomCenter = (factor: number) => {
    const { width, height } = size();
    apply(zoomAround(viewRef.current, viewRef.current.scale * factor, width / 2, height / 2, width, height), true);
  };

  const resetGesture = () => {
    baseline.current = pointers.current.size ? { view: viewRef.current, points: [...pointers.current.values()] } : null;
  };

  // Mausrad braucht einen nicht-passiven Listener, damit die Seite nicht mitscrollt
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = box.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.002));
      const v = viewRef.current;
      const next = zoomAround(v, v.scale * factor, e.clientX - rect.left, e.clientY - rect.top, box.clientWidth, box.clientHeight);
      viewRef.current = next;
      setView(next);
      setSmooth(false);
    };
    box.addEventListener("wheel", onWheel, { passive: false });
    return () => box.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof Element && e.target.closest("input, textarea, [contenteditable]")) return;
      const box = boxRef.current;
      if (!box) return;
      const { clientWidth: width, clientHeight: height } = box;
      const v = viewRef.current;
      let next: View | null = null;
      if (e.key === "+" || e.key === "=") next = zoomAround(v, v.scale * STEP, width / 2, height / 2, width, height);
      else if (e.key === "-") next = zoomAround(v, v.scale / STEP, width / 2, height / 2, width, height);
      else if (e.key === "0") next = RESET;
      if (!next) return;
      e.preventDefault();
      viewRef.current = next;
      setView(next);
      setSmooth(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const zoomed = view.scale > 1.001;

  return (
    <div
      ref={boxRef}
      className={cn(
        "relative w-full touch-none overflow-hidden select-none",
        zoomed ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in",
        className,
      )}
      style={{ aspectRatio: ratio ?? 16 / 9 }}
      onPointerDown={(e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        pointers.current.set(e.pointerId, relative(e.clientX, e.clientY));
        resetGesture();
      }}
      onPointerMove={(e) => {
        if (!pointers.current.has(e.pointerId) || !baseline.current) return;
        pointers.current.set(e.pointerId, relative(e.clientX, e.clientY));
        const { width, height } = size();
        const { view: start, points } = baseline.current;
        const now = [...pointers.current.values()];

        if (now.length >= 2 && points.length >= 2) {
          // Pinch: Abstand ändert den Zoom, Mittelpunkt verschiebt mit
          const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, start.scale * (distance(now[0], now[1]) / distance(points[0], points[1]))));
          const from = middle(points[0], points[1]);
          const to = middle(now[0], now[1]);
          const cx = (from.x - start.x) / start.scale;
          const cy = (from.y - start.y) / start.scale;
          apply(clampView({ scale, x: to.x - cx * scale, y: to.y - cy * scale }, width, height), false);
        } else if (now.length === 1 && points.length === 1) {
          apply(clampView({ ...start, x: start.x + now[0].x - points[0].x, y: start.y + now[0].y - points[0].y }, width, height), false);
        }
      }}
      onPointerUp={(e) => {
        pointers.current.delete(e.pointerId);
        resetGesture();
      }}
      onPointerCancel={(e) => {
        pointers.current.delete(e.pointerId);
        resetGesture();
      }}
      onDoubleClick={(e) => {
        const { width, height } = size();
        const p = relative(e.clientX, e.clientY);
        apply(zoomed ? RESET : zoomAround(viewRef.current, 2.5, p.x, p.y, width, height), true);
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- signierte Supabase-URLs */}
      <img
        src={src}
        alt={alt}
        draggable={false}
        onLoad={(e) => setRatio(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight || null)}
        className={cn("size-full object-contain", smooth && "transition-transform duration-150 ease-out")}
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`, transformOrigin: "0 0" }}
      />

      <div
        className="absolute right-2 bottom-2 flex cursor-default items-center gap-0.5 rounded-lg border bg-background/85 p-0.5 shadow-sm backdrop-blur"
        onPointerDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <Button variant="ghost" size="icon-sm" onClick={() => zoomCenter(1 / STEP)} disabled={!zoomed} aria-label="Herauszoomen" title="Herauszoomen (−)">
          <Minus className="size-4" />
        </Button>
        <span className="w-11 text-center text-xs tabular-nums text-muted-foreground" aria-live="polite">
          {Math.round(view.scale * 100)} %
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => zoomCenter(STEP)}
          disabled={view.scale >= MAX_SCALE}
          aria-label="Hineinzoomen"
          title="Hineinzoomen (+)"
        >
          <Plus className="size-4" />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={() => apply(RESET, true)} disabled={!zoomed} aria-label="Zoom zurücksetzen" title="Zurücksetzen (0)">
          <RotateCcw className="size-4" />
        </Button>
      </div>
    </div>
  );
}
