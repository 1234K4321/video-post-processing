export type SafetyFlag = {
  type:
    | "nudity"
    | "suspicious_behavior"
    | "ai_bot"
    | "offensive"
    | "harassment"
    | "violence";
  score: number;
  threshold: number;
  flagged: boolean;
  details?: Record<string, unknown>;
};

export type SafetyEvent = {
  sessionId: string;
  timestamp: string;
  flags: SafetyFlag[];
  source: "realtime" | "post";
};

export type TranscriptSegment = {
  start: number;
  end: number;
  text: string;
};

export type TranscriptResult = {
  text: string;
  segments: TranscriptSegment[];
  language?: string;
  raw?: unknown;
};

export type QualityMetrics = {
  resolution: { width: number; height: number } | null;
  fps: number | null;
  durationSec: number | null;
  videoBitrateKbps: number | null;
  audioBitrateKbps: number | null;
  audioMeanVolumeDb: number | null;
  audioMaxVolumeDb: number | null;
  audioSnrEstimateDb: number | null;
  flags: Array<{ metric: string; value: number | null; threshold: number; flagged: boolean }>;
  score: number;
};

export type EngagementMetrics = {
  totalTalkTimeSec: number | null;
  turns: number | null;
  avgTurnSec: number | null;
  longPauses: number | null;
  overlaps: number | null;
  gazeEstimate: "low" | "medium" | "high" | "unknown";
  frontFacePresence: "low" | "medium" | "high" | "unknown";
  voiceProsody: "flat" | "variable" | "unknown";
  unnaturalConversation: "low" | "medium" | "high" | "unknown";
  flags: Array<{ metric: string; value: number | string | null; threshold: string | number; flagged: boolean }>;
  score: number;
  modelNotes?: string;
};

export type SessionAnalysis = {
  sessionId: string;
  roomName: string;
  egressId?: string;
  recording: {
    sourceKey: string;
    localVideoPath: string;
    localAudioPath: string;
  };
  transcript: TranscriptResult | null;
  quality: QualityMetrics | null;
  engagement: EngagementMetrics | null;
  combinedScore: number | null;
};
