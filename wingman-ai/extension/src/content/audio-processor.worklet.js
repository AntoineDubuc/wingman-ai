/**
 * AudioWorklet Processor for real-time audio capture
 *
 * Runs in the audio rendering thread for low-latency processing.
 * Handles resampling from device sample rate to 16kHz and conversion to Int16 PCM.
 */

class AudioProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();

    // Get source sample rate from options
    this.sourceSampleRate = options.processorOptions?.sampleRate || 48000;
    this.targetSampleRate = 16000;
    this.ratio = this.sourceSampleRate / this.targetSampleRate;

    // Buffer to accumulate samples before sending
    this.buffer = new Float32Array(0);
    this.bufferSize = 4096; // Samples at source rate before sending

    this.chunkCount = 0;
  }

  /**
   * Resample from source rate to target rate using linear interpolation
   */
  resample(inputData) {
    if (this.sourceSampleRate === this.targetSampleRate) {
      return inputData;
    }

    const outputLength = Math.floor(inputData.length / this.ratio);
    const output = new Float32Array(outputLength);

    for (let i = 0; i < outputLength; i++) {
      const srcIndex = i * this.ratio;
      const srcIndexFloor = Math.floor(srcIndex);
      const srcIndexCeil = Math.min(srcIndexFloor + 1, inputData.length - 1);
      const fraction = srcIndex - srcIndexFloor;

      // Linear interpolation
      const sample1 = inputData[srcIndexFloor] || 0;
      const sample2 = inputData[srcIndexCeil] || 0;
      output[i] = sample1 + fraction * (sample2 - sample1);
    }

    return output;
  }

  /**
   * Process audio - called by the audio rendering thread
   * @param {Float32Array[][]} inputs - Input audio data
   * @param {Float32Array[][]} outputs - Output audio data (unused)
   * @param {Object} parameters - Audio parameters (unused)
   * @returns {boolean} - true to keep processor alive
   */
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || input.length === 0) {
      return true;
    }

    // Get audio data - mix channels to mono if stereo
    const channel0 = input[0];
    const channel1 = input.length > 1 ? input[1] : channel0;

    if (!channel0 || channel0.length === 0) {
      return true;
    }

    // Mix stereo to mono
    const monoData = new Float32Array(channel0.length);
    for (let i = 0; i < channel0.length; i++) {
      monoData[i] = ((channel0[i] || 0) + (channel1[i] || 0)) / 2;
    }

    // Append to buffer
    const newBuffer = new Float32Array(this.buffer.length + monoData.length);
    newBuffer.set(this.buffer);
    newBuffer.set(monoData, this.buffer.length);
    this.buffer = newBuffer;

    // Process when we have enough samples
    if (this.buffer.length >= this.bufferSize) {
      // Take bufferSize samples
      const chunk = this.buffer.slice(0, this.bufferSize);
      this.buffer = this.buffer.slice(this.bufferSize);

      // Calculate max amplitude for debugging
      let maxAmp = 0;
      for (let i = 0; i < chunk.length; i++) {
        maxAmp = Math.max(maxAmp, Math.abs(chunk[i]));
      }

      // Resample to 16kHz
      const resampled = this.resample(chunk);

      // Convert to Int16 PCM
      const pcmData = new Int16Array(resampled.length);
      for (let i = 0; i < resampled.length; i++) {
        const sample = Math.max(-1, Math.min(1, resampled[i] || 0));
        pcmData[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      }

      this.chunkCount++;

      // Send to main thread
      this.port.postMessage({
        type: 'audio',
        pcmData: pcmData,
        chunkCount: this.chunkCount,
        maxAmplitude: maxAmp,
        timestamp: Date.now()
      });
    }

    return true;
  }
}

registerProcessor('audio-processor', AudioProcessor);
