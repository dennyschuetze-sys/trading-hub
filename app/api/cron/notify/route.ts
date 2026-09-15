import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runNotifications } from "@/lib/notify-run";
import { createAdminClient } from "@/lib/supabase/admin";
import { telegramConfigured } from "@/lib/telegram";

export const maxDuration = 60;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Wird von Supabase Cron alle 5 Minuten aufgerufen. `?dry=1` plant nur, ohne zu senden. */
async function handle(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  const admin = createAdminClient();
  if (!admin || !telegramConfigured()) {
    return NextResponse.json({ error: "SUPABASE_SECRET_KEY oder TELEGRAM_BOT_TOKEN fehlt" }, { status: 503 });
  }

  try {
    const dryRun = new URL(request.url).searchParams.get("dry") === "1";
    return NextResponse.json(await runNotifications(admin, { dryRun }));
  } catch (e) {
    console.error("Benachrichtigungs-Job fehlgeschlagen", e);
    return NextResponse.json({ error: "Job fehlgeschlagen" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
