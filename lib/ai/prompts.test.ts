import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "../calendar";
import type { NewsItem } from "../news";
import { JOURNAL_MAX_TRADES, NEWS_MAX_ITEMS, buildJournalPrompt, buildNewsPrompt, type JournalTradeInput } from "./prompts";

const now = new Date("2026-09-15T07:00:00Z"); // 09:00 Berlin

const item = (hoursAgo: number | null, title = "Gold steigt"): NewsItem => ({
  id: title + hoursAgo,
  source: "fxstreet",
  title,
  link: "https://example.com",
  published: hoursAgo == null ? null : new Date(now.getTime() - hoursAgo * 3_600_000).toISOString(),
  summary: "Details",
  image: null,
});

const event = (hoursAhead: number, extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: String(hoursAhead),
  title: "CPI m/m",
  currency: "USD",
  time: new Date(now.getTime() + hoursAhead * 3_600_000).toISOString(),
  impact: "high",
  forecast: "0.3%",
  previous: "0.2%",
  ...extra,
});

describe("buildNewsPrompt", () => {
  it("nimmt nur Meldungen der letzten 24 Stunden und relevante Termine", () => {
    const prompt = buildNewsPrompt({
      now,
      news: [item(2, "Fed-Rede"), item(30, "Alte Meldung"), item(null, "Ohne Zeit")],
      events: [event(5.5), event(5, { title: "JPY-Termin", currency: "JPY" }), event(6, { title: "Low", impact: "low" }), event(60, { title: "Übermorgen" })],
      currencies: ["USD", "EUR"],
      symbols: ["XAUUSD", "NQ"],
    });
    expect(prompt).toContain("Fed-Rede");
    expect(prompt).toContain("Ohne Zeit");
    expect(prompt).not.toContain("Alte Meldung");
    expect(prompt).toContain("USD HIGH: CPI m/m (Prognose 0.3%, vorher 0.2%)");
    expect(prompt).not.toContain("JPY-Termin");
    expect(prompt).not.toContain("Low");
    expect(prompt).not.toContain("Übermorgen");
    expect(prompt).toContain("14:30");
    expect(prompt).toContain("XAUUSD, NQ");
  });

  it("begrenzt die Anzahl der Meldungen und kürzt lange Texte", () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ ...item(1, `Meldung ${i}`), summary: "x".repeat(1000) }));
    const prompt = buildNewsPrompt({ now, news: many, events: [], currencies: [], symbols: [] });
    expect(prompt.match(/Meldung \d+/g)).toHaveLength(NEWS_MAX_ITEMS);
    expect(prompt).not.toContain("x".repeat(301));
    expect(prompt).toContain("Keine relevanten Termine.");
  });
});

describe("buildJournalPrompt", () => {
  const trade = (extra: Partial<JournalTradeInput> = {}): JournalTradeInput => ({
    entry_time: "2026-09-14T08:00:00Z",
    exit_time: "2026-09-14T08:45:00Z",
    symbol: "NQ",
    direction: "long",
    status: "closed",
    net_pnl: -250,
    r_multiple: -1,
    currency: "USD",
    account: "Apex 50k",
    strategy: "ORB",
    session: "london",
    setup_quality: "B",
    emotion: "FOMO",
    mistakes: ["Zu früh eingestiegen"],
    followed_plan: false,
    notes: "Nicht auf Bestätigung gewartet",
    lessons: null,
    violations: ["Max. Trades überschritten"],
    ...extra,
  });

  it("enthält Trades, Tages-Reviews, Kennzahlen und eigenes Review", () => {
    const prompt = buildJournalPrompt({
      periodLabel: "KW 38 · 14.–20.09.2026",
      trades: [trade({ entry_time: "2026-09-15T12:00:00Z", symbol: "GC", notes: null }), trade()],
      plans: [
        { plan_date: "2026-09-14", followed_plan: false, discipline: 2, went_well: null, to_improve: "Geduld", lesson: null },
        { plan_date: "2026-09-15", followed_plan: null, discipline: null, went_well: null, to_improve: null, lesson: null },
      ],
      stats: { trades: 2, winRate: 0, avgR: -1, pnlByCurrency: [["USD", -500]], discipline: 55 },
      review: { went_well: null, to_improve: "Weniger traden", lessons: null },
    });
    expect(prompt).toContain("Winrate 0 %");
    expect(prompt).toContain("-500 USD");
    expect(prompt.indexOf("NQ Long")).toBeLessThan(prompt.indexOf("GC Long"));
    expect(prompt).toContain("Haltedauer 45 Min.");
    expect(prompt).toContain("Regelverstöße: Max. Trades überschritten");
    expect(prompt).toContain("Verbessern: Geduld");
    expect(prompt).not.toContain("2026-09-15:");
    expect(prompt).toContain("<eigenes_review>");
    expect(prompt).not.toMatch(/\n\n\n/);
  });

  it("nennt beim Kürzen die echte Gesamtzahl, nicht die der gedeckelten Abfrage", () => {
    // Die Abfrage lädt höchstens 500 Trades, in den Prompt gehen 200 – die Kennzahlen
    // stammen aber aus dem vollen Bestand. Ohne totalTrades stünde hier „von 500“.
    const trades = Array.from({ length: 500 }, (_, i) => trade({ entry_time: `2026-09-14T${String(i % 24).padStart(2, "0")}:00:00Z` }));
    const prompt = buildJournalPrompt({
      periodLabel: "September 2026",
      trades,
      plans: [],
      stats: { trades: 812, winRate: 0.5, avgR: 0.2, pnlByCurrency: [["USD", 100]], discipline: 70 },
      review: null,
      totalTrades: 812,
    });
    expect(prompt).toContain(`nur die ersten ${JOURNAL_MAX_TRADES} von 812 Trades`);
    expect(prompt).not.toContain("von 500 Trades");
  });

  it("fällt ohne totalTrades auf die gelieferte Anzahl zurück", () => {
    const trades = Array.from({ length: 250 }, () => trade());
    const prompt = buildJournalPrompt({
      periodLabel: "September 2026",
      trades,
      plans: [],
      stats: { trades: 250, winRate: 0, avgR: -1, pnlByCurrency: [], discipline: null },
      review: null,
    });
    expect(prompt).toContain(`nur die ersten ${JOURNAL_MAX_TRADES} von 250 Trades`);
  });

  it("kommt ohne Daten aus", () => {
    const prompt = buildJournalPrompt({
      periodLabel: "September 2026",
      trades: [],
      plans: [],
      stats: { trades: 0, winRate: null, avgR: null, pnlByCurrency: [], discipline: null },
      review: null,
    });
    expect(prompt).toContain("Keine Trades.");
    expect(prompt).not.toContain("<eigenes_review>");
  });
});
