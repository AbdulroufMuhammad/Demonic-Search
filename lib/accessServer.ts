import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { MAIN_SESSION_DAYS, SESSION_COOKIE, isMainKey, sessionFromCookie, sha256Hex, signSession, type Session } from "@/lib/accessKeys";

/** The signed-in session for this request (route handlers and server components). */
export async function currentSession(): Promise<Session | null> {
  return sessionFromCookie(cookies().get(SESSION_COOKIE)?.value);
}

export async function requireMain(): Promise<boolean> {
  return (await currentSession())?.kind === "main";
}

/**
 * Check a key someone typed in. The main key is compared with MAIN_ACCESS_KEY;
 * a temporary key is looked up by its hash and must be unrevoked and unexpired.
 * Returns the cookie value and when it expires, or null.
 */
export async function signIn(key: string): Promise<{ cookie: string; expires: Date; kind: Session["kind"] } | null> {
  const typed = String(key ?? "").trim();
  if (!typed || typed.length > 200) return null;
  if (await isMainKey(typed)) {
    const expires = new Date(Date.now() + MAIN_SESSION_DAYS * 86_400_000);
    return { cookie: await signSession({ k: "main", exp: expires.getTime() }), expires, kind: "main" };
  }
  const admin = createAdminClient();
  const { data } = await admin.from("access_keys").select("id, expires_at, revoked_at").eq("key_hash", await sha256Hex(typed)).maybeSingle();
  if (!data || data.revoked_at || new Date(data.expires_at).getTime() <= Date.now()) return null;
  await admin.from("access_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  const expires = new Date(Math.min(new Date(data.expires_at).getTime(), Date.now() + MAIN_SESSION_DAYS * 86_400_000));
  return { cookie: await signSession({ k: "temp", id: data.id, exp: expires.getTime() }), expires, kind: "temp" };
}

export const cookieOptions = (expires: Date) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  expires,
});
