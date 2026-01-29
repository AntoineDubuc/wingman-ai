"""
Transcripts Router

Handles transcript export and saving to Google Drive.
"""

import logging
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.drive import DriveService, TranscriptEntry, SessionMetadata

router = APIRouter(prefix="/api/transcripts", tags=["Transcripts"])
logger = logging.getLogger(__name__)


class TranscriptItem(BaseModel):
    """Single transcript item from extension."""

    timestamp: str
    speaker: str
    speaker_id: int
    speaker_role: str
    text: str
    is_self: bool = False


class SaveTranscriptRequest(BaseModel):
    """Request to save transcript to Google Drive."""

    access_token: str
    folder_name: str = "Tammy Transcripts"
    file_format: str = "markdown"  # markdown, text, or json
    transcripts: List[TranscriptItem]
    start_time: str  # ISO format
    end_time: str  # ISO format
    suggestions_count: int = 0
    speaker_filter_enabled: bool = False


class SaveTranscriptResponse(BaseModel):
    """Response after saving transcript."""

    success: bool
    file_url: Optional[str] = None
    error: Optional[str] = None


@router.post("/save-drive", response_model=SaveTranscriptResponse)
async def save_transcript_to_drive(request: SaveTranscriptRequest) -> SaveTranscriptResponse:
    """
    Save transcript to Google Drive.

    The extension collects transcripts during a session and sends them here
    to be saved to the user's Google Drive in the specified format.
    """
    try:
        # Initialize Drive service with user's token
        drive = DriveService(request.access_token)

        # Find or create the folder
        folder_id = await drive.find_or_create_folder(request.folder_name)
        if not folder_id:
            return SaveTranscriptResponse(
                success=False,
                error="Failed to access or create folder in Google Drive"
            )

        # Convert request transcripts to internal format
        transcripts = [
            TranscriptEntry(
                timestamp=t.timestamp,
                speaker=t.speaker,
                speaker_id=t.speaker_id,
                speaker_role=t.speaker_role,
                text=t.text,
                is_self=t.is_self,
            )
            for t in request.transcripts
        ]

        # Parse timestamps
        start_time = datetime.fromisoformat(request.start_time.replace("Z", "+00:00"))
        end_time = datetime.fromisoformat(request.end_time.replace("Z", "+00:00"))
        duration = int((end_time - start_time).total_seconds())

        # Count unique speakers
        speaker_ids = set(t.speaker_id for t in request.transcripts)

        # Build metadata
        metadata = SessionMetadata(
            start_time=start_time,
            end_time=end_time,
            duration_seconds=duration,
            speakers_count=len(speaker_ids),
            transcripts_count=len(transcripts),
            suggestions_count=request.suggestions_count,
            speaker_filter_enabled=request.speaker_filter_enabled,
        )

        # Save to Drive
        file_url = await drive.save_transcript(
            folder_id=folder_id,
            transcripts=transcripts,
            metadata=metadata,
            file_format=request.file_format,
        )

        if file_url:
            logger.info(f"Saved transcript to Drive: {file_url}")
            return SaveTranscriptResponse(success=True, file_url=file_url)
        else:
            return SaveTranscriptResponse(
                success=False,
                error="Failed to save file to Google Drive"
            )

    except Exception as e:
        logger.error(f"Failed to save transcript: {e}")
        return SaveTranscriptResponse(success=False, error=str(e))


@router.get("/formats")
async def get_supported_formats() -> dict:
    """Get list of supported transcript formats."""
    return {
        "formats": [
            {"id": "markdown", "name": "Markdown (.md)", "description": "Formatted text with headers"},
            {"id": "text", "name": "Plain Text (.txt)", "description": "Simple text format"},
            {"id": "json", "name": "JSON (.json)", "description": "Structured data format"},
        ]
    }
