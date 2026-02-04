import { RecordingResponse, SessionResponse, SafetyEventPayload } from "./types";

export const createSession = async (): Promise<SessionResponse> => {
  const response = await fetch("/api/session/create", { method: "POST" });
  if (!response.ok) {
    throw new Error("Failed to create session");
  }
  return response.json();
};

export const startRecording = async (payload: {
  sessionId: string;
  roomName: string;
}): Promise<RecordingResponse> => {
  const response = await fetch("/api/recording/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to start recording: ${text}`);
  }

  return response.json();
};

export const stopRecording = async (payload: { egressId: string }) => {
  const response = await fetch("/api/recording/stop", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to stop recording: ${text}`);
  }

  return response.json();
};

export const sendSafetyEvent = async (payload: SafetyEventPayload) => {
  await fetch("/api/safety-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
};
