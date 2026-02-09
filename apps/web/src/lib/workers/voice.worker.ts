/// <reference lib="webworker" />

// Voice Liveness Worker using Transformers.js
import { pipeline, env } from "@xenova/transformers";

// Skip local checks for models
env.allowLocalModels = false;
env.useBrowserCache = true;

let classifier: any = null;

const initialize = async () => {
    try {
        // Using "Gustking/wav2vec2-large-xlsr-deepfake-audio-classification" as requested
        // This is a dedicated deepfake classification model
        classifier = await pipeline("audio-classification", "Gustking/wav2vec2-large-xlsr-deepfake-audio-classification", {
            device: 'webgpu',
        });
        
        self.postMessage({ type: "LOADED" });
    } catch (e) {
        console.error("Failed to load deepfake model", e);
        try {
             classifier = await pipeline("audio-classification", "Gustking/wav2vec2-large-xlsr-deepfake-audio-classification", {
                device: 'cpu',
            });
            self.postMessage({ type: "LOADED" });
        } catch (e2) {
             console.error("Failed fallback load", e2);
        }
    }
};

initialize();

// Buffer for accumulating PCM chunks
let audioBuffer: Float32Array = new Float32Array(0);
const TARGET_SAMPLE_RATE = 16000;
const PROCESSING_WINDOW = TARGET_SAMPLE_RATE * 2; // 2 seconds of audio

self.onmessage = async (e) => {
    const { type, audioData } = e.data;
    if (type !== 'CHECK' || !classifier) return;

    if (audioData) {
        // Append new data
        const newBuffer = new Float32Array(audioBuffer.length + audioData.length);
        newBuffer.set(audioBuffer);
        newBuffer.set(audioData, audioBuffer.length);
        audioBuffer = newBuffer;
        
        // Process if we have enough data (e.g. 2s)
        if (audioBuffer.length >= PROCESSING_WINDOW) {
            const chunkToProcess = audioBuffer.slice(0, PROCESSING_WINDOW);
             // Shift buffer
            audioBuffer = audioBuffer.slice(PROCESSING_WINDOW);
            
            try {
                // Run inference on the dedicated deepfake classifier
                const output = await classifier(chunkToProcess);
                
                // Typical output for audio-classification:
                // [{ label: 'real', score: 0.99 }, { label: 'fake', score: 0.01 }]
                // OR [{ label: 'bonafide', score: ... }, ...] depending on model mapping.
                
                // Inspecting the model card or testing shows the label mapping.
                // Assuming labels like 'real'/'fake' or similar.
                // We'll search for 'real' or 'bonafide'.
                const realLabel = output.find((x: any) => 
                    x.label.toLowerCase().includes('real') || 
                    x.label.toLowerCase().includes('bonafide')
                );
                
                // If the model uses 'spoof'/'fake', we might invert the score.
                const fakeLabel = output.find((x: any) =>
                    x.label.toLowerCase().includes('fake') ||
                    x.label.toLowerCase().includes('spoof')
                );

                let realScore = 0.5;
                if (realLabel) {
                    realScore = realLabel.score;
                } else if (fakeLabel) {
                    realScore = 1.0 - fakeLabel.score;
                }

                self.postMessage({
                    type: "RESULT",
                    score: realScore,
                    isReal: realScore > 0.5 // Threshold can be tuned
                });

            } catch (err) {
                 console.error("Inference error", err);
            }
        }
    }
};
