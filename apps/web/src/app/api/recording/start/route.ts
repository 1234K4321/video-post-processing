import { NextResponse } from "next/server";
import {
  EgressClient,
  EncodedFileOutput,
  EncodedFileType,
  S3Upload
} from "livekit-server-sdk";
import { z } from "zod";
import { s3Bucket } from "@vpp/processing";
import { toHttpUrl } from "../../../../lib/livekit-url";

export const runtime = "nodejs";

const bodySchema = z.object({
  sessionId: z.string(),
  roomName: z.string()
});

export async function POST(request: Request) {
  const apiKey = process.env.LIVEKIT_API_KEY?.trim();
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();
  const serverUrl = process.env.LIVEKIT_URL?.trim();
  const region = process.env.AWS_REGION?.trim();
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();

  if (!apiKey || !apiSecret || !serverUrl || !region || !accessKeyId || !secretAccessKey) {
    return NextResponse.json({ error: "Missing env vars" }, { status: 500 });
  }

  const body = bodySchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const egressClient = new EgressClient(toHttpUrl(serverUrl), apiKey, apiSecret);
  const filepath = `sessions/${body.data.sessionId}/raw-${Date.now()}.mp4`;

  const fileOutput = new EncodedFileOutput({
    fileType: EncodedFileType.MP4,
    filepath,
    output: {
      case: "s3",
      value: new S3Upload({
        accessKey: accessKeyId,
        secret: secretAccessKey,
        region,
        bucket: s3Bucket
      })
    }
  });

  const info = await egressClient.startRoomCompositeEgress(body.data.roomName, { file: fileOutput }, {
    layout: "grid",
    audioOnly: false,
    videoOnly: false
  });

  return NextResponse.json({
    egressId: info.egressId,
    filepath
  });
}
