import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { syncCot } from "@/lib/cot-sync";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Wird von Supabase Cron freitags nach der CFTC-Veröffentlichung aufgerufen (und samstags erneut).
 * `?since=YYYY-MM-DD` holt ältere Wochen nach, z. B. für den ersten Backfill.
 */
async function handle(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "SUPABASE_SECRET_KEY fehlt" }, { status: 503 });

  const since = new URL(request.url).searchParams.get("since");
  if (since && !/^\d{4}-\d{2}-\d{2}$/.test(since)) {
    return NextResponse.json({ error: "since muss YYYY-MM-DD sein" }, { status: 400 });
  }

  try {
    return NextResponse.json(await syncCot(admin, since ? { since } : {}));
  } catch (e) {
    console.error("COT-Abgleich fehlgeschlagen", e);
    return NextResponse.json({ error: "Job fehlgeschlagen" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
