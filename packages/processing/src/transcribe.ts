import fs from "fs";
import { env } from "./config";
import { TranscriptResult } from "./types";

const HF_MODEL = "openai/whisper-large-v3";

export const transcribeAudio = async (audioPath: string): Promise<TranscriptResult> => {
  const data = await fs.promises.readFile(audioPath);

  const response = await fetch(`https://api-inference.huggingface.co/models/${HF_MODEL}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.HUGGINGFACE_ACCESS_TOKEN}`,
      "Content-Type": "audio/wav"
    },
    body: data
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`HuggingFace transcription failed: ${response.status} ${errText}`);
  }

  const json = (await response.json()) as {
    text?: string;
    chunks?: Array<{ timestamp: [number, number]; text: string }>;
    language?: string;
  };

  const segments =
    json.chunks?.map((chunk) => ({
      start: chunk.timestamp?.[0] ?? 0,
      end: chunk.timestamp?.[1] ?? chunk.timestamp?.[0] ?? 0,
      text: chunk.text
    })) ?? [];

  return {
    text: json.text ?? "",
    segments,
    language: json.language,
    raw: json
  };
};
