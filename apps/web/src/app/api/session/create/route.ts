import { NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";
import { v4 as uuidv4 } from "uuid";
import { startSession } from "@vpp/processing";
import { toWebsocketUrl } from "../../../../lib/livekit-url";

export const runtime = "nodejs";

export async function POST() {
  const apiKey = process.env.LIVEKIT_API_KEY?.trim();
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();
  const serverUrl = process.env.LIVEKIT_URL?.trim();

  if (!apiKey || !apiSecret || !serverUrl) {
    return NextResponse.json({ error: "Missing LiveKit env vars" }, { status: 500 });
  }

  const sessionId = uuidv4();
  const roomName = `room_${sessionId.slice(0, 8)}`;

  const token = new AccessToken(apiKey, apiSecret, {
    identity: sessionId,
    ttl: 60 * 60
  });

  token.addGrant({
    room: roomName,
    roomCreate: true,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true
  });

  await startSession(sessionId, roomName);

  const jwt = await token.toJwt();

  return NextResponse.json({
    sessionId,
    roomName,
    token: jwt,
    serverUrl: toWebsocketUrl(serverUrl)
  });
}
