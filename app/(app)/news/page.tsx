import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EventList } from "@/components/news/event-list";
import { PageHeader } from "@/components/layout/page-header";
import { berlinDay, currenciesForSymbol, filterEvents, nextEvent, relativeTime } from "@/lib/calendar";
import { getCalendar, getNews, getNewsSettings } from "@/lib/feeds";
import { rememberEvents } from "@/lib/risk-queries";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/trading";
import { CalendarFilters } from "./calendar-filters";
import { NewsFeed } from "./news-feed";
import { TradingViewCalendar } from "./tradingview-calendar";

export default async function NewsPage() {
  const supabase = await createClient();
  const settings = await getNewsSettings(supabase);
  const [calendar, news, { data: symbols }] = await Promise.all([
    getCalendar(),
    getNews(settings.newsSources),
    supabase.from("trades").select("symbol").eq("is_backtest", false).limit(1000),
  ]);
  await rememberEvents(supabase, calendar.events);

  // Vorschlag: Währungen der Symbole, die tatsächlich gehandelt werden
  const suggested = [...new Set((symbols ?? []).flatMap((s) => currenciesForSymbol(s.symbol)))].sort();

  const now = new Date();
  const events = filterEvents(calendar.events, settings.calendarCurrencies, settings.minImpact);
  const today = berlinDay(now.toISOString());
  const upcoming = events.filter((e) => berlinDay(e.time) >= today);
  const next = nextEvent(events, now);

  return (
    <>
      <PageHeader title="News & Kalender" description="Wirtschaftstermine und Marktmeldungen für deine Märkte" />

      <Tabs defaultValue="calendar" className="gap-4">
        <TabsList>
          <TabsTrigger value="calendar">Kalender</TabsTrigger>
          <TabsTrigger value="news">News</TabsTrigger>
          <TabsTrigger value="tradingview">TradingView</TabsTrigger>
        </TabsList>

        <TabsContent value="calendar" className="grid gap-4">
          <CalendarFilters currencies={settings.calendarCurrencies} minImpact={settings.minImpact} suggested={suggested} />

          {next && (
            <Card className="gap-1 py-4">
              <CardContent className="flex flex-wrap items-baseline justify-between gap-2 px-4">
                <p>
                  <span className="text-sm text-muted-foreground">Nächster High-Impact-Termin: </span>
                  <span className="font-medium">
                    {next.currency} · {next.title}
                  </span>
                </p>
                <p className="text-sm tabular-nums">
                  {formatDateTime(next.time)} · <span className="font-medium">{relativeTime(next.time, now)}</span>
                </p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Diese Woche</CardTitle>
              <CardDescription>
                Zeiten in deiner Zeit (Berlin) · Quelle: ForexFactory · vergangene Tage ausgeblendet
              </CardDescription>
            </CardHeader>
            <CardContent>
              {calendar.error ? (
                <p className="text-sm text-muted-foreground">{calendar.error} Versuch es später erneut.</p>
              ) : (
                <EventList events={upcoming} now={now} emptyText="Keine passenden Termine mehr in dieser Woche." />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="news">
          <Card>
            <CardHeader>
              <CardTitle>Marktmeldungen</CardTitle>
              <CardDescription>Aktualisiert höchstens alle 10 Minuten · Links öffnen die Originalquelle</CardDescription>
            </CardHeader>
            <CardContent>
              <NewsFeed items={news.items} sources={settings.newsSources} failed={news.failed} fetchedAt={now.getTime()} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tradingview">
          <Card>
            <CardHeader>
              <CardTitle>TradingView-Kalender</CardTitle>
              <CardDescription>Mit tatsächlichen Werten nach Veröffentlichung und Zeitraum-Auswahl</CardDescription>
            </CardHeader>
            <CardContent>
              <TradingViewCalendar currencies={settings.calendarCurrencies} minImpact={settings.minImpact} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
