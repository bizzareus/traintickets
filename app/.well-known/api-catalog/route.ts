import { buildApiCatalog, RFC9727_MEDIA_TYPE } from "@/lib/api-catalog";
import { getBaseUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

function getOrigin(request: Request): string {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") || "https";
  if (host) {
    return `${proto}://${host}`;
  }
  return getBaseUrl();
}

function getHeaders(origin: string): HeadersInit {
  return {
    "Content-Type": RFC9727_MEDIA_TYPE,
    "Link": `<${origin}/.well-known/api-catalog>; rel="self", <${origin}/.well-known/api-catalog>; rel="api-catalog"`,
    "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  };
}

export async function GET(request: Request) {
  const origin = getOrigin(request);
  const catalog = buildApiCatalog(origin);

  return new Response(JSON.stringify(catalog, null, 2), {
    status: 200,
    headers: getHeaders(origin),
  });
}

export async function HEAD(request: Request) {
  const origin = getOrigin(request);
  return new Response(null, {
    status: 200,
    headers: getHeaders(origin),
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Accept, Content-Type",
    },
  });
}
