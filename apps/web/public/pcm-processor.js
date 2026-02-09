class PCMProcessor extends AudioWorkletProcessor {
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input && input.length > 0) {
      // Input is usually [Float32Array(128)] or similar frame size
      // We send the first channel
      const channelData = input[0];
      if (channelData) {
          this.port.postMessage(channelData);
      }
    }
    return true; // Keep processor alive
  }
}

registerProcessor('pcm-processor', PCMProcessor);