import { describe, expect, it } from "vitest";
import { currenciesForSymbol, filterEvents, groupByDay, nextEvent, parseForexFactory, relativeTime } from "./calendar";
import { decodeEntities, mergeNews, parseRss, safeUrl, toPlainText } from "./news";

const FF = [
  { title: "CPI m/m", country: "USD", date: "2026-09-15T08:30:00-04:00", impact: "High", forecast: "0.3%", previous: "0.2%" },
  { title: "German ZEW", country: "EUR", date: "2026-09-15T05:00:00-04:00", impact: "Medium", forecast: "", previous: "-5.1" },
  { title: "BRICS Summit", country: "All", date: "2026-09-13T04:15:00-04:00", impact: "Low", forecast: "", previous: "" },
  { title: "Bank Holiday", country: "JPY", date: "2026-09-21T00:00:00-04:00", impact: "Holiday", forecast: "", previous: "" },
  { title: "NZ Spätmeldung", country: "NZD", date: "2026-09-15T18:45:00-04:00", impact: "Low", forecast: "", previous: "" },
  { title: "", country: "USD", date: "2026-09-15T08:30:00-04:00", impact: "High" },
  { title: "Kaputtes Datum", country: "USD", date: "gestern", impact: "High" },
];

describe("ForexFactory-Kalender", () => {
  const events = parseForexFactory(FF);

  it("liest gültige Termine, sortiert und rechnet in UTC um", () => {
    expect(events.map((e) => e.title)).toEqual(["BRICS Summit", "German ZEW", "CPI m/m", "NZ Spätmeldung", "Bank Holiday"]);
    expect(events.find((e) => e.title === "CPI m/m")).toMatchObject({
      currency: "USD",
      time: "2026-09-15T12:30:00.000Z",
      impact: "high",
      forecast: "0.3%",
    });
    expect(parseForexFactory({ kaputt: true })).toEqual([]);
  });

  it("filtert nach Währung und Mindest-Impact", () => {
    expect(filterEvents(events, ["USD"], "medium").map((e) => e.title)).toEqual(["CPI m/m"]);
    expect(filterEvents(events, ["USD", "EUR"], "low").map((e) => e.title)).toEqual(["BRICS Summit", "German ZEW", "CPI m/m"]);
    // Feiertage bleiben sichtbar, wenn die Währung passt
    expect(filterEvents(events, ["JPY"], "high").map((e) => e.title)).toEqual(["Bank Holiday"]);
  });

  it("gruppiert nach Berliner Kalendertag", () => {
    // 18:45 New York = 00:45 Berlin am Folgetag
    const days = groupByDay(events.filter((e) => e.currency === "NZD" || e.currency === "USD"));
    expect(days.map((d) => [d.date, d.events.map((e) => e.title)])).toEqual([
      ["2026-09-15", ["CPI m/m"]],
      ["2026-09-16", ["NZ Spätmeldung"]],
    ]);
  });

  it("nächster High-Impact-Termin und relative Zeit", () => {
    const now = new Date("2026-09-15T12:05:00Z");
    expect(nextEvent(events, now)?.title).toBe("CPI m/m");
    expect(relativeTime("2026-09-15T12:30:00Z", now)).toBe("in 25 Min.");
    expect(relativeTime("2026-09-15T09:05:00Z", now)).toBe("vor 3 Std.");
  });

  it.each([
    ["XAUUSD", ["USD"]],
    ["EURUSD", ["USD", "EUR"]],
    ["GBPJPY", ["GBP", "JPY"]],
    ["NQ", ["USD"]],
    ["MGC", ["USD"]],
    ["GER40", ["EUR"]],
    ["BTCUSDT", ["USD"]],
  ])("Währungen für %s", (symbol, expected) => {
    expect(currenciesForSymbol(symbol).sort()).toEqual([...expected].sort());
  });
});

const RSS = `<?xml version="1.0"?><rss><channel>
<item>
  <title><![CDATA[Gold &amp; Dollar: Fed im Fokus]]></title>
  <link>https://www.example.com/news/gold-1</link>
  <pubDate>Mon, 14 Sep 2026 19:29:51 GMT</pubDate>
  <description><![CDATA[<p>Der <a href="https://x.com">Dollar</a> hält sich&nbsp;fest.</p><script>alert(1)</script>]]></description>
  <enclosure url="https://img.example.com/a.png" length="0" type="image/png"/>
</item>
<item>
  <title>Böser Link</title>
  <link>javascript:alert(1)</link>
</item>
<item>
  <title>Investing-Format</title>
  <pubDate>2026-09-14 12:13:47</pubDate>
  <link>https://www.investing.com/news/1</link>
</item>
</channel></rss>`;

describe("RSS-News", () => {
  const items = parseRss(RSS, "test");

  it("liest Titel, Link, Datum, Text und Bild", () => {
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      id: "test:https://www.example.com/news/gold-1",
      source: "test",
      title: "Gold & Dollar: Fed im Fokus",
      link: "https://www.example.com/news/gold-1",
      published: "2026-09-14T19:29:51.000Z",
      summary: "Der Dollar hält sich fest.",
      image: "https://img.example.com/a.png",
    });
  });

  it("verwirft javascript:-Links und liest Datum ohne Zeitzone als UTC", () => {
    expect(items.some((i) => i.title === "Böser Link")).toBe(false);
    expect(items[1].published).toBe("2026-09-14T12:13:47.000Z");
  });

  it("Hilfsfunktionen", () => {
    expect(decodeEntities("&#x2018;Hi&#x2019; &lt;b&gt; &#8364;")).toBe("‘Hi’ <b> €");
    expect(toPlainText("<ul><li>A</li><li>B</li></ul>")).toBe("A B");
    expect(safeUrl("data:text/html,x")).toBeNull();
    expect(safeUrl("https://a.de/x?y=1&amp;z=2")).toBe("https://a.de/x?y=1&z=2");
  });

  it("führt Quellen zusammen und entfernt Duplikate", () => {
    const merged = mergeNews([items, parseRss(RSS, "zweite")]);
    expect(merged.map((m) => m.title)).toEqual(["Gold & Dollar: Fed im Fokus", "Investing-Format"]);
  });
});
