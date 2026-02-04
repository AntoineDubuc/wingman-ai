/**
 * DeepgramClient - Direct WebSocket client for Deepgram speech-to-text
 *
 * Connects directly to Deepgram's streaming API from the browser extension,
 * eliminating the need for a backend server. Users provide their own API key.
 */

// Deepgram WebSocket endpoint
const DEEPGRAM_WS_BASE = 'wss://api.deepgram.com/v1/listen';

// Connection parameters — stereo multichannel for dual-capture
const DEEPGRAM_PARAMS = {
  model: 'nova-3',
  language: 'en',
  punctuate: 'true',
  multichannel: 'true',
  channels: '2',
  interim_results: 'true',
  smart_format: 'true',
  encoding: 'linear16',
  sample_rate: '16000',
  endpointing: '700',
};

/**
 * Speaker roles identified through conversation analysis
 */
export type SpeakerRole = 'unknown' | 'customer' | 'consultant';

/**
 * Transcript data structure
 */
export interface Transcript {
  text: string;
  speaker: string;
  speaker_id: number;
  speaker_role: SpeakerRole;
  is_final: boolean;
  is_self: boolean;
  confidence: number;
  timestamp: string;
}

/**
 * Callback type for transcript events
 */
export type TranscriptCallback = (transcript: Transcript) => void;

/**
 * DeepgramClient class - manages WebSocket connection to Deepgram
 */
export class DeepgramClient {
  private socket: WebSocket | null = null;
  private isConnected = false;
  private onTranscriptCallback: TranscriptCallback | null = null;

  // Reconnection settings
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  // Audio buffering
  private audioBuffer: number[] = [];
  private bufferThreshold = 4096; // Send when buffer reaches this size

  // Connection state
  private apiKey: string | null = null;
  private connectionPromise: Promise<boolean> | null = null;

  // Per-channel text accumulation for endpointing-aware grouping.
  // Segments with is_final=true but speech_final=false are accumulated
  // and emitted as interims until speech_final=true arrives.
  private accumulatedSegments = new Map<number, string[]>();

  // Fallback flush timers: if speech_final never arrives (noisy environment,
  // echo cancellation off), force-flush accumulated segments after a timeout.
  private flushTimers = new Map<number, ReturnType<typeof setTimeout>>();
  private activeEndpointingMs = 700;

  /**
   * Set the callback for transcript events
   */
  setTranscriptCallback(callback: TranscriptCallback): void {
    this.onTranscriptCallback = callback;
  }

  /**
   * Connect to Deepgram WebSocket API
   */
  async connect(): Promise<boolean> {
    // Prevent multiple simultaneous connection attempts
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = this._connect();
    const result = await this.connectionPromise;
    this.connectionPromise = null;
    return result;
  }

  private async _connect(): Promise<boolean> {
    // Get API key and settings from storage
    try {
      const storage = await chrome.storage.local.get(['deepgramApiKey', 'endpointingMs']);
      this.apiKey = storage.deepgramApiKey;

      if (!this.apiKey) {
        console.error('[DeepgramClient] No API key configured');
        return false;
      }

      // Apply user-configured endpointing threshold
      let endpointingMs = storage.endpointingMs ?? '700';
      // Migrate stale default from pre-slider UI (was a dropdown defaulting to 5000)
      if (endpointingMs === '5000' && !storage.endpointingMs) {
        endpointingMs = '700';
      }
      DEEPGRAM_PARAMS.endpointing = endpointingMs;
      this.activeEndpointingMs = Number(endpointingMs) || 700;
      console.debug(`[DeepgramClient] Endpointing: ${endpointingMs}ms`);
    } catch (error) {
      console.error('[DeepgramClient] Failed to get API key:', error);
      return false;
    }

    // Already connected
    if (this.isConnected && this.socket?.readyState === WebSocket.OPEN) {
      return true;
    }

    // Build WebSocket URL with parameters and token
    const url = this.buildWebSocketUrl();

    return new Promise((resolve) => {
      try {
        console.debug('[DeepgramClient] Connecting...');
        // Use Sec-WebSocket-Protocol for auth (browser WebSocket can't set Authorization header)
        // Pass 'token' and the API key as subprotocols - Deepgram will use the key for auth
        this.socket = new WebSocket(url, ['token', this.apiKey!]);

        this.socket.onopen = () => {
          console.debug('[DeepgramClient] Connected');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.reconnectDelay = 1000;
          resolve(true);
        };

        this.socket.onmessage = (event) => {
          this.handleMessage(event);
        };

        this.socket.onerror = (error) => {
          console.error('[DeepgramClient] WebSocket error:', error);
        };

        this.socket.onclose = (event) => {
          console.log(`[DeepgramClient] Connection closed: ${event.code} ${event.reason}`);
          this.isConnected = false;

          // Attempt reconnection if not intentionally closed
          if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.scheduleReconnect();
          }
        };

        // Timeout for connection
        setTimeout(() => {
          if (!this.isConnected) {
            console.error('[DeepgramClient] Connection timeout');
            this.socket?.close();
            resolve(false);
          }
        }, 10000);
      } catch (error) {
        console.error('[DeepgramClient] Failed to create WebSocket:', error);
        resolve(false);
      }
    });
  }

  /**
   * Build the WebSocket URL with all parameters (no token - auth via Sec-WebSocket-Protocol)
   */
  private buildWebSocketUrl(): string {
    const params = new URLSearchParams();

    // Add Deepgram parameters
    Object.entries(DEEPGRAM_PARAMS).forEach(([key, value]) => {
      params.append(key, value);
    });

    // Token is passed via Sec-WebSocket-Protocol header, not URL
    return `${DEEPGRAM_WS_BASE}?${params.toString()}`;
  }

  /**
   * Handle incoming WebSocket message from Deepgram
   */
  private handleMessage(event: MessageEvent): void {
    try {
      const data = JSON.parse(event.data);

      // Handle transcript results
      if (data.type === 'Results') {
        // Results handled in processTranscriptResult
        this.processTranscriptResult(data);
      } else if (data.type === 'Metadata') {
        console.debug('[DeepgramClient] Received metadata:', data);
      } else if (data.type === 'UtteranceEnd') {
        console.debug('[DeepgramClient] Utterance end detected');
      } else if (data.type === 'SpeechStarted') {
        console.debug('[DeepgramClient] Speech started');
      } else if (data.type === 'Error') {
        console.error('[DeepgramClient] Deepgram error:', data);
      }
    } catch (error) {
      console.error('[DeepgramClient] Error parsing message:', error);
    }
  }

  /**
   * Process transcript result from Deepgram multichannel response.
   *
   * In multichannel mode, each Results message includes channel_index: [channelNum, totalChannels].
   * Channel 0 = mic (user), Channel 1 = tab (participants).
   *
   * Endpointing-aware grouping:
   * - is_final=true, speech_final=false → segment committed but speaker continues.
   *   Accumulated and emitted as interim so the overlay doesn't create a new bubble.
   * - is_final=true, speech_final=true  → speaker stopped (endpointing threshold met).
   *   All accumulated segments + this one emitted as a single final transcript.
   * - is_final=false → regular interim, prepended with any accumulated text.
   */
  private processTranscriptResult(data: Record<string, unknown>): void {
    try {
      const channel = data.channel as Record<string, unknown> | undefined;
      const alternatives = (channel?.alternatives as Array<Record<string, unknown>>) || [];

      const alternative = alternatives[0];
      if (!alternative) {
        console.log('[DeepgramClient] No alternatives in Results');
        return;
      }

      const transcriptText = alternative.transcript as string;

      const isFinal = (data.is_final as boolean) ?? false;
      const speechFinal = (data.speech_final as boolean) ?? false;

      // Determine channel from multichannel response
      const channelIndex = data.channel_index as number[] | undefined;
      const channelNum = channelIndex?.[0] ?? 0;

      // Deepgram may send speech_final=true with empty text to signal endpoint.
      // We must still flush accumulated segments, otherwise bubbles stay interim
      // forever and suggestions never trigger.
      if (!transcriptText) {
        if (isFinal && speechFinal) {
          this.clearFlushTimer(channelNum);
          const segments = this.accumulatedSegments.get(channelNum);
          if (segments && segments.length > 0) {
            this.accumulatedSegments.delete(channelNum);
            const fullText = segments.join(' ');
            const isSelf = channelNum === 0;
            const speaker = isSelf ? 'You' : 'Participant';
            console.log(
              `[DeepgramClient] Transcript: "${fullText}" (ch=${channelNum}, ${speaker}, speech_final=true empty-text flush, segments=${segments.length})`
            );
            this.onTranscriptCallback?.({
              text: fullText,
              speaker, speaker_id: channelNum, speaker_role: isSelf ? 'consultant' : 'customer',
              is_final: true, is_self: isSelf, confidence: 0, timestamp: new Date().toISOString(),
            });
          }
        }
        return;
      }

      // Deterministic speaker identification via channel index
      const isSelf = channelNum === 0;
      const speaker = isSelf ? 'You' : 'Participant';
      const speakerId = channelNum;
      const speakerRole: SpeakerRole = isSelf ? 'consultant' : 'customer';
      const confidence = (alternative.confidence as number) ?? 0;
      const timestamp = new Date().toISOString();

      if (isFinal && !speechFinal) {
        // Segment committed but speaker hasn't stopped — accumulate
        const segments = this.accumulatedSegments.get(channelNum) ?? [];
        segments.push(transcriptText);
        this.accumulatedSegments.set(channelNum, segments);

        // Start fallback flush timer (in case speech_final never arrives)
        this.startFlushTimer(channelNum, isSelf, speakerId, speakerRole);

        // Emit as interim so the overlay updates the existing bubble
        const fullText = segments.join(' ');
        // Accumulated segment, will log on speech_final
        this.onTranscriptCallback?.({
          text: fullText,
          speaker, speaker_id: speakerId, speaker_role: speakerRole,
          is_final: false, is_self: isSelf, confidence, timestamp,
        });
        return;
      }

      if (isFinal && speechFinal) {
        // Speaker truly stopped — flush accumulated segments + this one as final
        this.clearFlushTimer(channelNum);
        const segments = this.accumulatedSegments.get(channelNum) ?? [];
        segments.push(transcriptText);
        this.accumulatedSegments.delete(channelNum);

        const fullText = segments.join(' ');
        console.log(
          `[DeepgramClient] Transcript: "${fullText}" (ch=${channelNum}, ${speaker}, speech_final=true, segments=${segments.length})`
        );
        this.onTranscriptCallback?.({
          text: fullText,
          speaker, speaker_id: speakerId, speaker_role: speakerRole,
          is_final: true, is_self: isSelf, confidence, timestamp,
        });
        return;
      }

      // Regular interim — prepend any accumulated text
      const segments = this.accumulatedSegments.get(channelNum);
      const prefix = segments && segments.length > 0 ? segments.join(' ') + ' ' : '';
      const displayText = prefix + transcriptText;

      // Interim transcript, no log
      this.onTranscriptCallback?.({
        text: displayText,
        speaker, speaker_id: speakerId, speaker_role: speakerRole,
        is_final: false, is_self: isSelf, confidence, timestamp,
      });
    } catch (error) {
      console.error('[DeepgramClient] Error processing transcript:', error);
    }
  }

  /**
   * Start a fallback timer that force-flushes accumulated segments as final.
   * Covers noisy environments where speech_final never arrives.
   */
  private startFlushTimer(
    channelNum: number,
    isSelf: boolean,
    speakerId: number,
    speakerRole: SpeakerRole,
  ): void {
    this.clearFlushTimer(channelNum);
    const timeout = this.activeEndpointingMs + 1500;
    const timer = setTimeout(() => {
      this.flushTimers.delete(channelNum);
      const segments = this.accumulatedSegments.get(channelNum);
      if (segments && segments.length > 0) {
        this.accumulatedSegments.delete(channelNum);
        const fullText = segments.join(' ');
        const speaker = isSelf ? 'You' : 'Participant';
        console.log(
          `[DeepgramClient] Transcript: "${fullText}" (ch=${channelNum}, ${speaker}, fallback-flush after ${timeout}ms, segments=${segments.length})`
        );
        this.onTranscriptCallback?.({
          text: fullText,
          speaker, speaker_id: speakerId, speaker_role: speakerRole,
          is_final: true, is_self: isSelf, confidence: 0, timestamp: new Date().toISOString(),
        });
      }
    }, timeout);
    this.flushTimers.set(channelNum, timer);
  }

  private clearFlushTimer(channelNum: number): void {
    const timer = this.flushTimers.get(channelNum);
    if (timer) {
      clearTimeout(timer);
      this.flushTimers.delete(channelNum);
    }
  }

  /**
   * Send audio data to Deepgram
   */
  sendAudio(pcmData: number[]): void {
    if (!this.isConnected || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.warn('[DeepgramClient] Cannot send audio - not connected');
      return;
    }

    // Add to buffer
    this.audioBuffer.push(...pcmData);

    // Send if buffer is large enough
    if (this.audioBuffer.length >= this.bufferThreshold) {
      this.flushBuffer();
    }
  }

  /**
   * Flush audio buffer to Deepgram
   */
  private flushBuffer(): void {
    if (this.audioBuffer.length === 0) return;
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;

    try {
      // Convert Int16 array to ArrayBuffer
      const int16Array = new Int16Array(this.audioBuffer);
      this.socket.send(int16Array.buffer);
      this.audioBuffer = [];
    } catch (error) {
      console.error('[DeepgramClient] Error sending audio:', error);
    }
  }

  /**
   * Schedule a reconnection attempt
   */
  private scheduleReconnect(): void {
    this.reconnectAttempts += 1;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(
      `[DeepgramClient] Scheduling reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`
    );

    setTimeout(async () => {
      if (!this.isConnected) {
        await this.connect();
      }
    }, delay);
  }

  /**
   * Disconnect from Deepgram
   */
  async disconnect(): Promise<void> {
    console.debug('[DeepgramClient] Disconnecting...');

    // Flush remaining audio
    this.flushBuffer();

    // Close socket
    if (this.socket) {
      this.socket.onclose = null; // Prevent reconnection
      this.socket.close(1000, 'Client disconnect');
      this.socket = null;
    }

    this.isConnected = false;
    this.reconnectAttempts = this.maxReconnectAttempts; // Prevent auto-reconnect
    this.accumulatedSegments.clear();
    for (const timer of this.flushTimers.values()) clearTimeout(timer);
    this.flushTimers.clear();

    console.debug('[DeepgramClient] Disconnected');
  }

  /**
   * Check if connected to Deepgram
   */
  getIsConnected(): boolean {
    return this.isConnected && this.socket?.readyState === WebSocket.OPEN;
  }
}

// Export singleton instance
export const deepgramClient = new DeepgramClient();
