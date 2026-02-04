import fs from "fs";
import os from "os";
import path from "path";
import { env, resolveBucketName } from "./config";
import { computeEngagementFromTranscript } from "./engagement";
import { computeQualityMetrics } from "./quality";
import { runCommand, getFfmpegPath } from "./ffmpeg";
import { runGeminiAnalysis } from "./gemini";
import { downloadToFile, putJson, uploadFile } from "./s3";
import { transcribeAudio } from "./transcribe";
import {
  EngagementMetrics,
  QualityMetrics,
  SafetyEvent,
  SessionAnalysis,
  TranscriptResult
} from "./types";
import { ensureSchema, insertSession, insertSessionEvent, updateSessionEnd } from "./db";

export const storeSafetyEvent = async (event: SafetyEvent) => {
  await ensureSchema();
  const key = `sessions/${event.sessionId}/safety/${event.timestamp}.json`;
  await putJson(key, event);
  await insertSessionEvent(event.sessionId, "safety", event);
};

export const startSession = async (sessionId: string, roomName: string) => {
  await ensureSchema();
  await insertSession(sessionId, roomName);
};

const getLocalPath = (sessionId: string, filename: string) =>
  path.join(os.tmpdir(), `${sessionId}-${filename}`);

const extractAudio = async (videoPath: string, audioPath: string) => {
  const ffmpegPath = getFfmpegPath();
  await runCommand(ffmpegPath, [
    "-y",
    "-i",
    videoPath,
    "-vn",
    "-acodec",
    "pcm_s16le",
    "-ar",
    "16000",
    audioPath
  ]);
};

const deriveS3Key = (location?: string, fileName?: string) => {
  if (location?.startsWith("s3://")) {
    const withoutScheme = location.replace("s3://", "");
    const parts = withoutScheme.split("/");
    return parts.slice(1).join("/");
  }
  if (location?.includes("amazonaws.com/")) {
    const url = new URL(location);
    return url.pathname.replace(/^\//, "");
  }
  return fileName ?? "";
};

export const processEgressRecording = async (input: {
  sessionId: string;
  roomName: string;
  egressId?: string;
  fileLocation?: string;
  fileName?: string;
}) => {
  await ensureSchema();

  const key = deriveS3Key(input.fileLocation, input.fileName);
  if (!key) {
    throw new Error("Could not determine S3 key for egress recording");
  }

  const localVideoPath = getLocalPath(input.sessionId, "recording.mp4");
  const localAudioPath = getLocalPath(input.sessionId, "audio.wav");

  await downloadToFile(key, localVideoPath);
  await extractAudio(localVideoPath, localAudioPath);

  let transcript: TranscriptResult | null = null;
  try {
    transcript = await transcribeAudio(localAudioPath);
  } catch (err) {
    transcript = null;
  }

  let quality: QualityMetrics | null = null;
  try {
    quality = await computeQualityMetrics(localVideoPath);
  } catch (err) {
    quality = null;
  }

  let engagement: EngagementMetrics | null = null;
  try {
    engagement = computeEngagementFromTranscript(transcript);
  } catch (err) {
    engagement = null;
  }

  let combinedScore: number | null = null;
  let geminiNotes: string | undefined;
  try {
    const gemini = await runGeminiAnalysis({ transcript, quality, engagement });
    if (engagement) {
      engagement = {
        ...engagement,
        ...gemini.engagement,
        modelNotes: gemini.notes
      };
    }
    if (quality) {
      quality = {
        ...quality,
        ...gemini.quality
      };
    }
    combinedScore = gemini.combinedScore ?? null;
    geminiNotes = gemini.notes;
  } catch (err) {
    if (engagement) {
      engagement.modelNotes = "Gemini analysis failed; used derived metrics only.";
    }
  }

  const analysis: SessionAnalysis = {
    sessionId: input.sessionId,
    roomName: input.roomName,
    egressId: input.egressId,
    recording: {
      sourceKey: key,
      localVideoPath,
      localAudioPath
    },
    transcript,
    quality,
    engagement,
    combinedScore
  };

  const prefix = `sessions/${input.sessionId}`;
  await uploadFile(`${prefix}/recording.mp4`, localVideoPath, "video/mp4");
  await uploadFile(`${prefix}/audio.wav`, localAudioPath, "audio/wav");

  const tempTranscriptPath = transcript
    ? await writeTempTranscript(input.sessionId, transcript.text)
    : null;

  if (transcript) {
    await putJson(`${prefix}/transcript.json`, transcript);
    if (tempTranscriptPath) {
      await uploadFile(`${prefix}/transcript.txt`, tempTranscriptPath, "text/plain");
    }
  }
  if (quality) {
    await putJson(`${prefix}/quality.json`, quality);
  }
  if (engagement) {
    await putJson(`${prefix}/engagement.json`, engagement);
  }
  if (combinedScore !== null) {
    await putJson(`${prefix}/combined-score.json`, {
      combinedScore,
      notes: geminiNotes ?? ""
    });
  }

  await putJson(`${prefix}/analysis.json`, analysis);
  await insertSessionEvent(input.sessionId, "analysis", analysis);
  await updateSessionEnd(input.sessionId, input.egressId);

  cleanupFiles([localVideoPath, localAudioPath, tempTranscriptPath].filter(Boolean) as string[]);

  return analysis;
};

const writeTempTranscript = async (sessionId: string, text: string) => {
  const filePath = getLocalPath(sessionId, "transcript.txt");
  await fs.promises.writeFile(filePath, text);
  return filePath;
};

const cleanupFiles = (files: string[]) => {
  for (const file of files) {
    fs.promises.unlink(file).catch(() => undefined);
  }
};

export const s3Bucket = resolveBucketName(env.RECORDINGS_S3_BUCKET);
