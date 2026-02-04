import { NextResponse } from "next/server";
import { WebhookReceiver } from "@livekit/server-sdk";
import { processEgressRecording } from "@vpp/processing";

export const runtime = "nodejs";

const extractSessionId = (key?: string) => {
  if (!key) return null;
  const match = key.match(/sessions\/(.*?)\//);
  return match?.[1] ?? null;
};

export async function POST(request: Request) {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;

  if (!apiKey || !apiSecret) {
    return NextResponse.json({ error: "Missing LiveKit env vars" }, { status: 500 });
  }

  const receiver = new WebhookReceiver(apiKey, apiSecret);
  const body = await request.text();
  const authHeader = request.headers.get("authorization");

  let event;
  try {
    event = receiver.receive(body, authHeader ?? "");
  } catch (err) {
    return NextResponse.json({ error: "Invalid webhook" }, { status: 401 });
  }

  if (event.event === "egress_ended") {
    const egressInfo = event.egressInfo;
    const file = egressInfo?.fileResults?.[0];
    const fileLocation = file?.location ?? egressInfo?.file?.location;
    const fileName = file?.filename ?? egressInfo?.file?.filename;
    const key = fileName ?? fileLocation;
    const sessionId = extractSessionId(key ?? "") ?? "unknown";

    if (sessionId !== "unknown") {
      await processEgressRecording({
        sessionId,
        roomName: egressInfo?.roomName ?? "",
        egressId: egressInfo?.egressId,
        fileLocation,
        fileName
      });
    }
  }

  return NextResponse.json({ ok: true });
}
