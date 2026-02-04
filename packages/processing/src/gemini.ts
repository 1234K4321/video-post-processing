import { env } from "./config";
import { EngagementMetrics, QualityMetrics, TranscriptResult } from "./types";

const GEMINI_MODEL = "gemini-1.5-flash";

export type GeminiAnalysis = {
  engagement: Partial<EngagementMetrics>;
  quality: Partial<QualityMetrics>;
  combinedScore: number;
  notes: string;
};

export const runGeminiAnalysis = async (input: {
  transcript: TranscriptResult | null;
  quality: QualityMetrics | null;
  engagement: EngagementMetrics | null;
}) => {
  const prompt = {
    system: `You are an evaluator for a single-user recorded video session.\nReturn JSON only.`,
    user: {
      transcript: input.transcript?.text?.slice(0, 12000) ?? "",
      transcriptSegments: input.transcript?.segments?.slice(0, 200) ?? [],
      derivedQuality: input.quality,
      derivedEngagement: input.engagement,
      instructions: {
        engagement: [
          "Estimate gaze/eye contact, front face presence, voice prosody, unnatural conversation using transcript cues and derived metadata.",
          "Return scores 0-100 and flags for low quality."
        ],
        quality: [
          "Assess video resolution, fps, artifacts/noise/motion blur using derivedQuality hints.",
          "Assess audio SNR, volume consistency, clipping using derivedQuality."
        ],
        output: {
          engagement: {
            gazeEstimate: "low|medium|high",
            frontFacePresence: "low|medium|high",
            voiceProsody: "flat|variable",
            unnaturalConversation: "low|medium|high",
            score: "number 0-100",
            flags: "array"
          },
          quality: {
            score: "number 0-100",
            flags: "array"
          },
          combinedScore: "number 0-100",
          notes: "string"
        }
      }
    }
  };

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: JSON.stringify(prompt) }]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json"
        }
      })
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini analysis failed: ${response.status} ${errText}`);
  }

  const json = await response.json();
  const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";

  try {
    return JSON.parse(rawText) as GeminiAnalysis;
  } catch (err) {
    throw new Error(`Failed to parse Gemini output: ${rawText}`);
  }
};
