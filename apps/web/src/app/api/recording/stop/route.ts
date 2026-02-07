import { NextResponse } from "next/server";
import { EgressClient } from "livekit-server-sdk";
import { z } from "zod";
import { toHttpUrl } from "../../../../lib/livekit-url";

export const runtime = "nodejs";

const bodySchema = z.object({
  egressId: z.string()
});

export async function POST(request: Request) {
  const apiKey = process.env.LIVEKIT_API_KEY?.trim();
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();
  const serverUrl = process.env.LIVEKIT_URL?.trim();

  if (!apiKey || !apiSecret || !serverUrl) {
    return NextResponse.json({ error: "Missing env vars" }, { status: 500 });
  }

  const body = bodySchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const egressClient = new EgressClient(toHttpUrl(serverUrl), apiKey, apiSecret);
  try {
    const info = await egressClient.stopEgress(body.data.egressId);
    return NextResponse.json({
      status: info.status,
      egressId: info.egressId
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    const code = typeof err === "object" && err ? (err as { code?: string }).code : undefined;
    if (
      message.includes("EGRESS_COMPLETE") ||
      message.includes("failed_precondition") ||
      code === "failed_precondition"
    ) {
      return NextResponse.json({
        status: "EGRESS_COMPLETE",
        egressId: body.data.egressId
      });
    }
    throw err;
  }
}
