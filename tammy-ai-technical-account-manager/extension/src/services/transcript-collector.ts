/**
 * Transcript Collector
 *
 * Collects transcripts during a session for saving to Google Drive.
 * Handles auto-save when session ends.
 */

export interface CollectedTranscript {
  timestamp: string;
  speaker: string;
  speaker_id: number;
  speaker_role: string;
  text: string;
  is_self: boolean;
}

export interface SessionData {
  startTime: Date;
  endTime?: Date;
  transcripts: CollectedTranscript[];
  suggestionsCount: number;
  speakerFilterEnabled: boolean;
}

class TranscriptCollector {
  private session: SessionData | null = null;
  private backendUrl: string = 'http://localhost:8000';

  /**
   * Start a new collection session
   */
  startSession(speakerFilterEnabled: boolean = false): void {
    this.session = {
      startTime: new Date(),
      transcripts: [],
      suggestionsCount: 0,
      speakerFilterEnabled,
    };
    console.log('[TranscriptCollector] Session started');
  }

  /**
   * Add a transcript to the collection
   */
  addTranscript(transcript: {
    text: string;
    speaker: string;
    speaker_id: number;
    speaker_role: string;
    is_final: boolean;
    timestamp: string;
    is_self?: boolean;
  }): void {
    if (!this.session || !transcript.is_final) return;

    // Only collect final transcripts
    this.session.transcripts.push({
      timestamp: transcript.timestamp,
      speaker: transcript.speaker,
      speaker_id: transcript.speaker_id,
      speaker_role: transcript.speaker_role,
      text: transcript.text,
      is_self: transcript.is_self ?? false,
    });

    console.log(`[TranscriptCollector] Collected transcript #${this.session.transcripts.length}`);
  }

  /**
   * Increment suggestion counter
   */
  incrementSuggestions(): void {
    if (this.session) {
      this.session.suggestionsCount++;
    }
  }

  /**
   * End the session and trigger auto-save if enabled
   */
  async endSession(): Promise<{ saved: boolean; fileUrl?: string; error?: string }> {
    if (!this.session) {
      return { saved: false, error: 'No active session' };
    }

    this.session.endTime = new Date();
    const sessionData = { ...this.session };

    // Clear session
    this.session = null;

    // Check if we have transcripts to save
    if (sessionData.transcripts.length === 0) {
      console.log('[TranscriptCollector] No transcripts to save');
      return { saved: false, error: 'No transcripts collected' };
    }

    // Check if auto-save is enabled and Drive is connected
    try {
      const storage = await chrome.storage.local.get([
        'driveAutosaveEnabled',
        'driveConnected',
        'driveAccessToken',
        'driveFolderName',
        'transcriptFormat',
        'backendUrl',
      ]);

      this.backendUrl = storage.backendUrl?.replace('ws://', 'http://').replace('/ws/session', '') || 'http://localhost:8000';

      if (!storage.driveAutosaveEnabled) {
        console.log('[TranscriptCollector] Auto-save disabled');
        return { saved: false, error: 'Auto-save disabled' };
      }

      if (!storage.driveConnected || !storage.driveAccessToken) {
        console.log('[TranscriptCollector] Drive not connected');
        return { saved: false, error: 'Google Drive not connected' };
      }

      // Save to Drive
      const result = await this.saveToBackend({
        accessToken: storage.driveAccessToken,
        folderName: storage.driveFolderName || 'Tammy Transcripts',
        fileFormat: storage.transcriptFormat || 'markdown',
        sessionData,
      });

      return result;
    } catch (error) {
      console.error('[TranscriptCollector] Error ending session:', error);
      return { saved: false, error: String(error) };
    }
  }

  /**
   * Save transcript to backend for Drive upload
   */
  private async saveToBackend(options: {
    accessToken: string;
    folderName: string;
    fileFormat: string;
    sessionData: SessionData;
  }): Promise<{ saved: boolean; fileUrl?: string; error?: string }> {
    try {
      const response = await fetch(`${this.backendUrl}/api/transcripts/save-drive`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          access_token: options.accessToken,
          folder_name: options.folderName,
          file_format: options.fileFormat,
          transcripts: options.sessionData.transcripts,
          start_time: options.sessionData.startTime.toISOString(),
          end_time: options.sessionData.endTime?.toISOString() || new Date().toISOString(),
          suggestions_count: options.sessionData.suggestionsCount,
          speaker_filter_enabled: options.sessionData.speakerFilterEnabled,
        }),
      });

      const result = await response.json();

      if (result.success) {
        console.log('[TranscriptCollector] Saved to Drive:', result.file_url);
        return { saved: true, fileUrl: result.file_url };
      } else {
        console.error('[TranscriptCollector] Save failed:', result.error);
        return { saved: false, error: result.error };
      }
    } catch (error) {
      console.error('[TranscriptCollector] API error:', error);
      return { saved: false, error: String(error) };
    }
  }

  /**
   * Get current session stats
   */
  getStats(): { transcriptCount: number; suggestionsCount: number } | null {
    if (!this.session) return null;
    return {
      transcriptCount: this.session.transcripts.length,
      suggestionsCount: this.session.suggestionsCount,
    };
  }

  /**
   * Check if a session is active
   */
  hasActiveSession(): boolean {
    return this.session !== null;
  }
}

// Export singleton instance
export const transcriptCollector = new TranscriptCollector();
