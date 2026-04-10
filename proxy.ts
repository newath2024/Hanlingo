import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth-routes";

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (pathname.startsWith("/api/progress/") && !sessionToken) {
    return NextResponse.json(
      {
        error: "Unauthorized.",
      },
      { status: 401 },
    );
  }

  if (
    (pathname === "/" ||
      pathname.startsWith("/unit/") ||
      pathname.startsWith("/node/") ||
      pathname.startsWith("/lesson/")) &&
    !sessionToken
  ) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/unit/:path*", "/node/:path*", "/lesson/:path*", "/api/progress/:path*"],
};
