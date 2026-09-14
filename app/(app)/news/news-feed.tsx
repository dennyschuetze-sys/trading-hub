"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { NEWS_SOURCES, type NewsItem } from "@/lib/news";
import { cn } from "@/lib/utils";
import { saveNewsSettings } from "./actions";

const sourceName = (id: string) => NEWS_SOURCES.find((s) => s.id === id)?.name ?? id;

function timeAgo(iso: string | null, now: number) {
  if (!iso) return "";
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (minutes < 60) return `vor ${minutes} Min.`;
  if (minutes < 48 * 60) return `vor ${Math.round(minutes / 60)} Std.`;
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Berlin" }).format(new Date(iso));
}

/** News-Liste mit Suche und Quellen-Auswahl. Inhalte aus fremden Feeds werden nur als Text angezeigt. */
export function NewsFeed({
  items,
  sources,
  failed,
  fetchedAt,
}: {
  items: NewsItem[];
  sources: string[];
  failed: string[];
  fetchedAt: number;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(sources);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return items.filter((n) => {
      const text = `${n.title} ${n.summary}`.toLowerCase();
      return words.every((w) => text.includes(w));
    });
  }, [items, query]);

  const toggleSource = (id: string) => {
    const next = active.includes(id) ? active.filter((s) => s !== id) : [...active, id];
    setActive(next);
    startTransition(async () => {
      try {
        await saveNewsSettings({ sources: next });
        router.refresh();
      } catch {
        toast.error("Quellen konnten nicht gespeichert werden");
      }
    });
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="z. B. Gold, Fed, NFP …"
            aria-label="News durchsuchen"
            className="pl-8"
          />
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Quellen">
          {NEWS_SOURCES.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={active.includes(s.id)}
              onClick={() => toggleSource(s.id)}
              title={s.topic}
              className={cn(
                "rounded-md border px-2.5 py-1 text-sm transition-colors",
                active.includes(s.id) ? "border-foreground/60 bg-secondary font-medium" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s.name}
            </button>
          ))}
        </div>
        {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Lädt" />}
      </div>

      {failed.length > 0 && (
        <p className="text-xs text-muted-foreground">Gerade nicht erreichbar: {failed.join(", ")}</p>
      )}

      {!active.length ? (
        <p className="text-sm text-muted-foreground">Wähle mindestens eine Quelle.</p>
      ) : !filtered.length ? (
        <p className="text-sm text-muted-foreground">{query ? "Keine Meldungen zu deiner Suche." : "Keine Meldungen verfügbar."}</p>
      ) : (
        <ul className="grid gap-2">
          {filtered.map((n) => (
            <li key={n.id}>
              <a
                href={n.link}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="group flex gap-3 rounded-md border p-3 transition-colors hover:border-foreground/20"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">
                    {sourceName(n.source)} · {timeAgo(n.published, fetchedAt)}
                  </p>
                  <p className="font-medium group-hover:underline">
                    {n.title}
                    <ExternalLink className="ml-1 inline size-3 text-muted-foreground" aria-hidden />
                  </p>
                  {n.summary && <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{n.summary}</p>}
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
