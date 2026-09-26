import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, accessConfigured, isPublicPath, sessionFromCookie } from "@/lib/accessKeys";

/**
 * Every page and API call needs an access key, except the key entry page and
 * view-only share links. Pages without a valid key go to /access; API calls get 401.
 */
export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (isPublicPath(pathname, req.method)) return NextResponse.next();

  if (!accessConfigured()) {
    // Local development without a key stays open; a deployment without MAIN_ACCESS_KEY stays locked.
    if (process.env.NODE_ENV !== "production") return NextResponse.next();
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Access keys aren't set up: add MAIN_ACCESS_KEY to the deployment." }, { status: 503 });
    return NextResponse.redirect(new URL("/access", req.url));
  }

  const session = await sessionFromCookie(req.cookies.get(SESSION_COOKIE)?.value);
  if (session) return NextResponse.next();

  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "An access key is required." }, { status: 401 });
  const to = new URL("/access", req.url);
  if (pathname !== "/") to.searchParams.set("next", pathname + search);
  const res = NextResponse.redirect(to);
  // A cookie that no longer works (expired, revoked, signed with an old main key) is cleared.
  if (req.cookies.get(SESSION_COOKIE)) res.cookies.delete(SESSION_COOKIE);
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|apple-icon).*)"],
};
