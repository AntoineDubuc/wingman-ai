/**
 * Transcript Collector
 *
 * Collects transcripts during a session for saving to Google Drive.
 * Uses Chrome Identity API - no backend required.
 */


export interface CollectedTranscript {
  timestamp: string;
  speaker: string;
  speaker_id: number;
  speaker_role: string;
  text: string;
  is_self: boolean;
  is_suggestion?: boolean;
  suggestion_type?: string;
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
   * Add an AI suggestion to the collection (unified timeline with speech)
   */
  addSuggestion(suggestion: {
    text: string;
    suggestion_type: string;
    timestamp: string;
  }): void {
    if (!this.session) return;

    this.session.transcripts.push({
      timestamp: suggestion.timestamp,
      speaker: 'Wingman AI',
      speaker_id: -1,
      speaker_role: 'assistant',
      text: suggestion.text,
      is_self: false,
      is_suggestion: true,
      suggestion_type: suggestion.suggestion_type,
    });

    this.session.suggestionsCount++;
    console.log(`[TranscriptCollector] Collected suggestion #${this.session.suggestionsCount}`);
  }

  /**
   * End the session and return the frozen session data.
   * The service worker handles Drive save and summary generation.
   */
  endSession(): SessionData | null {
    if (!this.session) {
      console.log('[TranscriptCollector] No active session to end');
      return null;
    }

    this.session.endTime = new Date();
    const sessionData = { ...this.session };

    // Clear session
    this.session = null;

    console.log(
      `[TranscriptCollector] Session ended: ${sessionData.transcripts.length} transcripts, ` +
      `${sessionData.suggestionsCount} suggestions`
    );

    return sessionData;
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
