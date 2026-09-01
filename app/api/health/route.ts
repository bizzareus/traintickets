export const dynamic = "force-static";

export async function GET() {
  return Response.json(
    {
      status: "ok",
      timestamp: new Date().toISOString(),
      service: "lastberth",
      version: "1.0.0",
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}

export async function HEAD() {
  return new Response(null, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
