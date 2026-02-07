/// <reference lib="webworker" />

// Face Liveness Worker using MediaPipe
import { FilesetResolver, FaceLandmarker } from "@mediapipe/tasks-vision";

let faceLandmarker: FaceLandmarker | null = null;

const initialize = async () => {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm"
  );
  faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
      delegate: "GPU"
    },
    outputFaceBlendshapes: true,
    runningMode: "IMAGE",
    numFaces: 1
  });
};

initialize().then(() => {
  self.postMessage({ type: "LOADED" });
});

self.onmessage = async (e) => {
  if (!faceLandmarker) return;
  
  const { imageBitmap, timestamp } = e.data;
  
  try {
    const results = faceLandmarker.detect(imageBitmap);
    
    // Logic: If no face detected, or face is static/unnatural
    // Simple liveness check: Face Existence & Blink Detection
    
    let isLive = false;
    let score = 0;
    
    if (results.faceLandmarks.length > 0) {
        isLive = true;
        score = 0.9; // Base score for having a face
        
        // Advanced: Check blendshapes for blinking (eyeBlinkLeft, eyeBlinkRight)
        if (results.faceBlendshapes && results.faceBlendshapes.length > 0) {
            const shapes = results.faceBlendshapes[0].categories;
            const blinkLeft = shapes.find(s => s.categoryName === 'eyeBlinkLeft')?.score || 0;
            const blinkRight = shapes.find(s => s.categoryName === 'eyeBlinkRight')?.score || 0;
            
            // Just passing raw scores back for main thread accumulation/logic
            self.postMessage({
                type: "RESULT",
                timestamp,
                detected: true,
                blinkLeft,
                blinkRight,
                score
            });
            return;
        }
    }
    
    self.postMessage({
        type: "RESULT",
        timestamp,
        detected: results.faceLandmarks.length > 0,
        score: results.faceLandmarks.length > 0 ? 0.9 : 0.0
    });

  } catch (err) {
    console.error("Face worker error", err);
  } finally {
      // Cleanup bitmap to prevent memory leaks
      imageBitmap.close(); 
  }
};
