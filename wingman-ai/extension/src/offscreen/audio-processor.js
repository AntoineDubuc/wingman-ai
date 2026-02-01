/**
 * Stereo AudioWorklet Processor for Offscreen Document
 *
 * Accepts 2-channel input from ChannelMergerNode:
 *   - Channel 0: Microphone (user)
 *   - Channel 1: Tab audio (other participants)
 *
 * Resamples each channel independently from device rate to 16kHz,
 * interleaves into stereo Int16 PCM, and posts to main thread.
 *
 * Output format: interleaved [ch0_s0, ch1_s0, ch0_s1, ch1_s1, ...]
 * Compatible with Deepgram multichannel=true&channels=2.
 */

class AudioProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();

    // Get source sample rate from options
    this.sourceSampleRate = options.processorOptions?.sampleRate || 48000;
    this.targetSampleRate = 16000;
    this.ratio = this.sourceSampleRate / this.targetSampleRate;

    // Separate buffers for each channel
    this.bufferSize = 4096; // Samples at source rate before flushing
    this.bufferCh0 = new Float32Array(this.bufferSize);
    this.bufferCh1 = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;

    this.chunkCount = 0;
  }

  /**
   * Resample from source rate to target rate using linear interpolation.
   * @param {Float32Array} inputData - Samples at source rate
   * @returns {Float32Array} - Samples at 16kHz
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
   * Process audio — called by the audio rendering thread (~every 128 frames).
   *
   * With ChannelMergerNode feeding this worklet:
   *   inputs[0][0] = channel 0 (mic) Float32 samples
   *   inputs[0][1] = channel 1 (tab) Float32 samples
   */
  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) {
      return true;
    }

    const ch0 = input[0]; // mic
    const ch1 = input.length > 1 ? input[1] : null; // tab
    const frameCount = ch0 ? ch0.length : 0;

    if (frameCount === 0) {
      return true;
    }

    // Append samples to per-channel buffers
    for (let i = 0; i < frameCount; i++) {
      this.bufferCh0[this.bufferIndex] = ch0 ? (ch0[i] || 0) : 0;
      this.bufferCh1[this.bufferIndex] = ch1 ? (ch1[i] || 0) : 0;
      this.bufferIndex++;

      // Flush when both buffers are full
      if (this.bufferIndex >= this.bufferSize) {
        this.flushBuffers();
        this.bufferIndex = 0;
      }
    }

    return true;
  }

  /**
   * Resample both channels, interleave, convert to Int16, and post.
   */
  flushBuffers() {
    // Take exactly bufferIndex samples from each channel
    const ch0Chunk = this.bufferCh0.slice(0, this.bufferIndex || this.bufferSize);
    const ch1Chunk = this.bufferCh1.slice(0, this.bufferIndex || this.bufferSize);

    // Resample each channel independently
    const ch0Resampled = this.resample(ch0Chunk);
    const ch1Resampled = this.resample(ch1Chunk);

    // Both channels should produce the same number of output samples
    const samplesPerChannel = Math.min(ch0Resampled.length, ch1Resampled.length);

    // Interleave: [ch0_s0, ch1_s0, ch0_s1, ch1_s1, ...]
    const interleaved = new Int16Array(samplesPerChannel * 2);

    for (let i = 0; i < samplesPerChannel; i++) {
      // Channel 0 (mic)
      const s0 = Math.max(-1, Math.min(1, ch0Resampled[i] || 0));
      interleaved[i * 2] = s0 < 0 ? s0 * 0x8000 : s0 * 0x7fff;

      // Channel 1 (tab)
      const s1 = Math.max(-1, Math.min(1, ch1Resampled[i] || 0));
      interleaved[i * 2 + 1] = s1 < 0 ? s1 * 0x8000 : s1 * 0x7fff;
    }

    this.chunkCount++;

    // Send interleaved stereo PCM to main thread
    this.port.postMessage({
      type: 'audio',
      audioData: Array.from(interleaved),
      chunkCount: this.chunkCount,
      samplesPerChannel: samplesPerChannel,
      timestamp: Date.now(),
    });
  }
}

// Register the processor
registerProcessor('audio-processor', AudioProcessor);
