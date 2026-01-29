"""
Google Drive Service

Handles saving transcripts to Google Drive.
Supports creating folders and uploading files in various formats.
"""

import logging
from datetime import datetime
from typing import Optional
from dataclasses import dataclass

import httpx

logger = logging.getLogger(__name__)

# Google Drive API endpoints
DRIVE_API_BASE = "https://www.googleapis.com/drive/v3"
DRIVE_UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3"


@dataclass
class TranscriptEntry:
    """Single transcript entry."""

    timestamp: str
    speaker: str
    speaker_id: int
    speaker_role: str
    text: str
    is_self: bool = False


@dataclass
class SessionMetadata:
    """Meeting session metadata."""

    start_time: datetime
    end_time: datetime
    duration_seconds: int
    speakers_count: int
    transcripts_count: int
    suggestions_count: int
    speaker_filter_enabled: bool


class DriveService:
    """Service for Google Drive operations."""

    def __init__(self, access_token: str):
        """
        Initialize Drive service with access token.

        Args:
            access_token: OAuth2 access token for Google Drive API.
        """
        self.access_token = access_token
        self._headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }

    async def find_or_create_folder(self, folder_name: str) -> Optional[str]:
        """
        Find existing folder or create new one.

        Args:
            folder_name: Name of the folder (e.g., "Tammy Transcripts").

        Returns:
            Folder ID if successful, None otherwise.
        """
        try:
            async with httpx.AsyncClient() as client:
                # Search for existing folder
                query = f"name='{folder_name}' and mimeType='application/vnd.google-apps.folder' and trashed=false"
                response = await client.get(
                    f"{DRIVE_API_BASE}/files",
                    headers=self._headers,
                    params={"q": query, "spaces": "drive", "pageSize": 1},
                )

                if response.status_code == 200:
                    files = response.json().get("files", [])
                    if files:
                        folder_id = files[0]["id"]
                        logger.info(f"Found existing folder: {folder_name} ({folder_id})")
                        return folder_id

                # Create new folder
                logger.info(f"Creating new folder: {folder_name}")
                create_response = await client.post(
                    f"{DRIVE_API_BASE}/files",
                    headers=self._headers,
                    json={
                        "name": folder_name,
                        "mimeType": "application/vnd.google-apps.folder",
                    },
                )

                if create_response.status_code in (200, 201):
                    folder_id = create_response.json()["id"]
                    logger.info(f"Created folder: {folder_name} ({folder_id})")
                    return folder_id

                logger.error(f"Failed to create folder: {create_response.text}")
                return None

        except Exception as e:
            logger.error(f"Drive folder operation failed: {e}")
            return None

    async def save_transcript(
        self,
        folder_id: str,
        transcripts: list[TranscriptEntry],
        metadata: SessionMetadata,
        file_format: str = "markdown",
    ) -> Optional[str]:
        """
        Save transcript to Google Drive.

        Args:
            folder_id: Parent folder ID.
            transcripts: List of transcript entries.
            metadata: Session metadata.
            file_format: Output format (markdown, text, or json).

        Returns:
            File URL if successful, None otherwise.
        """
        # Generate filename
        date_str = metadata.start_time.strftime("%Y-%m-%d %H-%M")
        duration_mins = metadata.duration_seconds // 60

        if file_format == "json":
            filename = f"Transcript - {date_str} ({duration_mins} min).json"
            content = self._format_json(transcripts, metadata)
            mime_type = "application/json"
        elif file_format == "text":
            filename = f"Transcript - {date_str} ({duration_mins} min).txt"
            content = self._format_text(transcripts, metadata)
            mime_type = "text/plain"
        else:  # markdown
            filename = f"Transcript - {date_str} ({duration_mins} min).md"
            content = self._format_markdown(transcripts, metadata)
            mime_type = "text/markdown"

        try:
            async with httpx.AsyncClient() as client:
                # Create file with multipart upload
                file_metadata = {
                    "name": filename,
                    "parents": [folder_id],
                }

                # Use simple upload for small files
                response = await client.post(
                    f"{DRIVE_UPLOAD_BASE}/files",
                    params={"uploadType": "multipart"},
                    headers={"Authorization": f"Bearer {self.access_token}"},
                    files={
                        "metadata": (
                            None,
                            str(file_metadata).replace("'", '"'),
                            "application/json",
                        ),
                        "file": (filename, content.encode(), mime_type),
                    },
                )

                if response.status_code in (200, 201):
                    file_data = response.json()
                    file_id = file_data["id"]
                    file_url = f"https://drive.google.com/file/d/{file_id}/view"
                    logger.info(f"Saved transcript: {filename} ({file_id})")
                    return file_url

                logger.error(f"Failed to save transcript: {response.text}")
                return None

        except Exception as e:
            logger.error(f"Failed to save transcript: {e}")
            return None

    def _format_markdown(
        self, transcripts: list[TranscriptEntry], metadata: SessionMetadata
    ) -> str:
        """Format transcript as Markdown."""
        lines = [
            "# Meeting Transcript",
            "",
            f"**Date:** {metadata.start_time.strftime('%B %d, %Y %I:%M %p')}",
            f"**Duration:** {metadata.duration_seconds // 60} minutes",
            f"**Speakers:** {metadata.speakers_count}",
            "",
            "---",
            "",
            "## Conversation",
            "",
        ]

        current_speaker = None
        for entry in transcripts:
            # Format timestamp
            timestamp = entry.timestamp

            # Speaker label
            role_label = ""
            if entry.speaker_role == "customer":
                role_label = " (Customer)"
            elif entry.is_self:
                role_label = " (You)"

            speaker_label = f"{entry.speaker}{role_label}"

            # Add speaker header if changed
            if speaker_label != current_speaker:
                current_speaker = speaker_label
                lines.append(f"**[{timestamp}] {speaker_label}**")
                lines.append("")

            lines.append(entry.text)
            lines.append("")

        # Add session info footer
        lines.extend([
            "---",
            "",
            "## Session Info",
            "",
            f"- Transcripts: {metadata.transcripts_count}",
            f"- AI Suggestions: {metadata.suggestions_count}",
            f"- Speaker Filter: {'Enabled' if metadata.speaker_filter_enabled else 'Disabled'}",
            "",
            "---",
            "",
            "*Generated by [Tammy AI](https://github.com/cloudgeometry/tammy-ai)*",
        ])

        return "\n".join(lines)

    def _format_text(
        self, transcripts: list[TranscriptEntry], metadata: SessionMetadata
    ) -> str:
        """Format transcript as plain text."""
        lines = [
            "MEETING TRANSCRIPT",
            "=" * 50,
            "",
            f"Date: {metadata.start_time.strftime('%B %d, %Y %I:%M %p')}",
            f"Duration: {metadata.duration_seconds // 60} minutes",
            f"Speakers: {metadata.speakers_count}",
            "",
            "-" * 50,
            "",
        ]

        for entry in transcripts:
            role_label = ""
            if entry.speaker_role == "customer":
                role_label = " (Customer)"
            elif entry.is_self:
                role_label = " (You)"

            lines.append(f"[{entry.timestamp}] {entry.speaker}{role_label}:")
            lines.append(entry.text)
            lines.append("")

        lines.extend([
            "-" * 50,
            "",
            "SESSION INFO",
            f"Transcripts: {metadata.transcripts_count}",
            f"AI Suggestions: {metadata.suggestions_count}",
        ])

        return "\n".join(lines)

    def _format_json(
        self, transcripts: list[TranscriptEntry], metadata: SessionMetadata
    ) -> str:
        """Format transcript as JSON."""
        import json

        data = {
            "metadata": {
                "start_time": metadata.start_time.isoformat(),
                "end_time": metadata.end_time.isoformat(),
                "duration_seconds": metadata.duration_seconds,
                "speakers_count": metadata.speakers_count,
                "transcripts_count": metadata.transcripts_count,
                "suggestions_count": metadata.suggestions_count,
                "speaker_filter_enabled": metadata.speaker_filter_enabled,
            },
            "transcripts": [
                {
                    "timestamp": t.timestamp,
                    "speaker": t.speaker,
                    "speaker_id": t.speaker_id,
                    "speaker_role": t.speaker_role,
                    "text": t.text,
                    "is_self": t.is_self,
                }
                for t in transcripts
            ],
        }

        return json.dumps(data, indent=2)
