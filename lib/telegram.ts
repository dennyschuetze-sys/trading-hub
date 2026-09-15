import "server-only";

const API = "https://api.telegram.org";

export const telegramConfigured = () => Boolean(process.env.TELEGRAM_BOT_TOKEN);

async function call<T>(method: string, body?: Record<string, unknown>): Promise<T> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN fehlt");
  const res = await fetch(`${API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const json = (await res.json().catch(() => null)) as { ok?: boolean; result?: T; description?: string } | null;
  if (!json?.ok) throw new Error(json?.description ?? `Telegram antwortete mit ${res.status}`);
  return json.result as T;
}

/** Nachricht mit einfachem HTML (<b>, <i>, <a>). Texte vorher mit escapeHtml maskieren. */
export async function sendTelegram(chatId: number, html: string) {
  await call("sendMessage", { chat_id: chatId, text: html, parse_mode: "HTML", disable_web_page_preview: true });
}

export async function getBotUsername(): Promise<string | null> {
  try {
    return (await call<{ username?: string }>("getMe")).username ?? null;
  } catch (e) {
    console.error("Telegram getMe fehlgeschlagen", e);
    return null;
  }
}

type Update = { update_id: number; message?: { text?: string; date: number; chat: { id: number; type: string } } };

/**
 * Sucht in den letzten Bot-Nachrichten „/start <code>“ und liefert die Chat-ID.
 * Telegram hält Updates bis zu 24 Stunden vor, solange kein Webhook gesetzt ist.
 */
export async function findChatByCode(code: string): Promise<number | null> {
  const updates = await call<Update[]>("getUpdates", { allowed_updates: ["message"], limit: 100 });
  const match = [...updates]
    .reverse()
    .find((u) => u.message?.chat.type === "private" && u.message.text?.trim() === `/start ${code}`);
  return match?.message?.chat.id ?? null;
}
