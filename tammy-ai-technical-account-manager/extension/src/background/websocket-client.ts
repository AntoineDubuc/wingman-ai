/**
 * WebSocket Client for Backend Communication
 *
 * Handles bidirectional communication with the backend:
 * - Sends audio chunks for transcription
 * - Receives transcripts and AI suggestions
 * - Manages connection lifecycle with auto-reconnection
 */

export interface WSMessage {
  type: string;
  data?: unknown;
  timestamp?: number;
}

export interface TranscriptMessage {
  type: 'transcript';
  text: string;
  speaker: string;
  is_final: boolean;
}

export interface SuggestionMessage {
  type: 'suggestion';
  question: string;
  response: string;
  confidence: number;
}

export class WebSocketClient {
  private socket: WebSocket | null = null;
  private url: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private baseReconnectDelay = 1000;
  private messageQueue: WSMessage[] = [];

  public isConnected = false;

  constructor(url: string) {
    this.url = url;
  }

  /**
   * Connect to the WebSocket server
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.socket = new WebSocket(this.url);

        this.socket.onopen = () => {
          console.log('[WebSocket] Connected to', this.url);
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.flushMessageQueue();
          this.broadcastStatus('connected');
          resolve();
        };

        this.socket.onclose = (event) => {
          console.log('[WebSocket] Disconnected:', event.code, event.reason);
          this.isConnected = false;
          this.broadcastStatus('disconnected');

          if (!event.wasClean && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.scheduleReconnect();
          }
        };

        this.socket.onerror = (error) => {
          console.error('[WebSocket] Error:', error);
          reject(error);
        };

        this.socket.onmessage = (event) => {
          this.handleMessage(event.data);
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Disconnect from the server
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.close(1000, 'Client disconnecting');
      this.socket = null;
    }
    this.isConnected = false;
  }

  /**
   * Send audio chunk to backend
   */
  sendAudioChunk(audioData: ArrayBuffer | number[]): void {
    if (!this.isConnected || !this.socket) {
      return;
    }

    const message: WSMessage = {
      type: 'audio_chunk',
      data: Array.isArray(audioData) ? audioData : Array.from(new Uint8Array(audioData)),
      timestamp: Date.now(),
    };

    this.socket.send(JSON.stringify(message));
  }

  /**
   * Handle incoming message from server
   */
  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data) as WSMessage;
      console.log('[WebSocket] Received:', message.type);

      switch (message.type) {
        case 'transcript':
          // Backend sends data at top level, not nested in 'data' property
          this.notifyContentScript('transcript', message);
          break;

        case 'suggestion':
          // Backend sends data at top level, not nested in 'data' property
          this.notifyContentScript('suggestion', message);
          break;

        case 'error':
          console.error('[WebSocket] Server error:', message.data);
          break;

        case 'ping':
          this.socket?.send(JSON.stringify({ type: 'pong' }));
          break;

        case 'status':
          // Initial connection status from backend - just log it
          console.log('[WebSocket] Server status:', message);
          break;

        default:
          console.warn('[WebSocket] Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('[WebSocket] Failed to parse message:', error);
    }
  }

  /**
   * Forward message to content script
   */
  private async notifyContentScript(type: string, data: unknown): Promise<void> {
    // Query for ANY Meet tab, not just active (may be looking at DevTools)
    const tabs = await chrome.tabs.query({
      url: 'https://meet.google.com/*',
    });

    if (tabs.length > 0) {
      // Send to all Meet tabs (usually just one)
      for (const tab of tabs) {
        if (tab.id) {
          console.log(`[WebSocket] Forwarding ${type} to tab ${tab.id}`);
          chrome.tabs.sendMessage(tab.id, { type, data }).catch((err) => {
            console.warn(`[WebSocket] Failed to send to tab ${tab.id}:`, err);
          });
        }
      }
    } else {
      console.warn('[WebSocket] No Meet tabs found to forward message');
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    const delay = this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts);
    const jitter = Math.random() * 1000;

    console.log(`[WebSocket] Reconnecting in ${delay + jitter}ms (attempt ${this.reconnectAttempts + 1})`);

    setTimeout(() => {
      this.reconnectAttempts++;
      this.connect().catch((error) => {
        console.error('[WebSocket] Reconnection failed:', error);
      });
    }, delay + jitter);
  }

  /**
   * Flush queued messages after reconnection
   */
  private flushMessageQueue(): void {
    while (this.messageQueue.length > 0 && this.socket) {
      const message = this.messageQueue.shift();
      if (message) {
        this.socket.send(JSON.stringify(message));
      }
    }
  }

  /**
   * Broadcast connection status
   */
  private broadcastStatus(status: string): void {
    chrome.runtime.sendMessage({ type: 'WS_STATUS', status });
    chrome.storage.local.set({ wsStatus: status });
  }
}
