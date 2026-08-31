import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth-cookie";

/**
 * Next.js 16 renamed Middleware → Proxy. This is an OPTIMISTIC gate: it only
 * checks for the presence of a session cookie to redirect signed-out visitors
 * away from protected areas. Real authorization (valid session, `platform_admin`
 * role for `/admin`) is enforced in the layouts/pages/server actions — never
 * trust the cookie's presence alone.
 */
export default function proxy(request: NextRequest) {
  const sessionCookie = request.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionCookie) {
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("redirect", request.nextUrl.pathname);
    return NextResponse.redirect(signInUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*"],
};
