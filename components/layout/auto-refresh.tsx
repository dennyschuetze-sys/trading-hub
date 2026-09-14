"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Lädt die Serverdaten der Seite regelmäßig neu – nur solange der Tab sichtbar ist. */
export function AutoRefresh({ seconds = 120 }: { seconds?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, seconds]);

  return null;
}
