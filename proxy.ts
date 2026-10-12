import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth0 } from "./lib/auth0";

export async function proxy(request: NextRequest) {
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

  // Auth0 session handling (/auth/*) and rolling sessions everywhere else.
  // Skipped until the AUTH0_* env vars are set so local/devboro setups
  // without Auth0 keep working; credit checks then treat visitors as guests.
  const authConfigured =
    Boolean(process.env.AUTH0_DOMAIN) &&
    Boolean(process.env.AUTH0_CLIENT_ID) &&
    Boolean(process.env.AUTH0_CLIENT_SECRET) &&
    Boolean(process.env.AUTH0_SECRET);
  if (!authConfigured) return NextResponse.next();
  return auth0.middleware(request);
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
