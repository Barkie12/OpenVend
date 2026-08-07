import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

const ADMIN_LOGIN_PATH = "/admin/login";

/**
 * Optimistic session-cookie check for admin routes. Real enforcement happens in
 * the admin layout via `requireAdminSession`; this only short-circuits obvious
 * signed-out visits with a redirect.
 */
export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/admin") && pathname !== ADMIN_LOGIN_PATH) {
    const sessionCookie = getSessionCookie(request);
    if (sessionCookie === null) {
      return NextResponse.redirect(new URL(ADMIN_LOGIN_PATH, request.url));
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
