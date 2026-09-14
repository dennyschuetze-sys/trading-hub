import "server-only";

/**
 * Registrierung nur, wenn ausdrücklich erlaubt (ALLOW_SIGNUP=true).
 * Die App ist ein persönliches Werkzeug – öffentlich erreichbar soll sich niemand Fremdes anmelden können.
 * Zusätzlich sollte in Supabase unter Authentication → Sign In / Providers „Allow new users to sign up“ aus sein,
 * denn die Supabase-API ist mit dem öffentlichen Schlüssel auch direkt erreichbar.
 */
export function signupAllowed() {
  return process.env.ALLOW_SIGNUP === "true";
}
