"use client";

import { useEffect, useRef, useState } from "react";
import {
  LiveKitRoom,
  useLocalParticipant,
  RoomAudioRenderer
} from "@livekit/components-react";
import { createSession, startRecording, stopRecording } from "../lib/livekit";
import { startSafetyMonitor } from "../lib/safety";
import type { SafetyFlag, SessionResponse } from "../lib/types";

const MAX_DURATION_MS = 10 * 60 * 1000;

const LocalVideo = ({ onReady }: { onReady: (video: HTMLVideoElement) => void }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { cameraTrack } = useLocalParticipant();

  useEffect(() => {
    const track = cameraTrack?.track;
    const element = videoRef.current;
    if (!track || !element) return;
    track.attach(element);
    onReady(element);
    return () => {
      track.detach(element);
    };
  }, [cameraTrack, onReady]);

  return (
    <div className="video-shell">
      <video ref={videoRef} autoPlay muted playsInline />
    </div>
  );
};

export const SessionUI = () => {
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [status, setStatus] = useState("idle");
  const [egressId, setEgressId] = useState<string | null>(null);
  const [flags, setFlags] = useState<SafetyFlag[]>([]);
  const [connect, setConnect] = useState(false);
  const [endAt, setEndAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const safetyStopRef = useRef<(() => void) | null>(null);

  const handleStart = async () => {
    setStatus("starting");
    setError(null);
    const created = await createSession();
    setSession(created);
    setConnect(true);
  };

  const handleEnd = async () => {
    setStatus("ending");
    if (egressId) {
      await stopRecording({ egressId });
    }
    setConnect(false);
    setStatus("ended");
    setEndAt(null);
  };

  useEffect(() => {
    if (!session || !connect) return;
    const timer = window.setTimeout(() => {
      handleEnd();
    }, MAX_DURATION_MS);
    setEndAt(Date.now() + MAX_DURATION_MS);
    return () => clearTimeout(timer);
  }, [session, connect]);

  useEffect(() => {
    const handler = () => {
      if (!egressId) return;
      const payload = JSON.stringify({ egressId });
      navigator.sendBeacon(
        "/api/recording/stop",
        new Blob([payload], { type: "application/json" })
      );
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [egressId]);

  useEffect(() => {
    if (connect) return;
    safetyStopRef.current?.();
    safetyStopRef.current = null;
  }, [connect]);

  const handleRoomConnected = async () => {
    if (!session) return;
    try {
      const recording = await startRecording({
        sessionId: session.sessionId,
        roomName: session.roomName
      });
      setEgressId(recording.egressId);
      setStatus("recording");
    } catch (err) {
      setStatus("connected");
      setError(err instanceof Error ? err.message : "Failed to start recording.");
    }
  };

  return (
    <main>
      <header>
        <div>
          <div className="badge">LiveKit Cloud · Session Monitor</div>
          <h1>Realtime Session Capture</h1>
          <p>Start a session, record it, and monitor safety in realtime.</p>
        </div>
        <div className="status">
          <span className="badge">Status: {status}</span>
          {endAt && (
            <span className="badge">
              Auto end at {new Date(endAt).toLocaleTimeString()}
            </span>
          )}
        </div>
        {error && <span className="flag">{error}</span>}
      </header>

      <div className="grid">
        <div className="card">
          <h2>Session Controls</h2>
          <p>One-click start and end. Sessions auto-stop after 10 minutes.</p>
          <div className="status" style={{ marginTop: 16 }}>
            <button onClick={handleStart} disabled={!!session && connect}>
              Start Session
            </button>
            <button
              className="secondary"
              onClick={handleEnd}
              disabled={!session || status === "ending" || status === "ended"}
            >
              End Session
            </button>
          </div>
          {session && (
            <div style={{ marginTop: 16 }}>
              <div>Session ID: {session.sessionId}</div>
              <div>Room: {session.roomName}</div>
              <div>Recording ID: {egressId ?? "pending"}</div>
            </div>
          )}
        </div>

        <div className="card">
          <h2>Safety Flags</h2>
          <p>Realtime nudity detection plus placeholder slots for other categories.</p>
          <div className="status" style={{ marginTop: 16 }}>
            {flags.length === 0 && <span className="flag ok">No flags yet</span>}
            {flags.map((flag, idx) => (
              <span key={`${flag.type}-${idx}`} className={`flag ${flag.flagged ? "" : "ok"}`}>
                {flag.type}: {Math.round(flag.score * 100)}%
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 32 }}>
        <h2>Live Preview</h2>
        {!session && <p>Start a session to begin streaming your webcam.</p>}
        {session && (
          <LiveKitRoom
            token={session.token}
            serverUrl={session.serverUrl}
            connect={connect}
            video={true}
            audio={true}
            onConnected={handleRoomConnected}
            onDisconnected={(reason) => {
              setStatus("ended");
              if (reason) {
                setError(`Disconnected: ${String(reason)}`);
              }
            }}
            onError={(err) => {
              setStatus("error");
              setError(err?.message ?? "LiveKit connection error.");
            }}
            onMediaDeviceFailure={(err) => {
              setStatus("error");
              const detail =
                typeof err === "string"
                  ? err
                  : (err as { reason?: string })?.reason ?? "Media device error.";
              setError(detail);
            }}
            style={{ marginTop: 16 }}
          >
            <RoomAudioRenderer />
            <LocalVideo
              onReady={async (video) => {
                if (!session) return;
                if (safetyStopRef.current) return;
                safetyStopRef.current = await startSafetyMonitor({
                  sessionId: session.sessionId,
                  video,
                  onFlag: (nextFlags) => setFlags(nextFlags)
                });
              }}
            />
          </LiveKitRoom>
        )}
      </div>
    </main>
  );
};
