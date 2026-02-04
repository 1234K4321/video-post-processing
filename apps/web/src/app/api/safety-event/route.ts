import { NextResponse } from "next/server";
import { z } from "zod";
import { storeSafetyEvent } from "@vpp/processing";

export const runtime = "nodejs";

const bodySchema = z.object({
  sessionId: z.string(),
  timestamp: z.string(),
  flags: z.array(
    z.object({
      type: z.string(),
      score: z.number(),
      threshold: z.number(),
      flagged: z.boolean(),
      details: z.any().optional()
    })
  )
});

export async function POST(request: Request) {
  const body = bodySchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  await storeSafetyEvent({
    sessionId: body.data.sessionId,
    timestamp: body.data.timestamp,
    flags: body.data.flags,
    source: "realtime"
  });

  return NextResponse.json({ ok: true });
}
