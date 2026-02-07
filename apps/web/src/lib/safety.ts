import * as nsfwjs from "nsfwjs";
import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-webgl";
import "@tensorflow/tfjs-backend-webgpu";
import { FilesetResolver, GestureRecognizer } from "@mediapipe/tasks-vision";
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
const PROFANITY_THRESHOLD = 0.7;

const GESTURE_WASM_BASE = "https://cdn.jsdelivr.net";
const GESTURE_MODEL_URL = "https://storage.googleapis.com";

const initSafety = async () => {
  try {
    await tf.setBackend("webgpu");
  } catch (err) {
    await tf.setBackend("webgl");
  }
  await tf.ready();
  console.log("Safety Filter running on:", tf.getBackend());
};

let gestureRecognizerPromise: Promise<GestureRecognizer> | null = null;
let gestureMode: "VIDEO" | "IMAGE" = "IMAGE";
let gestureDisabled = false;
let gestureCanvas: HTMLCanvasElement | null = null;
let gestureCtx: CanvasRenderingContext2D | null = null;

const initGestureRecognizer = async () => {
  if (gestureRecognizerPromise) return gestureRecognizerPromise;

  gestureRecognizerPromise = (async () => {
    const vision = await FilesetResolver.forVisionTasks(GESTURE_WASM_BASE);
    return await GestureRecognizer.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: GESTURE_MODEL_URL,
        // In 2026 browsers, 'GPU' is the standard, but we wrap it
        delegate: "GPU", 
      },
      runningMode: "VIDEO", // Stick to VIDEO for performance
      numHands: 1
    });
  })();

  return gestureRecognizerPromise;
};


const readProfanityScore = async (video: HTMLVideoElement) => {
  try {
    if (video.readyState < 3) return { score: 0, label: null };
    const recognizer = await initGestureRecognizer();
    const result = recognizer.recognizeForVideo(video, performance.now());

    if (!result.landmarks || result.landmarks.length === 0) return { score: 0, label: null };

    const landmarks = result.landmarks[0]; // First hand detected

    // Helper: Is a finger extended? (Tip is significantly higher than the first joint)
    // Landmark Indices: Index(8), Middle(12), Ring(16), Pinky(20)
    // Joint Indices: Index(6), Middle(10), Ring(14), Pinky(18)
    const isExtended = (tipIdx: number, jointIdx: number) => landmarks[tipIdx].y < landmarks[jointIdx].y;

    const indexUp = isExtended(8, 6);
    const middleUp = isExtended(12, 10);
    const ringUp = isExtended(16, 14);
    const pinkyUp = isExtended(20, 18);

    // CRITICAL LOGIC: Middle is UP, others are DOWN
    if (middleUp && !indexUp && !ringUp && !pinkyUp) {
      console.log("⚠️ PROFANITY DETECTED: Middle Finger");
      return { score: 1.0, label: "Middle_Finger_Manual" };
    }

    return { score: 0, label: null };
  } catch (err) {
    return { score: 0, label: null };
  }
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
  let running = false;
  const tick = async () => {
    if (!active || video.readyState < 2) return;
    if (running) return;
    running = true;
    try {
      const [predictions, gestureData] = await Promise.all([
        model.classify(video),
        readProfanityScore(video)
      ]);
      const findScore = (label: string) =>
        predictions.find((item) => item.className === label)?.probability ?? 0;
      const pornScore = findScore("Porn");
      const hentaiScore = findScore("Hentai");
      const nudityScore = Math.max(pornScore, hentaiScore);

      const { score: profanityScore, label: profanityLabel } = gestureData;

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
          details: { label: profanityLabel }
        }
      ];

      if (flags.some((flag) => flag.flagged)) {
        const timestamp = new Date().toISOString();
        await sendSafetyEvent({ sessionId, timestamp, flags });
        onFlag?.(flags);
      }
    } finally {
      running = false;
    }
  };

  const timer = setInterval(tick, intervalMs);

  return () => {
    active = false;
    clearInterval(timer);
  };
};
