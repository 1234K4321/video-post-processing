import { EngagementMetrics, TranscriptResult } from "./types";

export const computeEngagementFromTranscript = (
  transcript: TranscriptResult | null
): EngagementMetrics => {
  if (!transcript) {
    return {
      totalTalkTimeSec: null,
      turns: null,
      avgTurnSec: null,
      longPauses: null,
      overlaps: null,
      gazeEstimate: "unknown",
      frontFacePresence: "unknown",
      voiceProsody: "unknown",
      unnaturalConversation: "unknown",
      flags: [],
      score: 0
    };
  }

  const segments = transcript.segments ?? [];
  const totalTalkTimeSec = segments.reduce((sum, seg) => sum + Math.max(0, seg.end - seg.start), 0);
  const turns = segments.length;
  const avgTurnSec = turns > 0 ? totalTalkTimeSec / turns : 0;
  const longPauses = segments.reduce((count, seg, idx) => {
    if (idx === 0) return count;
    const prev = segments[idx - 1];
    const gap = seg.start - prev.end;
    return gap > 2 ? count + 1 : count;
  }, 0);

  const flags = [
    {
      metric: "avg_turn_sec",
      value: avgTurnSec,
      threshold: 3,
      flagged: avgTurnSec < 1
    },
    {
      metric: "long_pauses",
      value: longPauses,
      threshold: 3,
      flagged: longPauses > 3
    }
  ];

  const score = Math.max(0, 100 - flags.filter((flag) => flag.flagged).length * 15);

  return {
    totalTalkTimeSec,
    turns,
    avgTurnSec,
    longPauses,
    overlaps: 0,
    gazeEstimate: "unknown",
    frontFacePresence: "unknown",
    voiceProsody: "unknown",
    unnaturalConversation: "unknown",
    flags,
    score
  };
};
