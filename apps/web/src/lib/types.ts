export type SessionResponse = {
  sessionId: string;
  roomName: string;
  token: string;
  serverUrl: string;
};

export type RecordingResponse = {
  egressId: string;
};

export type SafetyFlag = {
  type: string;
  score: number;
  threshold: number;
  flagged: boolean;
};

export type SafetyEventPayload = {
  sessionId: string;
  timestamp: string;
  flags: SafetyFlag[];
};
