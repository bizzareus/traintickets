import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  const host = request.headers.get("host");

  // 1. WWW redirection to non-WWW
  if (host && host.startsWith("www.")) {
    const newHost = host.replace(/^www\./, "");
    const protocol = request.headers.get("x-forwarded-proto") || "https";
    return NextResponse.redirect(
      `${protocol}://${newHost}${url.pathname}${url.search}`,
      301
    );
  }

  // 2. Force HTTPS in production / non-dev
  const isDev = process.env.NODE_ENV === "development";
  const proto = request.headers.get("x-forwarded-proto");
  if (!isDev && proto === "http") {
    return NextResponse.redirect(
      `https://${host}${url.pathname}${url.search}`,
      301
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - sitemap.xml, robots.txt, and similar files
     */
    "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.png$).*)",
  ],
};
