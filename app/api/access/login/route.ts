import { NextResponse } from "next/server";
import { cookieOptions, signIn } from "@/lib/accessServer";
import { SESSION_COOKIE, accessConfigured } from "@/lib/accessKeys";

export const dynamic = "force-dynamic";

/** Exchange an access key for a session cookie. */
export async function POST(req: Request) {
  if (!accessConfigured()) return NextResponse.json({ error: "Access keys aren't set up: add MAIN_ACCESS_KEY to the deployment." }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  const session = await signIn(body?.key);
  if (!session) {
    // A short pause makes guessing keys slow.
    await new Promise((r) => setTimeout(r, 700));
    return NextResponse.json({ error: "That key isn't valid, has expired or was revoked." }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true, kind: session.kind, expires: session.expires.toISOString() });
  res.cookies.set(SESSION_COOKIE, session.cookie, cookieOptions(session.expires));
  return res;
}
