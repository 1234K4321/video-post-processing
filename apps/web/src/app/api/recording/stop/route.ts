import { NextResponse } from "next/server";
import { EgressClient } from "livekit-server-sdk";
import { z } from "zod";

export const runtime = "nodejs";

const bodySchema = z.object({
  egressId: z.string()
});

export async function POST(request: Request) {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const serverUrl = process.env.LIVEKIT_URL;

  if (!apiKey || !apiSecret || !serverUrl) {
    return NextResponse.json({ error: "Missing env vars" }, { status: 500 });
  }

  const body = bodySchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const egressClient = new EgressClient(serverUrl, apiKey, apiSecret);
  const info = await egressClient.stopEgress(body.data.egressId);

  return NextResponse.json({
    status: info.status,
    egressId: info.egressId
  });
}
