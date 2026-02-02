/**
 * Google Drive Service
 *
 * Handles Google Drive operations using Chrome Identity API.
 * No backend required - calls Drive API directly from extension.
 */

import { type CallSummary, formatSummaryAsMarkdown } from './call-summary';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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
  is_suggestion?: boolean;
  suggestion_type?: string;
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
    fileFormat: string = 'markdown',
    summary?: CallSummary | null
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
      const formatted = this.formatTranscript(
        transcripts,
        metadata,
        fileFormat,
        summary ?? null
      );

      // Upload file
      const fileUrl = await this.uploadFile(
        token, folderId, formatted.filename, formatted.content,
        formatted.mimeType, formatted.convertToGoogleDoc
      );
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
    mimeType: string,
    convertToGoogleDoc: boolean = false
  ): Promise<string | null> {
    // Use multipart upload
    const fileMetadata: Record<string, unknown> = {
      name: filename,
      parents: [folderId],
    };

    // Set target mimeType for HTML→Google Doc conversion
    if (convertToGoogleDoc) {
      fileMetadata.mimeType = 'application/vnd.google-apps.document';
    }

    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const body =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(fileMetadata) +
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
      if (convertToGoogleDoc) {
        return `https://docs.google.com/document/d/${file.id}/edit`;
      }
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
    fileFormat: string,
    summary: CallSummary | null
  ): { filename: string; content: string; mimeType: string; convertToGoogleDoc: boolean } {
    const dateStr = metadata.startTime.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    const durationMins = Math.round(metadata.durationSeconds / 60);
    const baseName = `Transcript - ${dateStr} (${durationMins} min)`;

    if (fileFormat === 'googledoc') {
      return {
        filename: baseName,
        content: this.formatGoogleDoc(transcripts, metadata, summary),
        mimeType: 'text/html',
        convertToGoogleDoc: true,
      };
    } else if (fileFormat === 'json') {
      return {
        filename: `${baseName}.json`,
        content: this.formatJson(transcripts, metadata, summary),
        mimeType: 'application/json',
        convertToGoogleDoc: false,
      };
    } else if (fileFormat === 'text') {
      return {
        filename: `${baseName}.txt`,
        content: this.formatText(transcripts, metadata, summary),
        mimeType: 'text/plain',
        convertToGoogleDoc: false,
      };
    } else {
      return {
        filename: `${baseName}.md`,
        content: this.formatMarkdown(transcripts, metadata, summary),
        mimeType: 'text/markdown',
        convertToGoogleDoc: false,
      };
    }
  }

  private formatGoogleDoc(transcripts: TranscriptData[], metadata: SessionMetadata, summary: CallSummary | null): string {
    const dateStr = metadata.startTime.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const shortDateStr = metadata.startTime.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    const timeStr = metadata.startTime.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const endTimeStr = metadata.endTime.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const durationMins = Math.round(metadata.durationSeconds / 60);

    const h: string[] = [];

    // Document wrapper
    h.push('<html><body style="font-family: Arial, sans-serif; color: #3c4043; line-height: 1.6;">');

    // Title
    h.push(`<h1 style="color: #1a73e8; font-size: 24px; border-bottom: 2px solid #1a73e8; padding-bottom: 10px;">Meeting Transcript &mdash; ${escapeHtml(dateStr)}</h1>`);

    // Metadata table
    const tdLabel = 'padding: 8px 12px; border: 1px solid #dadce0; background-color: #f8f9fa; font-weight: bold; width: 180px;';
    const tdValue = 'padding: 8px 12px; border: 1px solid #dadce0;';
    h.push('<table style="width: 100%; border-collapse: collapse; margin: 16px 0;">');
    h.push(`<tr><td style="${tdLabel}">Time</td><td style="${tdValue}">${escapeHtml(timeStr)} &ndash; ${escapeHtml(endTimeStr)} (${durationMins} min)</td></tr>`);
    h.push(`<tr><td style="${tdLabel}">Speakers</td><td style="${tdValue}">${metadata.speakersCount}</td></tr>`);
    h.push(`<tr><td style="${tdLabel}">Transcript entries</td><td style="${tdValue}">${metadata.transcriptsCount}</td></tr>`);
    h.push(`<tr><td style="${tdLabel}">AI suggestions</td><td style="${tdValue}">${metadata.suggestionsCount}</td></tr>`);
    h.push('</table>');

    // Call summary
    if (summary) {
      h.push(`<h2 style="color: #3c4043; margin-top: 24px;">Call Summary &mdash; ${escapeHtml(shortDateStr)}</h2>`);
      h.push(`<p><strong>Duration:</strong> ${durationMins} min | <strong>Speakers:</strong> ${metadata.speakersCount}</p>`);

      // Summary bullets
      h.push('<h3 style="color: #5f6368;">Summary</h3>');
      if (summary.summary.length === 0) {
        h.push('<ul><li>No summary available</li></ul>');
      } else {
        h.push('<ul>');
        for (const bullet of summary.summary) {
          h.push(`<li>${escapeHtml(bullet)}</li>`);
        }
        h.push('</ul>');
      }

      // Action Items
      if (summary.actionItems.length > 0) {
        h.push('<h3 style="color: #5f6368;">Action Items</h3>');
        h.push('<ul>');
        for (const item of summary.actionItems) {
          const owner = item.owner === 'you' ? 'You' : 'Them';
          h.push(`<li>&#9744; <strong>${owner}:</strong> ${escapeHtml(item.text)}</li>`);
        }
        h.push('</ul>');
      }

      // Key Moments
      if (summary.keyMoments.length > 0) {
        h.push('<h3 style="color: #5f6368;">Key Moments</h3>');
        h.push('<ul>');
        for (const moment of summary.keyMoments) {
          const timestamp = moment.timestamp ? ` (${escapeHtml(moment.timestamp)})` : '';
          h.push(`<li><em>&ldquo;${escapeHtml(moment.text)}&rdquo;</em>${timestamp}</li>`);
        }
        h.push('</ul>');
      }
    }

    // Separator — use a table-based rule since <hr> may become a page break
    h.push('<table style="width: 100%; border-collapse: collapse; margin: 24px 0;"><tr><td style="border-bottom: 2px solid #dadce0;"></td></tr></table>');

    // Transcript heading
    h.push('<h2 style="color: #3c4043;">Transcript</h2>');

    // Transcript entries
    let currentSpeaker = '';
    for (const t of transcripts) {
      if (t.is_suggestion) {
        // AI suggestion — two-cell table: narrow amber accent + content cell
        h.push('<table style="width: 100%; border-collapse: collapse; margin: 12px 0;">');
        h.push('<tr>');
        h.push('<td style="width: 4px; background-color: #fbbc04; padding: 0;"></td>');
        h.push(`<td style="padding: 10px 14px; background-color: #fef7e0;">`);
        h.push(`<strong style="color: #e37400;">Wingman AI</strong> <span style="color: #80868b; font-size: 12px;">(${escapeHtml(t.suggestion_type || 'suggestion')}) &mdash; ${escapeHtml(t.timestamp)}</span><br>`);
        h.push(`<span style="color: #5f6368;">${escapeHtml(t.text)}</span>`);
        h.push('</td></tr></table>');
        currentSpeaker = '';
        continue;
      }

      // Speaker color: blue for user, green for customer, gray for other
      const speakerColor = t.is_self ? '#1a73e8' : t.speaker_role === 'customer' ? '#34a853' : '#5f6368';
      const roleLabel = t.speaker_role === 'customer' ? ' (Customer)' : t.is_self ? ' (You)' : '';
      const speakerLabel = `${t.speaker}${roleLabel}`;

      if (speakerLabel !== currentSpeaker) {
        currentSpeaker = speakerLabel;
        h.push(`<p style="margin-top: 16px; margin-bottom: 2px;"><strong style="color: ${speakerColor};">${escapeHtml(speakerLabel)}</strong> <span style="color: #80868b; font-size: 12px;">&mdash; ${escapeHtml(t.timestamp)}</span></p>`);
      }

      h.push(`<p style="margin-left: 16px; margin-top: 2px; color: #3c4043;">${escapeHtml(t.text)}</p>`);
    }

    // Footer
    h.push('<table style="width: 100%; border-collapse: collapse; margin: 24px 0;"><tr><td style="border-bottom: 2px solid #dadce0;"></td></tr></table>');
    h.push(`<p style="text-align: center; color: #9aa0a6; font-size: 11px;">Generated by <a href="https://github.com/AntoineDubuc/wingman-ai" style="color: #1a73e8;">Wingman AI</a> &mdash; ${escapeHtml(dateStr)}</p>`);

    h.push('</body></html>');

    return h.join('\n');
  }

  private formatMarkdown(transcripts: TranscriptData[], metadata: SessionMetadata, summary: CallSummary | null): string {
    const dateStr = metadata.startTime.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const timeStr = metadata.startTime.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const endTimeStr = metadata.endTime.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const durationMins = Math.round(metadata.durationSeconds / 60);

    const lines: string[] = [];

    // Header
    lines.push(`# Meeting Transcript — ${dateStr}`);
    lines.push('');
    lines.push(`| | |`);
    lines.push(`|---|---|`);
    lines.push(`| **Time** | ${timeStr} – ${endTimeStr} (${durationMins} min) |`);
    lines.push(`| **Speakers** | ${metadata.speakersCount} |`);
    lines.push(`| **Transcript entries** | ${metadata.transcriptsCount} |`);
    lines.push(`| **AI suggestions** | ${metadata.suggestionsCount} |`);
    lines.push('');

    // Call summary
    if (summary) {
      lines.push(formatSummaryAsMarkdown(summary));
      lines.push('');
    }

    // Conversation
    lines.push('---');
    lines.push('');
    lines.push('## Transcript');
    lines.push('');

    let currentSpeaker = '';
    for (const t of transcripts) {
      if (t.is_suggestion) {
        lines.push(`> **Wingman AI** *(${t.suggestion_type || 'suggestion'})* — ${t.timestamp}`);
        lines.push(`> ${t.text}`);
        lines.push('');
        currentSpeaker = '';
        continue;
      }

      const roleLabel = t.speaker_role === 'customer' ? ' (Customer)' : t.is_self ? ' (You)' : '';
      const speakerLabel = `${t.speaker}${roleLabel}`;

      if (speakerLabel !== currentSpeaker) {
        currentSpeaker = speakerLabel;
        lines.push(`#### ${speakerLabel} — ${t.timestamp}`);
        lines.push('');
      }

      lines.push(`> ${t.text}`);
      lines.push('');
    }

    // Footer
    lines.push('---');
    lines.push('');
    lines.push(`*Generated by [Wingman AI](https://github.com/AntoineDubuc/wingman-ai) — ${dateStr}*`);

    return lines.join('\n');
  }

  private formatText(transcripts: TranscriptData[], metadata: SessionMetadata, summary: CallSummary | null): string {
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
    ];

    // Prepend call summary if available
    if (summary) {
      lines.push('-'.repeat(50));
      lines.push('');
      lines.push('CALL SUMMARY');
      lines.push('');
      for (const bullet of summary.summary) {
        lines.push(`  - ${bullet}`);
      }
      if (summary.actionItems.length > 0) {
        lines.push('');
        lines.push('ACTION ITEMS:');
        for (const item of summary.actionItems) {
          const owner = item.owner === 'you' ? 'You' : 'Them';
          lines.push(`  [ ] ${owner}: ${item.text}`);
        }
      }
      if (summary.keyMoments.length > 0) {
        lines.push('');
        lines.push('KEY MOMENTS:');
        for (const moment of summary.keyMoments) {
          lines.push(`  - "${moment.text}"`);
        }
      }
      lines.push('');
    }

    lines.push('-'.repeat(50));
    lines.push('');

    for (const t of transcripts) {
      if (t.is_suggestion) {
        lines.push(`[${t.timestamp}] ** WINGMAN AI (${t.suggestion_type || 'suggestion'}) **`);
        lines.push(`  >> ${t.text}`);
        lines.push('');
        continue;
      }

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

  private formatJson(transcripts: TranscriptData[], metadata: SessionMetadata, summary: CallSummary | null): string {
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
        summary: summary ? {
          summary: summary.summary,
          action_items: summary.actionItems.map((item) => ({
            owner: item.owner,
            text: item.text,
          })),
          key_moments: summary.keyMoments.map((moment) => ({
            text: moment.text,
            type: moment.type,
            timestamp: moment.timestamp ?? null,
          })),
        } : null,
        transcripts: transcripts.map((t) => ({
          timestamp: t.timestamp,
          speaker: t.speaker,
          speaker_id: t.speaker_id,
          speaker_role: t.speaker_role,
          text: t.text,
          is_self: t.is_self,
          ...(t.is_suggestion && {
            is_suggestion: true,
            suggestion_type: t.suggestion_type,
          }),
        })),
      },
      null,
      2
    );
  }
}

// Export singleton instance
export const driveService = new DriveService();
