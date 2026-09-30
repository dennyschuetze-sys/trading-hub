import { Skeleton } from "@/components/ui/skeleton";

/**
 * Ladezustand für alle Seiten der App: Beim Klick erscheint sofort dieses Gerüst, statt dass die
 * alte Seite stehen bleibt, bis die Daten da sind. Header und Seitenleiste bleiben dabei stehen.
 */
export default function Loading() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Wird geladen …</span>
      <div className="mb-6 grid gap-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="mt-4 h-72 rounded-xl" />
    </div>
  );
}
