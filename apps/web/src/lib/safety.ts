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
  audioTrack?: MediaStreamTrack; // Optional direct track
  intervalMs?: number;
  onFlag?: (flags: SafetyFlag[]) => void;
  onKick?: (reason: string) => void;
  onWarning?: (message: string) => void;
};

const LIVENESS_THRESHOLD = 0.6; // Min score to be considered live

// Track violation durations
let faceSuspiciousStartTime: number | null = null;
let voiceSuspiciousStartTime: number | null = null;

export const startSafetyMonitor = async ({
  sessionId,
  video,
  audioTrack,
  intervalMs = 2000,
  onFlag,
  onKick,
  onWarning
}: SafetyMonitorOptions) => {
  // Initialize Workers
  const faceWorker = new Worker(new URL('./workers/face.worker.ts', import.meta.url), { type: 'module' });
  const voiceWorker = new Worker(new URL('./workers/voice.worker.ts', import.meta.url), { type: 'module' });

  // State
  let active = true;
  let running = false;
  let hasFace = false;
  let faceScore = 0;
  let voiceScore = 1; // Default to 1 until we hear something

  faceWorker.onmessage = (e) => {
      if (e.data.type === 'RESULT') {
          hasFace = e.data.detected;
          faceScore = e.data.score;
      }
  };

  voiceWorker.onmessage = (e) => {
      if (e.data.type === 'RESULT') {
          voiceScore = e.data.score;
      }
  };

  // Audio Capture Setup
  let audioContext: AudioContext;
  let workletNode: AudioWorkletNode;
  let source: MediaStreamAudioSourceNode;

  const setupAudio = async () => {
    try {
        const targetTrack = audioTrack || (video.srcObject as MediaStream)?.getAudioTracks()[0];
        
        if (targetTrack) {
            audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            
            // Resume context if suspended (browser auto-play policy)
            if (audioContext.state === 'suspended') {
                await audioContext.resume();
            }

            // Add Worklet
            try {
                // Ensure correct path to public file
                await audioContext.audioWorklet.addModule('/pcm-processor.js');
            } catch (err) {
                console.warn("Failed to load audio worklet", err);
                return;
            }

            const stream = new MediaStream([targetTrack]);
            source = audioContext.createMediaStreamSource(stream);
            workletNode = new AudioWorkletNode(audioContext, 'pcm-processor');

            // Handle PCM data from worklet
            workletNode.port.onmessage = (event) => {
                 if (!active) return;
                 // Rate limit / buffer could be added here
                 // Forward to worker
                 voiceWorker.postMessage({
                     type: 'CHECK',
                     audioData: event.data
                 });
            };

            source.connect(workletNode);
            workletNode.connect(audioContext.destination); // Needed for processing to flow? Usually audioWorklet doesn't need dest if we just tap, but for liveness we might process silence
        }
    } catch (e) {
        console.error("Audio Setup Error", e);
    }
  };

  setupAudio();

  const tick = async () => {
    if (!active || video.readyState < 2) return;
    
    // --- 1. Cloud Moderation Check (Replaces NSFWJS) ---
    if (!running) {
        running = true;
        try {
            const flags: SafetyFlag[] = [];

            // Capture frame for cloud analysis
            const canvas = document.createElement("canvas");
            canvas.width = video.videoWidth || 640;
            canvas.height = video.videoHeight || 480;
            const ctx = canvas.getContext("2d");
            
            if (ctx) {
                ctx.drawImage(video, 0, 0);
                const dataUrl = canvas.toDataURL("image/jpeg", 0.8);

                // Call Cloud API
                try {
                    const res = await fetch("/api/safety/detect-moderation", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ image: dataUrl }),
                    });
                    
                    if (res.ok) {
                        const data = await res.json();
                        if (data.flags && Array.isArray(data.flags)) {
                            flags.push(...data.flags);
                        }
                    }
                } catch (err) {
                    console.warn("Moderation API failed", err);
                }

                // Send bitmap to Face Worker (Parallel to cloud check)
                const bitmap = await createImageBitmap(canvas);
                faceWorker.postMessage({ imageBitmap: bitmap, timestamp: Date.now() }, [bitmap]);
            }

            // --- 2. Face Liveness Check ---
            // (Worker logic handled asynchronously via postMessage above, results accumulated below)
            const now = Date.now();
            let faceFlagged = false;
            
            // If no face or low score (spoof)
            if (!hasFace || faceScore < LIVENESS_THRESHOLD) {
                if (!faceSuspiciousStartTime) faceSuspiciousStartTime = now;
                
                const duration = (now - faceSuspiciousStartTime) / 1000;
                
                if (duration > 10) {
                    onWarning?.("Face verification failed. Please show your face.");
                    
                    flags.push({
                        type: "face_liveness",
                        score: faceScore,
                        threshold: LIVENESS_THRESHOLD,
                        flagged: true,
                        details: { duration, message: "Face not detected or liveness failed" }
                    });
                    
                    faceFlagged = true;
                }
                
                if (duration > 20) {
                   onKick?.("Face liveness verification failed for 20s.");
                   return; // Stop everything
                }
            } else {
                faceSuspiciousStartTime = null;
            }

            // --- 3. Voice Liveness Check ---
            let voiceFlagged = false;
            if (voiceScore < LIVENESS_THRESHOLD) {
                 if (!voiceSuspiciousStartTime) voiceSuspiciousStartTime = now;
                 const duration = (now - voiceSuspiciousStartTime) / 1000;
                 
                  if (duration > 10) {
                    onWarning?.("Voice verification failed. Artificial voice detected.");
                    
                    flags.push({
                        type: "voice_liveness",
                        score: voiceScore,
                        threshold: LIVENESS_THRESHOLD,
                        flagged: true,
                        details: { duration, message: "Artificial voice detected" }
                    });
                    
                    voiceFlagged = true;
                }
                
                if (duration > 20) {
                   onKick?.("Voice liveness verification failed for 20s.");
                   return;
                }
            } else {
                voiceSuspiciousStartTime = null;
            }

            if (flags.some((flag) => flag.flagged)) {
                const timestamp = new Date().toISOString();
                // Send event if it wasn't just a warning
                await sendSafetyEvent({ sessionId, timestamp, flags });
                onFlag?.(flags);
            }
        
        } catch (e) {
            console.error("Safety Loop Error", e);
        } finally {
            running = false;
        }
    }
  };

  const timer = setInterval(tick, intervalMs);

  return () => {
    active = false;
    clearInterval(timer);
    faceWorker.terminate();
    voiceWorker.terminate();
    if (audioContext) audioContext.close();
  };
};
