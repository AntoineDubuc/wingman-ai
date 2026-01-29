/**
 * Transcript Collector
 *
 * Collects transcripts during a session for saving to Google Drive.
 * Uses Chrome Identity API - no backend required.
 */

import { driveService, TranscriptData, SessionMetadata } from './drive-service';

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
        'driveFolderName',
        'transcriptFormat',
      ]);

      if (!storage.driveAutosaveEnabled) {
        console.log('[TranscriptCollector] Auto-save disabled');
        return { saved: false, error: 'Auto-save disabled' };
      }

      if (!storage.driveConnected) {
        console.log('[TranscriptCollector] Drive not connected');
        return { saved: false, error: 'Google Drive not connected' };
      }

      // Convert transcripts to Drive service format
      const transcripts: TranscriptData[] = sessionData.transcripts.map((t) => ({
        timestamp: t.timestamp,
        speaker: t.speaker,
        speaker_id: t.speaker_id,
        speaker_role: t.speaker_role,
        text: t.text,
        is_self: t.is_self,
      }));

      // Build metadata
      const endTime = sessionData.endTime || new Date();
      const durationSeconds = Math.round((endTime.getTime() - sessionData.startTime.getTime()) / 1000);
      const speakerIds = new Set(sessionData.transcripts.map((t) => t.speaker_id));

      const metadata: SessionMetadata = {
        startTime: sessionData.startTime,
        endTime,
        durationSeconds,
        speakersCount: speakerIds.size,
        transcriptsCount: sessionData.transcripts.length,
        suggestionsCount: sessionData.suggestionsCount,
        speakerFilterEnabled: sessionData.speakerFilterEnabled,
      };

      // Save to Drive using Chrome Identity API
      const result = await driveService.saveTranscript(
        transcripts,
        metadata,
        storage.driveFolderName || 'Tammy Transcripts',
        storage.transcriptFormat || 'markdown'
      );

      if (result.success) {
        console.log('[TranscriptCollector] Saved to Drive:', result.fileUrl);
        return { saved: true, fileUrl: result.fileUrl };
      } else {
        console.error('[TranscriptCollector] Save failed:', result.error);
        return { saved: false, error: result.error };
      }
    } catch (error) {
      console.error('[TranscriptCollector] Error ending session:', error);
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
