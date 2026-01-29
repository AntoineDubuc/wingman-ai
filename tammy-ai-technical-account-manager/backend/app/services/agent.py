"""
Agent Service - Continuous Participant Architecture

Tammy acts as a silent participant in sales calls, listening to the entire
conversation and providing suggestions when she has something valuable to add.

Uses Google Gemini's multi-turn chat API to maintain full conversation context.
The LLM decides when to speak, not pattern matching.
"""

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional, Any

from app.config import settings

logger = logging.getLogger(__name__)

# RAG integration (lazy import to handle circular dependencies)
_rag_retriever = None


def get_rag_retriever():
    """Get the RAG retriever instance (lazy initialization)."""
    global _rag_retriever
    if _rag_retriever is None:
        try:
            from app.rag.retriever import get_retriever
            _rag_retriever = get_retriever()
        except Exception as e:
            logger.warning(f"RAG retriever not available: {e}")
    return _rag_retriever


@dataclass
class Suggestion:
    """AI-generated response suggestion."""

    text: str
    confidence: float = 0.8
    suggestion_type: str = "info"  # answer, question, objection, info
    source: Optional[str] = None
    timestamp: datetime = field(default_factory=datetime.utcnow)

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {
            "text": self.text,
            "confidence": self.confidence,
            "suggestion_type": self.suggestion_type,
            "source": self.source,
            "timestamp": self.timestamp.isoformat(),
        }


# System prompt for continuous participant mode
CONTINUOUS_SYSTEM_PROMPT = """You are TAMMY, an AI Technical Account Manager for CloudGeometry, silently participating in a live sales call. You are helping a NON-TECHNICAL sales rep by providing real-time guidance.

IMPORTANT: You are listening to a LIVE conversation. You will receive each utterance as it happens.

WHEN TO RESPOND:
- When the customer asks a technical question the sales rep might not know
- When the customer mentions a pain point you can address
- When there's an opportunity to suggest a good discovery question
- When you can provide valuable context about CloudGeometry's capabilities
- When you hear an objection that needs handling

WHEN TO STAY SILENT (respond with exactly "---"):
- Small talk, greetings, "how are you", etc.
- The sales rep is handling it well on their own
- Just acknowledgments like "okay", "sure", "got it"
- You have nothing valuable to add
- The same topic was just addressed

ABOUT CLOUDGEOMETRY:
- AWS Advanced Consulting Partner, CNCF Kubernetes Certified
- Services: App Modernization, Cloud-Native/K8s, AI/Data/MLOps, Managed CloudOps, FinOps, Security
- Products: CGDevX (K8s platform, 50%+ savings), LangBuilder (AI agents), ActionBridge (automation)
- Clients: Sinclair, Tetra Science, Gemini Health, Ryder, Symphony

RESPONSE FORMAT (when you have something to say):
📌 [One-line key point]
• Talking point 1
• Talking point 2
💬 Ask: "[suggested question]" (if relevant)

CRITICAL RULES:
1. Be EXTREMELY CONCISE - this is a live call
2. Max 3-4 bullet points
3. Simple language the rep can say verbatim
4. If nothing valuable to add, respond with exactly: ---
5. Never make up pricing - say "custom quote"
6. Don't repeat yourself - if you just said something, stay silent

Remember: Quality over quantity. Only speak when you add real value."""


class AgentService:
    """
    Continuous Participant AI Agent.

    Maintains a persistent chat session with Gemini, processing each
    transcript and deciding when to provide suggestions.
    """

    def __init__(self) -> None:
        self.api_key = settings.gemini_api_key
        self.model = settings.gemini_model
        self.max_tokens = settings.max_response_tokens
        self.temperature = settings.temperature

        self._client = None
        self._chat_session = None
        self._chat_history: list[dict] = []
        self._last_suggestion_time: Optional[datetime] = None
        self._suggestion_cooldown_seconds = 5  # Don't suggest too frequently
        self._system_prompt = CONTINUOUS_SYSTEM_PROMPT  # Custom prompt support

        logger.info(
            f"AgentService (Continuous) initialized - model: {self.model}, "
            f"max_tokens: {self.max_tokens}, temperature: {self.temperature}"
        )

        self._initialize_client()

    def _initialize_client(self) -> None:
        """Initialize the Google GenAI client."""
        if not self.api_key:
            logger.warning("Gemini API key not configured - AI suggestions disabled")
            return

        try:
            from google import genai

            self._client = genai.Client(api_key=self.api_key)
            logger.info("Gemini client initialized successfully")

        except ImportError:
            logger.error(
                "google-genai not installed. Run: pip install google-genai>=1.0.0"
            )
        except Exception as e:
            logger.error(f"Failed to initialize Gemini client: {e}")

    def start_session(self) -> None:
        """Start a new conversation session (called at beginning of meeting)."""
        self._chat_history = []
        self._last_suggestion_time = None
        logger.info("Started new conversation session")

    def clear_session(self) -> None:
        """Clear the conversation session."""
        self._chat_history = []
        self._last_suggestion_time = None
        logger.info("Cleared conversation session")

    def set_system_prompt(self, prompt: str) -> None:
        """
        Set a custom system prompt for this session with validation.

        Validation rules (backend limits - more lenient than frontend for defense in depth):
        - Empty/whitespace only: Keep default, log warning
        - Too short (< 50 chars): Keep default, log warning
        - Too long (> 20KB): Truncate to 20KB, log warning
        - Strip leading/trailing whitespace
        - Never crash or error out - always fall back gracefully
        """
        # Gracefully handle None or non-string input
        if not prompt:
            logger.warning("Empty prompt provided, using default")
            return

        # Handle non-string input gracefully
        if not isinstance(prompt, str):
            logger.warning(f"Invalid prompt type ({type(prompt).__name__}), using default")
            return

        # Strip whitespace
        prompt = prompt.strip()

        # Check for empty after stripping
        if not prompt:
            logger.warning("Whitespace-only prompt provided, using default")
            return

        # Check minimum length (50 chars - backend is more lenient than frontend's 100)
        if len(prompt) < 50:
            logger.warning(f"Prompt too short ({len(prompt)} chars, min 50), using default")
            return

        # Check maximum length and truncate if needed (20KB = 20000 chars)
        max_length = 20000
        if len(prompt) > max_length:
            logger.warning(f"Prompt too long ({len(prompt)} chars), truncating to {max_length} chars")
            prompt = prompt[:max_length]

        # Apply the validated prompt
        self._system_prompt = prompt
        logger.info(f"Custom system prompt applied ({len(prompt)} chars)")

    async def process_transcript(
        self,
        text: str,
        speaker: str,
        is_final: bool = True,
    ) -> Optional[Suggestion]:
        """
        Process a transcript and potentially generate a suggestion.

        This is the main entry point for the continuous participant mode.
        Every final transcript is sent to the LLM, which decides whether
        to respond with a suggestion or stay silent.

        Args:
            text: The transcript text
            speaker: Who said it (e.g., "Speaker 0", "Customer")
            is_final: Whether this is a final transcript (vs interim)

        Returns:
            Suggestion if the LLM has something valuable to say, None otherwise
        """
        if not text or not text.strip():
            return None

        # Only process final transcripts
        if not is_final:
            return None

        # Skip very short utterances
        if len(text.split()) < 2:
            return None

        # Add to history
        self._chat_history.append({
            "speaker": speaker,
            "text": text,
            "timestamp": datetime.utcnow().isoformat(),
        })

        # Check cooldown - don't suggest too frequently
        if self._last_suggestion_time:
            elapsed = (datetime.utcnow() - self._last_suggestion_time).total_seconds()
            if elapsed < self._suggestion_cooldown_seconds:
                logger.debug(f"Suggestion cooldown active ({elapsed:.1f}s)")
                return None

        # Generate response from LLM
        suggestion = await self._generate_response(text, speaker)

        if suggestion:
            self._last_suggestion_time = datetime.utcnow()

        return suggestion

    async def _generate_response(
        self,
        current_text: str,
        current_speaker: str,
    ) -> Optional[Suggestion]:
        """
        Send the conversation to Gemini and get a response.

        Returns None if Gemini responds with "---" (nothing to add).
        """
        if not self._client:
            logger.debug("No Gemini client - returning mock")
            return self._generate_mock_suggestion(current_text)

        try:
            from google.genai import types

            # Build the conversation for the LLM
            messages = self._build_conversation_messages(current_text, current_speaker)

            # Configure generation
            config = types.GenerateContentConfig(
                max_output_tokens=self.max_tokens,
                temperature=self.temperature,
                system_instruction=self._system_prompt,
            )

            # Generate response
            response = self._client.models.generate_content(
                model=self.model,
                contents=messages,
                config=config,
            )

            if response and response.text:
                response_text = response.text.strip()

                # Check if LLM chose to stay silent
                if response_text == "---" or response_text == "-" or not response_text:
                    logger.debug("LLM chose to stay silent")
                    return None

                # LLM has something to say
                logger.info(f"LLM suggestion: {response_text[:50]}...")

                # Determine suggestion type from content
                suggestion_type = self._classify_suggestion(response_text)

                return Suggestion(
                    text=response_text,
                    confidence=0.85,
                    suggestion_type=suggestion_type,
                    source="gemini",
                )

        except Exception as e:
            logger.error(f"Failed to generate response: {e}")
            # Fall back to mock on error
            return self._generate_mock_suggestion(current_text)

        return None

    def _build_conversation_messages(
        self,
        current_text: str,
        current_speaker: str,
    ) -> list[dict]:
        """Build the conversation history for the LLM."""
        messages = []

        # Add recent conversation history (last 20 turns for context)
        recent_history = self._chat_history[-20:]

        # Format as a single context message
        if recent_history:
            conversation = "CONVERSATION SO FAR:\n"
            for turn in recent_history[:-1]:  # Exclude current (we'll add it separately)
                conversation += f"[{turn['speaker']}]: {turn['text']}\n"

            messages.append({
                "role": "user",
                "parts": [{"text": conversation}]
            })

            # Model acknowledges the context
            messages.append({
                "role": "model",
                "parts": [{"text": "I'm listening to the conversation. I'll provide suggestions when I have something valuable to add, or respond with --- if I should stay silent."}]
            })

        # Add the current utterance
        messages.append({
            "role": "user",
            "parts": [{"text": f"[{current_speaker}]: {current_text}\n\nShould I provide a suggestion for the sales rep, or stay silent (---)?"}]
        })

        return messages

    def _classify_suggestion(self, text: str) -> str:
        """Classify the type of suggestion based on content."""
        text_lower = text.lower()

        if "💬 ask:" in text_lower or "suggest asking" in text_lower:
            return "question"
        elif any(word in text_lower for word in ["objection", "concern", "pushback", "worry"]):
            return "objection"
        elif "📌" in text:
            return "answer"
        else:
            return "info"

    def _generate_mock_suggestion(self, text: str) -> Optional[Suggestion]:
        """Generate a mock suggestion for testing without API."""
        text_lower = text.lower()

        # Simple keyword matching for mock responses
        if any(word in text_lower for word in ["cost", "price", "budget", "expensive"]):
            return Suggestion(
                text="""📌 Pricing is custom based on project scope

• We offer T&M, fixed price, or managed services
• Clients typically see 50%+ compute savings with CGDevX

💬 Ask: "What's your current monthly cloud spend?" """,
                suggestion_type="answer",
                source="mock",
            )

        if any(word in text_lower for word in ["kubernetes", "k8s", "container", "docker"]):
            return Suggestion(
                text="""📌 We're CNCF Kubernetes Certified

• CGDevX platform: 50%+ savings, 90% DevOps reduction
• Works across AWS, Azure, GCP

💬 Ask: "What's your current container strategy?" """,
                suggestion_type="answer",
                source="mock",
            )

        if any(word in text_lower for word in ["ai", "machine learning", "ml", "genai"]):
            return Suggestion(
                text="""📌 AI Transformation is a core service

• LangBuilder: AI agent platform for enterprise
• Full MLOps pipeline support
• Data engineering for AI-ready pipelines

💬 Ask: "What AI use cases are you exploring?" """,
                suggestion_type="answer",
                source="mock",
            )

        if any(word in text_lower for word in ["help", "need", "looking for", "interested"]):
            return Suggestion(
                text="""📌 Good opportunity to learn more

💬 Ask: "What's the biggest infrastructure challenge you're facing right now?" """,
                suggestion_type="question",
                source="mock",
            )

        # Nothing specific to respond to
        return None

    def get_session_summary(self) -> dict:
        """Get a summary of the current session."""
        return {
            "turns": len(self._chat_history),
            "last_suggestion": self._last_suggestion_time.isoformat() if self._last_suggestion_time else None,
            "recent_speakers": list(set(
                turn["speaker"] for turn in self._chat_history[-10:]
            )) if self._chat_history else [],
        }


# Backward compatibility - keep old methods that might be called
class QuestionType:
    """Kept for backward compatibility."""
    TECHNICAL = "technical"
    PRICING = "pricing"
    COMPARISON = "comparison"
    TIMELINE = "timeline"
    INTEGRATION = "integration"
    SECURITY = "security"
    SUPPORT = "support"
    GENERAL = "general"
