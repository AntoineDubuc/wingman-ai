/**
 * Google Drive Service
 *
 * Handles Google Drive operations using Chrome Identity API.
 * No backend required - calls Drive API directly from extension.
 */

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

export interface DriveAuthResult {
  success: boolean;
  email?: string;
  error?: string;
}

export interface DriveSaveResult {
  success: boolean;
  fileUrl?: string;
  error?: string;
}

export interface TranscriptData {
  timestamp: string;
  speaker: string;
  speaker_id: number;
  speaker_role: string;
  text: string;
  is_self: boolean;
}

export interface SessionMetadata {
  startTime: Date;
  endTime: Date;
  durationSeconds: number;
  speakersCount: number;
  transcriptsCount: number;
  suggestionsCount: number;
  speakerFilterEnabled: boolean;
}

class DriveService {
  /**
   * Check if user is connected to Google Drive
   */
  async isConnected(): Promise<boolean> {
    try {
      const result = await chrome.storage.local.get(['driveConnected']);
      return result.driveConnected === true;
    } catch {
      return false;
    }
  }

  /**
   * Get the user's email if connected
   */
  async getConnectedEmail(): Promise<string | null> {
    try {
      const result = await chrome.storage.local.get(['driveAccountEmail']);
      return result.driveAccountEmail || null;
    } catch {
      return null;
    }
  }

  /**
   * Connect to Google Drive using Chrome Identity API
   */
  async connect(): Promise<DriveAuthResult> {
    try {
      // Request OAuth token using Chrome's identity API
      const token = await this.getAuthToken(true);
      if (!token) {
        return { success: false, error: 'Failed to get authorization' };
      }

      // Get user info to display email
      const userInfo = await this.getUserInfo(token);
      if (!userInfo.email) {
        return { success: false, error: 'Failed to get user info' };
      }

      // Store connection state
      await chrome.storage.local.set({
        driveConnected: true,
        driveAccountEmail: userInfo.email,
      });

      console.log('[DriveService] Connected as:', userInfo.email);
      return { success: true, email: userInfo.email };
    } catch (error) {
      console.error('[DriveService] Connection failed:', error);
      return { success: false, error: String(error) };
    }
  }

  /**
   * Disconnect from Google Drive
   */
  async disconnect(): Promise<void> {
    try {
      // Revoke the token
      const token = await this.getAuthToken(false);
      if (token) {
        await this.revokeToken(token);
      }

      // Clear stored state
      await chrome.storage.local.set({
        driveConnected: false,
        driveAccountEmail: null,
      });

      // Clear Chrome's cached token
      if (token) {
        await chrome.identity.removeCachedAuthToken({ token });
      }

      console.log('[DriveService] Disconnected');
    } catch (error) {
      console.error('[DriveService] Disconnect error:', error);
      // Still clear local state even if revoke fails
      await chrome.storage.local.set({
        driveConnected: false,
        driveAccountEmail: null,
      });
    }
  }

  /**
   * Save transcript to Google Drive
   */
  async saveTranscript(
    transcripts: TranscriptData[],
    metadata: SessionMetadata,
    folderName: string = 'Wingman Transcripts',
    fileFormat: string = 'markdown'
  ): Promise<DriveSaveResult> {
    try {
      // Get auth token
      const token = await this.getAuthToken(false);
      if (!token) {
        return { success: false, error: 'Not authenticated with Google Drive' };
      }

      // Find or create folder
      const folderId = await this.findOrCreateFolder(token, folderName);
      if (!folderId) {
        return { success: false, error: 'Failed to access Drive folder' };
      }

      // Generate file content
      const { filename, content, mimeType } = this.formatTranscript(
        transcripts,
        metadata,
        fileFormat
      );

      // Upload file
      const fileUrl = await this.uploadFile(token, folderId, filename, content, mimeType);
      if (!fileUrl) {
        return { success: false, error: 'Failed to upload file' };
      }

      console.log('[DriveService] Saved transcript:', fileUrl);
      return { success: true, fileUrl };
    } catch (error) {
      console.error('[DriveService] Save failed:', error);

      // Check if token expired and retry once
      if (String(error).includes('401')) {
        try {
          // Clear cached token and try again
          const oldToken = await this.getAuthToken(false);
          if (oldToken) {
            await chrome.identity.removeCachedAuthToken({ token: oldToken });
          }
          // Retry with fresh token
          return this.saveTranscript(transcripts, metadata, folderName, fileFormat);
        } catch {
          return { success: false, error: 'Authentication expired. Please reconnect Google Drive.' };
        }
      }

      return { success: false, error: String(error) };
    }
  }

  /**
   * Get OAuth token from Chrome Identity API
   */
  private async getAuthToken(interactive: boolean): Promise<string | null> {
    return new Promise((resolve) => {
      chrome.identity.getAuthToken({ interactive }, (token) => {
        if (chrome.runtime.lastError) {
          console.error('[DriveService] Auth error:', chrome.runtime.lastError.message);
          resolve(null);
        } else {
          resolve(token || null);
        }
      });
    });
  }

  /**
   * Revoke OAuth token
   */
  private async revokeToken(token: string): Promise<void> {
    try {
      await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`);
    } catch (error) {
      console.error('[DriveService] Token revoke error:', error);
    }
  }

  /**
   * Get user info from Google
   */
  private async getUserInfo(token: string): Promise<{ email?: string }> {
    const response = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      throw new Error('Failed to get user info');
    }

    return response.json();
  }

  /**
   * Find or create a folder in Google Drive
   */
  private async findOrCreateFolder(token: string, folderName: string): Promise<string | null> {
    // Search for existing folder
    const query = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const searchUrl = `${DRIVE_API_BASE}/files?q=${encodeURIComponent(query)}&spaces=drive&pageSize=1`;

    const searchResponse = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (searchResponse.ok) {
      const data = await searchResponse.json();
      if (data.files && data.files.length > 0) {
        return data.files[0].id;
      }
    }

    // Create new folder
    const createResponse = await fetch(`${DRIVE_API_BASE}/files`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
      }),
    });

    if (createResponse.ok) {
      const folder = await createResponse.json();
      return folder.id;
    }

    return null;
  }

  /**
   * Upload file to Google Drive
   */
  private async uploadFile(
    token: string,
    folderId: string,
    filename: string,
    content: string,
    mimeType: string
  ): Promise<string | null> {
    // Use multipart upload
    const metadata = {
      name: filename,
      parents: [folderId],
    };

    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const body =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      `Content-Type: ${mimeType}\r\n\r\n` +
      content +
      closeDelimiter;

    const response = await fetch(`${DRIVE_UPLOAD_BASE}/files?uploadType=multipart`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    });

    if (response.ok) {
      const file = await response.json();
      return `https://drive.google.com/file/d/${file.id}/view`;
    }

    console.error('[DriveService] Upload failed:', await response.text());
    return null;
  }

  /**
   * Format transcript content based on file format
   */
  private formatTranscript(
    transcripts: TranscriptData[],
    metadata: SessionMetadata,
    fileFormat: string
  ): { filename: string; content: string; mimeType: string } {
    const dateStr = metadata.startTime.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    const durationMins = Math.round(metadata.durationSeconds / 60);

    if (fileFormat === 'json') {
      return {
        filename: `Transcript - ${dateStr} (${durationMins} min).json`,
        content: this.formatJson(transcripts, metadata),
        mimeType: 'application/json',
      };
    } else if (fileFormat === 'text') {
      return {
        filename: `Transcript - ${dateStr} (${durationMins} min).txt`,
        content: this.formatText(transcripts, metadata),
        mimeType: 'text/plain',
      };
    } else {
      return {
        filename: `Transcript - ${dateStr} (${durationMins} min).md`,
        content: this.formatMarkdown(transcripts, metadata),
        mimeType: 'text/markdown',
      };
    }
  }

  private formatMarkdown(transcripts: TranscriptData[], metadata: SessionMetadata): string {
    const dateStr = metadata.startTime.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    const durationMins = Math.round(metadata.durationSeconds / 60);

    const lines = [
      '# Meeting Transcript',
      '',
      `**Date:** ${dateStr}`,
      `**Duration:** ${durationMins} minutes`,
      `**Speakers:** ${metadata.speakersCount}`,
      '',
      '---',
      '',
      '## Conversation',
      '',
    ];

    let currentSpeaker = '';
    for (const t of transcripts) {
      const roleLabel = t.speaker_role === 'customer' ? ' (Customer)' : t.is_self ? ' (You)' : '';
      const speakerLabel = `${t.speaker}${roleLabel}`;

      if (speakerLabel !== currentSpeaker) {
        currentSpeaker = speakerLabel;
        lines.push(`**[${t.timestamp}] ${speakerLabel}**`);
        lines.push('');
      }

      lines.push(t.text);
      lines.push('');
    }

    lines.push('---');
    lines.push('');
    lines.push('## Session Info');
    lines.push('');
    lines.push(`- Transcripts: ${metadata.transcriptsCount}`);
    lines.push(`- AI Suggestions: ${metadata.suggestionsCount}`);
    lines.push(`- Speaker Filter: ${metadata.speakerFilterEnabled ? 'Enabled' : 'Disabled'}`);
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('*Generated by [Wingman AI](https://github.com/cloudgeometry/wingman-ai)*');

    return lines.join('\n');
  }

  private formatText(transcripts: TranscriptData[], metadata: SessionMetadata): string {
    const dateStr = metadata.startTime.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    const durationMins = Math.round(metadata.durationSeconds / 60);

    const lines = [
      'MEETING TRANSCRIPT',
      '='.repeat(50),
      '',
      `Date: ${dateStr}`,
      `Duration: ${durationMins} minutes`,
      `Speakers: ${metadata.speakersCount}`,
      '',
      '-'.repeat(50),
      '',
    ];

    for (const t of transcripts) {
      const roleLabel = t.speaker_role === 'customer' ? ' (Customer)' : t.is_self ? ' (You)' : '';
      lines.push(`[${t.timestamp}] ${t.speaker}${roleLabel}:`);
      lines.push(t.text);
      lines.push('');
    }

    lines.push('-'.repeat(50));
    lines.push('');
    lines.push('SESSION INFO');
    lines.push(`Transcripts: ${metadata.transcriptsCount}`);
    lines.push(`AI Suggestions: ${metadata.suggestionsCount}`);

    return lines.join('\n');
  }

  private formatJson(transcripts: TranscriptData[], metadata: SessionMetadata): string {
    return JSON.stringify(
      {
        metadata: {
          start_time: metadata.startTime.toISOString(),
          end_time: metadata.endTime.toISOString(),
          duration_seconds: metadata.durationSeconds,
          speakers_count: metadata.speakersCount,
          transcripts_count: metadata.transcriptsCount,
          suggestions_count: metadata.suggestionsCount,
          speaker_filter_enabled: metadata.speakerFilterEnabled,
        },
        transcripts: transcripts.map((t) => ({
          timestamp: t.timestamp,
          speaker: t.speaker,
          speaker_id: t.speaker_id,
          speaker_role: t.speaker_role,
          text: t.text,
          is_self: t.is_self,
        })),
      },
      null,
      2
    );
  }
}

// Export singleton instance
export const driveService = new DriveService();
