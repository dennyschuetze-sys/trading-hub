"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CALENDAR_CURRENCIES } from "@/lib/calendar";
import { NEWS_SOURCES } from "@/lib/news";
import { createClient } from "@/lib/supabase/server";

export async function saveNewsSettings(input: { currencies?: string[]; minImpact?: string; sources?: string[] }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  const values: { calendar_currencies?: string[]; calendar_min_impact?: string; news_sources?: string[] } = {};
  if (input.currencies) values.calendar_currencies = input.currencies.filter((c) => CALENDAR_CURRENCIES.includes(c));
  if (input.minImpact && ["low", "medium", "high"].includes(input.minImpact)) values.calendar_min_impact = input.minImpact;
  if (input.sources) values.news_sources = input.sources.filter((s) => NEWS_SOURCES.some((n) => n.id === s));

  const { error } = await supabase.from("user_settings").upsert({ user_id: data.user.id, ...values });
  if (error) throw new Error(error.message);

  revalidatePath("/news");
  revalidatePath("/dashboard");
  revalidatePath("/plan");
}
