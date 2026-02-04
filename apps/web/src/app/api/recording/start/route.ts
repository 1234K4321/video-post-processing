import { NextResponse } from "next/server";
import {
  EgressClient,
  EncodedFileOutput,
  EncodedFileType
} from "@livekit/server-sdk";
import { z } from "zod";
import { s3Bucket } from "@vpp/processing";

export const runtime = "nodejs";

const bodySchema = z.object({
  sessionId: z.string(),
  roomName: z.string()
});

export async function POST(request: Request) {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const serverUrl = process.env.LIVEKIT_URL;
  const region = process.env.AWS_REGION;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!apiKey || !apiSecret || !serverUrl || !region || !accessKeyId || !secretAccessKey) {
    return NextResponse.json({ error: "Missing env vars" }, { status: 500 });
  }

  const body = bodySchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const egressClient = new EgressClient(serverUrl, apiKey, apiSecret);
  const filepath = `sessions/${body.data.sessionId}/raw-${Date.now()}.mp4`;

  const fileOutput: EncodedFileOutput = {
    fileType: EncodedFileType.MP4,
    filepath,
    s3: {
      accessKey: accessKeyId,
      secret: secretAccessKey,
      region,
      bucket: s3Bucket
    }
  };

  const info = await egressClient.startRoomCompositeEgress(body.data.roomName, fileOutput, {
    layout: "grid",
    audioOnly: false,
    videoOnly: false
  });

  return NextResponse.json({
    egressId: info.egressId,
    filepath
  });
}
