"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function DateNav({ date, today, prev, next }: { date: string; today: string; prev: string; next: string }) {
  const router = useRouter();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="icon" asChild>
        <Link href={`/plan?date=${prev}`} aria-label="Vorheriger Tag">
          <ChevronLeft className="size-4" />
        </Link>
      </Button>
      <Input
        type="date"
        value={date}
        onChange={(e) => e.target.value && router.push(`/plan?date=${e.target.value}`)}
        aria-label="Datum wählen"
        className="w-40"
      />
      <Button variant="outline" size="icon" asChild>
        <Link href={`/plan?date=${next}`} aria-label="Nächster Tag">
          <ChevronRight className="size-4" />
        </Link>
      </Button>
      {date !== today && (
        <Button variant="ghost" asChild>
          <Link href="/plan">Heute</Link>
        </Button>
      )}
    </div>
  );
}
