import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

// Fast, optimistic check: no session cookie means no access to app pages.
// Pages still validate the session itself (see requireSession).
export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/inbox/:path*", "/settings/:path*", "/onboarding/:path*"],
};
