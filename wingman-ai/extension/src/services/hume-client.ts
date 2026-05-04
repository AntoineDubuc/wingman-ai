/**
 * HumeClient - WebSocket client for Hume AI Expression Measurement API
 *
 * Provides real-time emotion detection from speech prosody.
 * Runs in parallel with Deepgram transcription during calls.
 *
 * Key differences from Deepgram:
 * - OAuth token flow (API key + Secret → access token)
 * - Base64-encoded audio (not raw ArrayBuffer)
 * - Returns 48 emotions, which we simplify to 4 states
 */

import {
  HUME,
  STORAGE_KEYS,
  type EmotionState,
  type EmotionUpdate,
  type HumeEmotion,
} from '../shared/constants';

/** Callback type for emotion events */
export type EmotionCallback = (update: EmotionUpdate) => void;

/** Callback type for disconnection events */
export type DisconnectCallback = (reason: 'credits_exhausted' | 'connection_failed' | 'intentional') => void;

/** Hume API response structure */
interface HumeProsodyPrediction {
  time: { begin: number; end: number };
  emotions: HumeEmotion[];
}

interface HumeResponse {
  prosody?: { predictions: HumeProsodyPrediction[] };
  error?: string;  // Error is a string at top level, not an object
  code?: string;   // Error code is separate from error message
}

/**
 * Emotion groups for categorization
 * Maps 48 Hume emotions to 4 simplified states
 */
const EMOTION_GROUPS: Record<EmotionState, string[]> = {
  engaged: [
    'Interest',
    'Joy',
    'Excitement',
    'Amusement',
    'Satisfaction',
    'Pride',
    'Admiration',
    'Adoration',
    'Love',
    'Romance',
    'Desire',
    'Aesthetic Appreciation',
    'Entrancement',
  ],
  frustrated: [
    'Anger',
    'Frustration',
    'Annoyance',
    'Disgust',
    'Contempt',
    'Disappointment',
    'Distress',
    'Anxiety',
    'Fear',
    'Horror',
    'Pain',
    'Sadness',
  ],
  thinking: [
    'Concentration',
    'Contemplation',
    'Confusion',
    'Doubt',
    'Realization',
    'Surprise (positive)',
    'Surprise (negative)',
    'Awkwardness',
  ],
  neutral: [
    'Calmness',
    'Boredom',
    'Tiredness',
    'Nostalgia',
    'Relief',
    'Contentment',
  ],
};

/**
 * HumeClient class - manages WebSocket connection to Hume AI
 */
export class HumeClient {
  private socket: WebSocket | null = null;
  private isConnected = false;
  private onEmotionCallback: EmotionCallback | null = null;
  private onDisconnectCallback: DisconnectCallback | null = null;

  // Authentication (API key only - OAuth was unreliable)
  private apiKey: string | null = null;

  // Reconnection settings
  private reconnectAttempts = 0;
  private isIntentionalClose = false;

  // Audio buffering (100ms chunks at 16kHz = 1600 samples)
  private audioBuffer: number[] = [];

  // Emotion smoothing
  private emotionHistory: Array<{ emotions: HumeEmotion[]; timestamp: number }> = [];

  /**
   * Set the callback for emotion events
   */
  setEmotionCallback(callback: EmotionCallback): void {
    this.onEmotionCallback = callback;
  }

  /**
   * Set the callback for disconnection events
   */
  setDisconnectCallback(callback: DisconnectCallback): void {
    this.onDisconnectCallback = callback;
  }

  /**
   * Check if Hume is configured (API key present in storage)
   */
  static async isConfigured(): Promise<boolean> {
    try {
      const result = await chrome.storage.local.get([STORAGE_KEYS.HUME_API_KEY]);
      return !!result[STORAGE_KEYS.HUME_API_KEY];
    } catch {
      return false;
    }
  }

  /**
   * Connect to Hume AI WebSocket
   * Uses API key directly (OAuth was unreliable)
   */
  async connect(): Promise<boolean> {
    // Load API key from storage
    try {
      const result = await chrome.storage.local.get([STORAGE_KEYS.HUME_API_KEY]);
      this.apiKey = result[STORAGE_KEYS.HUME_API_KEY] || null;

      if (!this.apiKey) {
        console.debug('[HumeClient] No API key configured - emotion detection disabled');
        return false;
      }
    } catch (error) {
      console.error('[HumeClient] Failed to load API key:', error);
      return false;
    }

    // Connect WebSocket directly with API key
    return this.connectWebSocket();
  }

  /**
   * Connect to Hume WebSocket with API key
   * Uses apiKey query parameter directly (simpler than OAuth for browser WebSocket)
   */
  private connectWebSocket(): Promise<boolean> {
    if (!this.apiKey) return Promise.resolve(false);

    return new Promise((resolve) => {
      try {
        // Use API key directly as query param (OAuth access_token was being rejected)
        const url = `${HUME.WS_URL}?apiKey=${this.apiKey}`;
        console.debug('[HumeClient] Connecting to WebSocket...');

        this.socket = new WebSocket(url);
        this.isIntentionalClose = false;

        this.socket.onopen = () => {
          console.debug('[HumeClient] WebSocket connected');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          resolve(true);
        };

        this.socket.onmessage = (event) => {
          this.handleMessage(event);
        };

        this.socket.onerror = (error) => {
          console.error('[HumeClient] WebSocket error:', error);
        };

        this.socket.onclose = (event) => {
          console.log(`[HumeClient] WebSocket closed: ${event.code} ${event.reason}`);
          this.isConnected = false;

          // Attempt reconnection if not intentionally closed
          if (!this.isIntentionalClose && this.reconnectAttempts < HUME.MAX_RECONNECT_ATTEMPTS) {
            this.scheduleReconnect();
          } else if (!this.isIntentionalClose) {
            // All reconnection attempts exhausted
            console.warn('[HumeClient] Reconnection attempts exhausted, giving up');
            this.onDisconnectCallback?.('connection_failed');
          }
        };

        // Connection timeout
        setTimeout(() => {
          if (!this.isConnected) {
            console.error('[HumeClient] Connection timeout');
            this.socket?.close();
            resolve(false);
          }
        }, 10000);
      } catch (error) {
        console.error('[HumeClient] Failed to create WebSocket:', error);
        resolve(false);
      }
    });
  }

  /**
   * Handle incoming WebSocket message from Hume
   */
  private handleMessage(event: MessageEvent): void {
    try {
      const data: HumeResponse = JSON.parse(event.data);

      // Debug: log all responses to see what Hume returns
      console.debug('[HumeClient] Response:', JSON.stringify(data).slice(0, 500));

      // Handle errors (error is a string, code is separate)
      if (data.error) {
        console.error(`[HumeClient] API error ${data.code}: ${data.error}`);

        // Handle specific error codes
        if (data.code === 'E0300' || data.code === 'E0301') {
          // Out of credits - disable until session end
          console.warn('[HumeClient] Credits exhausted, disabling emotion detection');
          this.onDisconnectCallback?.('credits_exhausted');
          this.disconnect();
        }
        return;
      }

      // Process prosody predictions
      if (data.prosody?.predictions?.length) {
        const prediction = data.prosody.predictions[0];
        if (prediction) {
          // Log top 3 raw emotions with scores to debug thresholding
          const top3 = prediction.emotions
            .sort((a, b) => b.score - a.score)
            .slice(0, 3)
            .map(e => `${e.name}:${(e.score * 100).toFixed(1)}%`);
          console.log('[HumeClient] Raw emotions:', top3.join(', '));
          this.processEmotions(prediction.emotions);
        }
      } else {
        console.debug('[HumeClient] No prosody predictions in response');
      }
    } catch (error) {
      console.error('[HumeClient] Error parsing message:', error);
    }
  }

  /**
   * Process emotions from Hume and emit categorized result
   */
  private processEmotions(emotions: HumeEmotion[]): void {
    // Add to history for smoothing
    this.emotionHistory.push({
      emotions,
      timestamp: Date.now(),
    });

    // Remove old entries outside smoothing window
    const cutoff = Date.now() - HUME.SMOOTHING_WINDOW_MS;
    this.emotionHistory = this.emotionHistory.filter((entry) => entry.timestamp > cutoff);

    // Calculate smoothed emotions
    const smoothed = this.calculateSmoothedEmotions();
    if (!smoothed) return;

    // Categorize to simplified state
    const state = this.categorizeEmotions(smoothed);
    const topEmotions = smoothed.slice(0, 5);
    const confidence = topEmotions[0]?.score ?? 0;

    // Emit update
    const update: EmotionUpdate = {
      state,
      confidence,
      topEmotions,
      timestamp: Date.now(),
    };

    console.debug(`[HumeClient] Emotion: ${state} (${(confidence * 100).toFixed(0)}%)`, topEmotions.slice(0, 3));
    this.onEmotionCallback?.(update);
  }

  /**
   * Calculate smoothed emotions from history
   */
  private calculateSmoothedEmotions(): HumeEmotion[] | null {
    if (this.emotionHistory.length === 0) return null;

    // Aggregate scores by emotion name
    const scoreMap = new Map<string, number[]>();

    for (const entry of this.emotionHistory) {
      for (const emotion of entry.emotions) {
        const scores = scoreMap.get(emotion.name) ?? [];
        scores.push(emotion.score);
        scoreMap.set(emotion.name, scores);
      }
    }

    // Calculate average for each emotion
    const averaged: HumeEmotion[] = [];
    for (const [name, scores] of scoreMap) {
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      if (avg >= HUME.MIN_EMOTION_SCORE) {
        averaged.push({ name, score: avg });
      }
    }

    // Sort by score descending
    averaged.sort((a, b) => b.score - a.score);
    return averaged;
  }

  /**
   * Categorize smoothed emotions to one of 4 states
   */
  private categorizeEmotions(emotions: HumeEmotion[]): EmotionState {
    // Calculate aggregate score for each category
    const categoryScores: Record<EmotionState, number> = {
      engaged: 0,
      frustrated: 0,
      thinking: 0,
      neutral: 0,
    };

    for (const emotion of emotions) {
      for (const [state, emotionNames] of Object.entries(EMOTION_GROUPS)) {
        if (emotionNames.includes(emotion.name)) {
          categoryScores[state as EmotionState] += emotion.score;
          break;
        }
      }
    }

    // Find highest scoring category
    let maxState: EmotionState = 'neutral';
    let maxScore = 0;

    for (const [state, score] of Object.entries(categoryScores)) {
      if (score > maxScore) {
        maxScore = score;
        maxState = state as EmotionState;
      }
    }

    // Default to neutral if no strong signal
    if (maxScore < HUME.MIN_EMOTION_SCORE) {
      return 'neutral';
    }

    return maxState;
  }

  /**
   * Send audio data to Hume
   * @param pcmData - Int16 PCM samples (same format as Deepgram receives)
   */
  sendAudio(pcmData: number[]): void {
    // Skip if not connected (graceful no-op)
    if (!this.isConnected || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
      // Log occasionally to debug connection state
      if (Math.random() < 0.01) {
        console.debug(`[HumeClient] sendAudio skipped: connected=${this.isConnected}, socket=${!!this.socket}, readyState=${this.socket?.readyState}`);
      }
      return;
    }

    // Add to buffer
    this.audioBuffer.push(...pcmData);

    // Send when buffer reaches threshold (100ms of audio)
    if (this.audioBuffer.length >= HUME.AUDIO_BUFFER_SAMPLES) {
      this.flushBuffer();
    }
  }

  /**
   * Flush audio buffer to Hume
   */
  private flushBuffer(): void {
    if (this.audioBuffer.length === 0) return;
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;

    try {
      // Convert to Int16Array and wrap in WAV format
      // Hume needs WAV headers to identify the audio format
      const int16Array = new Int16Array(this.audioBuffer);
      const wavBuffer = this.createWavBuffer(int16Array);
      const base64 = this.arrayBufferToBase64(wavBuffer);

      // Send to Hume with prosody model enabled
      // Only 'models' and 'data' are accepted by Expression Measurement API
      const message = JSON.stringify({
        models: {
          prosody: {},
        },
        data: base64,
      });

      console.debug(`[HumeClient] Sending ${int16Array.length} samples (${(int16Array.length / 16000 * 1000).toFixed(0)}ms) as WAV`);
      this.socket.send(message);
      this.audioBuffer = [];
    } catch (error) {
      console.error('[HumeClient] Error sending audio:', error);
    }
  }

  /**
   * Convert ArrayBuffer to base64 string
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      const byte = bytes[i];
      if (byte !== undefined) {
        binary += String.fromCharCode(byte);
      }
    }
    return btoa(binary);
  }

  /**
   * Create WAV header for PCM data
   * WAV = 44-byte header + raw PCM. Hume needs headers to identify the format.
   */
  private createWavBuffer(pcmData: Int16Array): ArrayBuffer {
    const sampleRate = 16000;
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = pcmData.length * 2; // 2 bytes per sample
    const headerSize = 44;

    const buffer = new ArrayBuffer(headerSize + dataSize);
    const view = new DataView(buffer);

    // RIFF header
    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true); // File size - 8
    this.writeString(view, 8, 'WAVE');

    // fmt chunk
    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // Subchunk1 size (16 for PCM)
    view.setUint16(20, 1, true); // Audio format (1 = PCM)
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);

    // data chunk
    this.writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    // Write PCM samples
    const pcmView = new Int16Array(buffer, headerSize);
    pcmView.set(pcmData);

    return buffer;
  }

  /**
   * Write ASCII string to DataView
   */
  private writeString(view: DataView, offset: number, str: string): void {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  /**
   * Schedule a reconnection attempt
   */
  private scheduleReconnect(): void {
    this.reconnectAttempts += 1;
    const delay = HUME.RECONNECT_BASE_DELAY_MS * Math.pow(2, this.reconnectAttempts - 1);

    console.log(
      `[HumeClient] Scheduling reconnect attempt ${this.reconnectAttempts}/${HUME.MAX_RECONNECT_ATTEMPTS} in ${delay}ms`
    );

    setTimeout(async () => {
      if (!this.isConnected && !this.isIntentionalClose) {
        await this.connectWebSocket();
      }
    }, delay);
  }

  /**
   * Disconnect from Hume
   */
  async disconnect(): Promise<void> {
    console.debug('[HumeClient] Disconnecting...');

    this.isIntentionalClose = true;

    // Flush remaining audio
    this.flushBuffer();

    // Close socket
    if (this.socket) {
      this.socket.onclose = null; // Prevent reconnection
      this.socket.close(1000, 'Client disconnect');
      this.socket = null;
    }

    this.isConnected = false;
    this.audioBuffer = [];
    this.emotionHistory = [];
    this.reconnectAttempts = HUME.MAX_RECONNECT_ATTEMPTS; // Prevent auto-reconnect

    console.debug('[HumeClient] Disconnected');
  }

  /**
   * Check if connected to Hume
   */
  getIsConnected(): boolean {
    return this.isConnected && this.socket?.readyState === WebSocket.OPEN;
  }

  /**
   * Test Hume API key (for options page)
   * Tests against REST endpoint to verify key is valid
   */
  static async testCredentials(apiKey: string, _secretKey?: string): Promise<{ valid: boolean; error?: string }> {
    try {
      // Test API key against batch jobs endpoint (returns [] if valid)
      const response = await fetch('https://api.hume.ai/v0/batch/jobs', {
        method: 'GET',
        headers: {
          'X-Hume-Api-Key': apiKey,
        },
      });

      if (response.ok) {
        return { valid: true };
      }

      if (response.status === 401 || response.status === 403) {
        return { valid: false, error: 'Invalid API key' };
      }

      const errorText = await response.text();
      return { valid: false, error: `Error ${response.status}: ${errorText}` };
    } catch (error) {
      return { valid: false, error: `Network error: ${error}` };
    }
  }
}

// Export singleton instance
export const humeClient = new HumeClient();
