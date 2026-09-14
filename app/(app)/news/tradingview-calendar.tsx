"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";

const COUNTRY: Record<string, string> = {
  USD: "us",
  EUR: "eu,de,fr,it,es",
  GBP: "gb",
  JPY: "jp",
  CHF: "ch",
  CAD: "ca",
  AUD: "au",
  NZD: "nz",
  CNY: "cn",
};

/**
 * Offizielles TradingView-Widget „Economic Calendar“ (mit tatsächlichen Werten nach Veröffentlichung).
 * Wird beim Wechsel von Theme oder Währungen neu aufgebaut.
 */
export function TradingViewCalendar({ currencies, minImpact }: { currencies: string[]; minImpact: string }) {
  const container = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const el = container.current;
    // Erst bauen, wenn das Theme feststeht – sonst lädt das Widget doppelt
    if (!el || !resolvedTheme) return;
    el.innerHTML = "";

    const widget = document.createElement("div");
    widget.className = "tradingview-widget-container__widget";
    el.appendChild(widget);

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-events.js";
    script.async = true;
    script.type = "text/javascript";
    script.text = JSON.stringify({
      colorTheme: resolvedTheme === "light" ? "light" : "dark",
      // Nicht transparent: Browser zeichnen iframes mit anderem Farbschema sonst weiß hinterlegt
      isTransparent: false,
      width: "100%",
      height: 600,
      locale: "de_DE",
      importanceFilter: minImpact === "high" ? "1" : minImpact === "medium" ? "0,1" : "-1,0,1",
      countryFilter: (currencies.length ? currencies : Object.keys(COUNTRY)).map((c) => COUNTRY[c]).filter(Boolean).join(","),
    });
    el.appendChild(script);

    return () => {
      el.innerHTML = "";
    };
  }, [resolvedTheme, currencies, minImpact]);

  return (
    <div className="grid gap-2">
      <div ref={container} className="tradingview-widget-container min-h-[600px] overflow-hidden rounded-md border" />
      <p className="text-xs text-muted-foreground">
        Kalender von{" "}
        <a href="https://de.tradingview.com/economic-calendar/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
          TradingView
        </a>
      </p>
    </div>
  );
}
