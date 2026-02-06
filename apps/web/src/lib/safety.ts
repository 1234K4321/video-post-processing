import * as nsfwjs from "nsfwjs";
import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-webgl";
import "@tensorflow/tfjs-backend-webgpu";
import { sendSafetyEvent } from "./livekit";

export type SafetyFlag = {
  type: string;
  score: number;
  threshold: number;
  flagged: boolean;
  details?: Record<string, unknown>;
};

export type SafetyMonitorOptions = {
  sessionId: string;
  video: HTMLVideoElement;
  intervalMs?: number;
  onFlag?: (flags: SafetyFlag[]) => void;
};

const NUDITY_THRESHOLD = 0.7;
const PROFANITY_THRESHOLD = 0.6;

const initSafety = async () => {
  try {
    await tf.setBackend("webgpu");
  } catch (err) {
    await tf.setBackend("webgl");
  }
  await tf.ready();
  console.log("Safety Filter running on:", tf.getBackend());
};

export const startSafetyMonitor = async ({
  sessionId,
  video,
  intervalMs = 2000,
  onFlag
}: SafetyMonitorOptions) => {
  await initSafety();
  const model = await nsfwjs.load();

  let active = true;
  const tick = async () => {
    if (!active || video.readyState < 2) return;
    const predictions = await model.classify(video);
    const findScore = (label: string) =>
      predictions.find((item) => item.className === label)?.probability ?? 0;
    const pornScore = findScore("Porn");
    const hentaiScore = findScore("Hentai");
    const sexyScore = findScore("Sexy");
    const nudityScore = Math.max(pornScore, hentaiScore, sexyScore);
    const rudeScore = Math.max(findScore("Rude"), findScore("Profanity"), findScore("Obscene gesture"));
    const weaponScore = Math.max(findScore("Weapon"), findScore("Gun"));
    const profanityScore = Math.max(rudeScore, weaponScore);

    const flags: SafetyFlag[] = [
      {
        type: "nudity",
        score: nudityScore,
        threshold: NUDITY_THRESHOLD,
        flagged: nudityScore >= NUDITY_THRESHOLD,
        details: { predictions }
      },
      {
        type: "profanity",
        score: profanityScore,
        threshold: PROFANITY_THRESHOLD,
        flagged: profanityScore >= PROFANITY_THRESHOLD,
        details: { predictions }
      }
    ];

    if (flags.some((flag) => flag.flagged)) {
      const timestamp = new Date().toISOString();
      await sendSafetyEvent({ sessionId, timestamp, flags });
      onFlag?.(flags);
    }
  };

  const timer = setInterval(tick, intervalMs);

  return () => {
    active = false;
    clearInterval(timer);
  };
};
