/**
 * AudioWorklet Processor
 *
 * Processes audio in a separate thread for low-latency capture.
 * Converts Float32 audio samples to Int16 PCM format suitable for Deepgram.
 */

class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 4096; // ~256ms at 16kHz
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
  }

  /**
   * Process audio samples
   * @param {Float32Array[][]} inputs - Input audio channels
   * @param {Float32Array[][]} outputs - Output audio channels (unused)
   * @param {Object} parameters - Audio parameters (unused)
   * @returns {boolean} - Return true to keep processor alive
   */
  process(inputs, outputs, parameters) {
    const input = inputs[0];

    // Check if we have input
    if (!input || !input[0]) {
      return true;
    }

    const inputChannel = input[0];

    // Add samples to buffer
    for (let i = 0; i < inputChannel.length; i++) {
      this.buffer[this.bufferIndex++] = inputChannel[i];

      // When buffer is full, send it
      if (this.bufferIndex >= this.bufferSize) {
        this.sendBuffer();
        this.bufferIndex = 0;
      }
    }

    // Return true to keep the processor alive
    return true;
  }

  /**
   * Convert buffer to Int16 PCM and send to main thread
   */
  sendBuffer() {
    // Convert Float32 (-1 to 1) to Int16 (-32768 to 32767)
    const pcmData = new Int16Array(this.bufferSize);

    for (let i = 0; i < this.bufferSize; i++) {
      // Clamp to valid range
      const sample = Math.max(-1, Math.min(1, this.buffer[i]));
      // Convert to Int16
      pcmData[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }

    // Send to main thread
    this.port.postMessage({
      type: 'audio',
      audioData: Array.from(pcmData),
      sampleRate: 16000,
      timestamp: Date.now(),
    });
  }
}

// Register the processor
registerProcessor('audio-processor', AudioProcessor);
