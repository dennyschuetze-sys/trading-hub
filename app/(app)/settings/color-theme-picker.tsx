"use client";

import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  COLOR_PRESETS,
  COLOR_THEME_COOKIE,
  colorThemeCss,
  hexToOklch,
  normalizeHex,
  serializeColorTheme,
  signalConflict,
  type ColorTheme,
} from "@/lib/color-theme";
import { cn } from "@/lib/utils";

/** Vorgaben oder zwei eigene Farben; wirkt sofort und wird pro Browser im Cookie gemerkt. */
export function ColorThemePicker({ initial }: { initial: ColorTheme }) {
  const [theme, setTheme] = useState<ColorTheme>(initial);
  // Eigene Farben bleiben erhalten, wenn man zwischendurch eine Vorgabe ausprobiert
  const [lastCustom, setLastCustom] = useState<ColorTheme | null>(initial.id === "custom" ? initial : null);

  const apply = (next: ColorTheme) => {
    setTheme(next);
    if (next.id === "custom") setLastCustom(next);
    persist(next);
  };

  // Erster Klick auf „Eigene“ startet mit den Farben des aktiven Schemas
  const startCustom = () => {
    const from = lastCustom ?? theme;
    apply({ id: "custom", accent: from.accent, base: from.base });
  };

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5" role="radiogroup" aria-label="Farbschema">
        {COLOR_PRESETS.map(({ id, label, accent, base }) => (
          <Option key={id} label={label} active={theme.id === id} onSelect={() => apply({ id, accent, base })}>
            <Swatch accent={accent} base={base} />
          </Option>
        ))}
        <Option label="Eigene" active={theme.id === "custom"} onSelect={() => theme.id !== "custom" && startCustom()}>
          {lastCustom ? (
            <Swatch accent={lastCustom.accent} base={lastCustom.base} />
          ) : (
            <span className="flex h-9 w-full items-center justify-center rounded-md border border-dashed" aria-hidden>
              <span
                className="size-4 rounded-full"
                style={{ background: "conic-gradient(#ff4696, #ffb020, #39c3ae, #4c8dff, #a884ff, #ff4696)" }}
              />
            </span>
          )}
        </Option>
      </div>

      {theme.id === "custom" && <CustomColors theme={theme} onChange={apply} />}

      <p className="text-sm text-muted-foreground">
        Gilt sofort für die ganze App und wird für diesen Browser gespeichert. Gewinn und Verlust behalten immer Türkis und Rot.
      </p>
    </div>
  );
}

/** Merkt die Wahl im Cookie (für den Server) und tauscht das Farb-CSS aus dem Layout sofort aus. */
function persist(theme: ColorTheme) {
  document.cookie = `${COLOR_THEME_COOKIE}=${serializeColorTheme(theme)}; path=/; max-age=31536000; samesite=lax`;
  let style = document.getElementById("color-theme");
  if (!style) {
    style = document.createElement("style");
    style.id = "color-theme";
    document.head.append(style);
  }
  style.textContent = colorThemeCss(theme);
}

function Option({ label, active, onSelect, children }: { label: string; active: boolean; onSelect: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onSelect}
      className={cn(
        "grid gap-2 rounded-lg border p-2 pb-2.5 text-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "border-brand bg-brand/10 text-foreground" : "text-muted-foreground hover:border-foreground/30 hover:text-foreground",
      )}
    >
      {children}
      <span className="text-sm">{label}</span>
    </button>
  );
}

/** Mini-Vorschau: Grundfarbe als Fläche, Akzent als Punkt und Linie. */
function Swatch({ accent, base }: { accent: string; base: string }) {
  return (
    <span
      className="flex h-9 w-full items-center justify-center gap-1.5 rounded-md ring-1 ring-foreground/10 ring-inset"
      style={{ backgroundColor: base }}
      aria-hidden
    >
      <span className="size-3.5 rounded-full" style={{ backgroundColor: accent }} />
      <span className="h-1.5 w-7 rounded-full opacity-50" style={{ backgroundColor: accent }} />
    </span>
  );
}

function CustomColors({ theme, onChange }: { theme: ColorTheme; onChange: (next: ColorTheme) => void }) {
  const conflict = signalConflict(theme.accent);
  const lightBase = hexToOklch(theme.base).l > 0.3;

  return (
    <div className="grid gap-4 rounded-lg border p-3 sm:grid-cols-2">
      <ColorField
        label="Akzentfarbe"
        hint="Buttons, aktiver Menüpunkt, Linien im Chart"
        value={theme.accent}
        onChange={(accent) => onChange({ ...theme, accent })}
      />
      <ColorField
        label="Grundfarbe"
        hint="Hintergrund im dunklen Modus, Seitenleiste im hellen"
        value={theme.base}
        onChange={(base) => onChange({ ...theme, base })}
      />
      {conflict && (
        <p className="text-sm text-warning sm:col-span-2">
          Die Akzentfarbe liegt nah am {conflict.label} – leicht mit {conflict.meaning} zu verwechseln.
        </p>
      )}
      {lightBase && (
        <p className="text-sm text-muted-foreground sm:col-span-2">
          Die Grundfarbe ist hell – für den dunklen Modus wird sie automatisch abgedunkelt.
        </p>
      )}
    </div>
  );
}

function ColorField({ label, hint, value, onChange }: { label: string; hint: string; value: string; onChange: (hex: string) => void }) {
  const id = useId();
  // Beim Tippen zeigt das Feld den Entwurf; übernommen wird nur ein vollständiger Hex-Wert
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    const hex = draft == null ? null : normalizeHex(draft);
    if (hex && hex !== value) onChange(hex);
    setDraft(null);
  };

  return (
    <div className="grid content-start gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <span className="relative size-9 shrink-0 overflow-hidden rounded-lg border" style={{ backgroundColor: value }}>
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-label={`${label} auswählen`}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
        </span>
        <Input
          id={id}
          value={draft ?? value.toUpperCase()}
          onChange={(e) => {
            setDraft(e.target.value);
            if (/^#?[0-9a-f]{6}$/i.test(e.target.value.trim())) onChange(normalizeHex(e.target.value)!);
          }}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && commit()}
          maxLength={7}
          spellCheck={false}
          autoComplete="off"
          className="h-9 font-mono"
        />
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
