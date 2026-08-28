import { buildOpenApiSpec } from "@/lib/openapi-spec";
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

export async function GET(request: Request) {
  const origin = getOrigin(request);
  const spec = buildOpenApiSpec(origin);

  return new Response(JSON.stringify(spec, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export async function HEAD() {
  return new Response(null, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
