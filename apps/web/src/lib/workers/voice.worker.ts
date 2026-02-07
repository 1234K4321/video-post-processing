/// <reference lib="webworker" />

// Voice Liveness Worker using Transformers.js
import { pipeline, env } from "@xenova/transformers";

// Skip local checks for models
env.allowLocalModels = false;
env.useBrowserCache = true;

let classifier: any = null;

const initialize = async () => {
    // Model selection: A lightweight audio classification model suitable for spoofing/deepfake detection
    // For this example, we'll use a generic audio classifier as placeholder for a specialized anti-spoofing model
    // In production, you would point to a specific finetuned model e.g., 'microsoft/wavlm-base-plus-sv' or a custom ONNX one
    try {
        // Using a small audio classification model to detect 'real' vs 'synthetic'
        // Ideally this should be a model trained on ASVspoof data
        classifier = await pipeline("audio-classification", "Xenova/ast-finetuned-audioset-10-10-0.4593", {
            device: 'webgpu',
        });
        self.postMessage({ type: "LOADED" });
    } catch (e) {
        console.error("Failed to load voice model", e);
        // Fallback to CPU if WebGPU fails
        try {
            classifier = await pipeline("audio-classification", "Xenova/ast-finetuned-audioset-10-10-0.4593", {
                device: 'cpu',
            });
            self.postMessage({ type: "LOADED" });
        } catch (e2) {
             console.error("Failed to load voice model on fallback", e2);
        }
    }
};

initialize();

self.onmessage = async (e) => {
    if (!classifier) return;

    const { audioData } = e.data; // Float32Array of audio

    try {
        // Run inference
        // Note: Real antispoofing needs raw waveform
        const output = await classifier(audioData);
        
        // This is a placeholder logic. Real ASV models return [bonafide, spoof] 
        // We simulate a score here for the sake of the infrastructure
        // Assume 'Speech' probability is a proxy for 'naturalness' in this generic model
        const speechScore = output.find((x: any) => x.label === "Speech")?.score || 0.5;

        self.postMessage({
            type: "RESULT",
            score: speechScore, // Higher means more likely real speech
            isReal: speechScore > 0.7 
        });

    } catch (err) {
        console.error("Voice worker error", err);
    }
};
