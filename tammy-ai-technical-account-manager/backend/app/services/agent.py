"""
Agent Service

AI-powered presales response generation using Google Gemini.
Provides real-time suggestions for technical cloud solutions consultants.

Uses the google-genai SDK (NOT the deprecated google-generativeai package).
Integrates with RAG pipeline for context-aware responses.
"""

import asyncio
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
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


class QuestionType(Enum):
    """Classification of customer questions."""

    TECHNICAL = "technical"
    PRICING = "pricing"
    COMPARISON = "comparison"
    TIMELINE = "timeline"
    INTEGRATION = "integration"
    SECURITY = "security"
    SUPPORT = "support"
    GENERAL = "general"


@dataclass
class Suggestion:
    """AI-generated response suggestion."""

    text: str
    confidence: float
    question_type: QuestionType = QuestionType.GENERAL
    source: Optional[str] = None
    key_points: list[str] = field(default_factory=list)
    follow_up_questions: list[str] = field(default_factory=list)
    timestamp: datetime = field(default_factory=datetime.utcnow)

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {
            "text": self.text,
            "confidence": self.confidence,
            "question_type": self.question_type.value,
            "source": self.source,
            "key_points": self.key_points,
            "follow_up_questions": self.follow_up_questions,
            "timestamp": self.timestamp.isoformat(),
        }


class AgentService:
    """
    AI agent for generating presales response suggestions.

    Uses Google Gemini via the google-genai SDK for fast, accurate
    response generation with context from the conversation.
    """

    # Question detection patterns
    QUESTION_PATTERNS = [
        r"\?$",  # Ends with question mark
        r"^(what|how|why|when|where|who|which|can|could|would|should|is|are|do|does|did)\b",
        r"(tell me|explain|describe|show me|help me understand|walk me through)",
        r"(wondering|curious|want to know|like to know|interested in)",
    ]

    # Topic patterns that should trigger suggestions even without a question
    OPPORTUNITY_PATTERNS = [
        r"(need help|looking for|interested in|want to|trying to|struggling with)",
        r"(our (current|existing) (infrastructure|system|platform|setup))",
        r"(pain point|challenge|problem|issue|difficulty|bottleneck)",
        r"(migrate|migration|modernize|modernization|transform|transformation)",
        r"(kubernetes|k8s|containers|docker|cloud|aws|azure|gcp)",
        r"(ai|artificial intelligence|machine learning|ml|mlops|genai|generative)",
        r"(cost|expensive|budget|spending|optimize|savings)",
        r"(security|compliance|soc|hipaa|gdpr|vulnerability)",
        r"(devops|ci/?cd|deployment|infrastructure.as.code|terraform)",
        r"(data (pipeline|engineering|warehouse|lake)|analytics|databricks|snowflake)",
        r"(legacy|monolith|technical debt|outdated|old system)",
    ]

    # Question type classification patterns
    QUESTION_TYPE_PATTERNS = {
        QuestionType.PRICING: [
            r"(price|pricing|cost|budget|expensive|cheap|afford|pay|fee|subscription|license)",
            r"(how much|what.*cost|pricing model|payment)",
        ],
        QuestionType.TECHNICAL: [
            r"(api|sdk|integration|architecture|infrastructure|scalab|perform|latency)",
            r"(technical|technology|stack|framework|language|database|cloud)",
            r"(kubernetes|docker|aws|azure|gcp|terraform|ci/cd|devops)",
        ],
        QuestionType.SECURITY: [
            r"(security|secure|encrypt|compliance|gdpr|hipaa|soc|iso|audit)",
            r"(authentication|authorization|permission|access control|sso|mfa)",
        ],
        QuestionType.COMPARISON: [
            r"(compare|comparison|versus|vs\.|differ|better|worse|alternative)",
            r"(competitor|similar|like.*other|choose between)",
        ],
        QuestionType.TIMELINE: [
            r"(timeline|deadline|time|when|how long|duration|schedule)",
            r"(implement|deploy|rollout|migration|onboard)",
        ],
        QuestionType.INTEGRATION: [
            r"(integrate|integration|connect|compatible|work with|support)",
            r"(plugin|extension|addon|api|webhook|sync)",
        ],
        QuestionType.SUPPORT: [
            r"(support|help|assistance|service|sla|uptime|guarantee)",
            r"(customer success|onboarding|training|documentation)",
        ],
    }

    def __init__(self) -> None:
        self.api_key = settings.gemini_api_key
        self.model = settings.gemini_model
        self.max_tokens = settings.max_response_tokens
        self.temperature = settings.temperature

        self._client = None
        self._model_instance = None
        self._conversation_context: list[dict] = []
        self._max_context_turns = 10

        logger.info(
            f"AgentService initialized - model: {self.model}, "
            f"max_tokens: {self.max_tokens}, temperature: {self.temperature}"
        )

        # Initialize client
        self._initialize_client()

    def _initialize_client(self) -> None:
        """Initialize the Google GenAI client."""
        if not self.api_key:
            logger.warning("Gemini API key not configured - AI suggestions disabled")
            return

        try:
            from google import genai
            from google.genai import types

            # Create client with API key
            self._client = genai.Client(api_key=self.api_key)

            logger.info("Gemini client initialized successfully")

        except ImportError:
            logger.error(
                "google-genai not installed. Run: pip install google-genai>=1.0.0"
            )
        except Exception as e:
            logger.error(f"Failed to initialize Gemini client: {e}")

    def is_question(self, text: str) -> bool:
        """
        Detect if the given text is a question worth responding to.

        Args:
            text: Transcript text to analyze.

        Returns:
            True if the text appears to be a meaningful question.
        """
        if not text:
            return False

        text_lower = text.lower().strip()

        # Skip very short utterances
        words = text_lower.split()
        if len(words) < 3:
            return False

        # Skip common non-questions
        non_question_starters = [
            "okay",
            "ok",
            "sure",
            "yes",
            "no",
            "right",
            "absolutely",
            "definitely",
            "thank",
            "thanks",
            "great",
            "good",
            "perfect",
            "exactly",
            "i see",
            "i understand",
            "got it",
            "makes sense",
        ]
        for starter in non_question_starters:
            if text_lower.startswith(starter):
                return False

        # Check against question patterns
        for pattern in self.QUESTION_PATTERNS:
            if re.search(pattern, text_lower, re.IGNORECASE):
                return True

        # Also check for opportunity patterns (topics worth responding to)
        for pattern in self.OPPORTUNITY_PATTERNS:
            if re.search(pattern, text_lower, re.IGNORECASE):
                logger.debug(f"Detected opportunity topic: {text[:50]}...")
                return True

        return False

    def classify_question(self, text: str) -> QuestionType:
        """
        Classify the type of question being asked.

        Args:
            text: The question text.

        Returns:
            The classified question type.
        """
        text_lower = text.lower()

        for q_type, patterns in self.QUESTION_TYPE_PATTERNS.items():
            for pattern in patterns:
                if re.search(pattern, text_lower, re.IGNORECASE):
                    return q_type

        return QuestionType.GENERAL

    def add_context(self, speaker: str, text: str, is_question: bool = False) -> None:
        """
        Add conversation context for better suggestions.

        Args:
            speaker: The speaker identifier.
            text: The spoken text.
            is_question: Whether this is a question.
        """
        self._conversation_context.append(
            {
                "speaker": speaker,
                "text": text,
                "is_question": is_question,
                "timestamp": datetime.utcnow().isoformat(),
            }
        )

        # Keep context limited
        if len(self._conversation_context) > self._max_context_turns:
            self._conversation_context = self._conversation_context[-self._max_context_turns:]

    def clear_context(self) -> None:
        """Clear the conversation context."""
        self._conversation_context.clear()

    async def generate_suggestion(
        self,
        question: str,
        speaker: Optional[str] = None,
        rag_context: Optional[str] = None,
        use_rag: bool = True,
    ) -> Optional[Suggestion]:
        """
        Generate a response suggestion for the given question.

        Args:
            question: The customer's question.
            speaker: The speaker who asked the question.
            rag_context: Optional pre-fetched context from RAG/knowledge base.
            use_rag: Whether to retrieve RAG context if not provided (default True).

        Returns:
            Suggestion with response text and metadata, or None if generation failed.
        """
        if not question:
            return None

        # Classify the question
        question_type = self.classify_question(question)

        # Add to context
        self.add_context(speaker or "Customer", question, is_question=True)

        # Retrieve RAG context if not provided and RAG is enabled
        if rag_context is None and use_rag:
            rag_context = await self._retrieve_rag_context(question)

        if not self._client:
            # Return mock suggestion for development without API key
            logger.debug("Returning mock suggestion (no API key configured)")
            return Suggestion(
                text=self._generate_mock_response(question, question_type),
                confidence=0.5,
                question_type=question_type,
                source="mock",
            )

        try:
            from google.genai import types

            # Build the prompt
            prompt = self._build_prompt(question, question_type, rag_context)

            # Configure generation parameters
            config = types.GenerateContentConfig(
                max_output_tokens=self.max_tokens,
                temperature=self.temperature,
                top_p=0.95,
                top_k=40,
            )

            # Generate response
            response = self._client.models.generate_content(
                model=self.model,
                contents=prompt,
                config=config,
            )

            if response and response.text:
                # Extract key points from the response
                key_points = self._extract_key_points(response.text)

                return Suggestion(
                    text=response.text,
                    confidence=self._calculate_confidence(response),
                    question_type=question_type,
                    source="gemini",
                    key_points=key_points,
                )

        except Exception as e:
            logger.error(f"Failed to generate suggestion: {e}")
            # Fall back to mock response on API failure
            logger.info("Falling back to mock response")
            return Suggestion(
                text=self._generate_mock_response(question, question_type),
                confidence=0.5,
                question_type=question_type,
                source="mock (API error)",
            )

        return None

    async def generate_suggestion_stream(
        self,
        question: str,
        speaker: Optional[str] = None,
        rag_context: Optional[str] = None,
    ):
        """
        Generate a response suggestion with streaming output.

        Args:
            question: The customer's question.
            speaker: The speaker who asked the question.
            rag_context: Optional context from RAG/knowledge base.

        Yields:
            Text chunks as they are generated.
        """
        if not self._client:
            yield self._generate_mock_response(
                question, self.classify_question(question)
            )
            return

        try:
            from google.genai import types

            question_type = self.classify_question(question)
            prompt = self._build_prompt(question, question_type, rag_context)

            config = types.GenerateContentConfig(
                max_output_tokens=self.max_tokens,
                temperature=self.temperature,
                top_p=0.95,
                top_k=40,
            )

            # Stream the response
            for chunk in self._client.models.generate_content_stream(
                model=self.model,
                contents=prompt,
                config=config,
            ):
                if chunk.text:
                    yield chunk.text

        except Exception as e:
            logger.error(f"Error in streaming generation: {e}")
            yield f"[Error generating response: {e}]"

    def _build_prompt(
        self,
        question: str,
        question_type: QuestionType,
        rag_context: Optional[str] = None,
    ) -> str:
        """
        Build the prompt for Gemini including system instructions and context.

        Args:
            question: The customer's question.
            question_type: The classified question type.
            rag_context: Optional context from knowledge base.

        Returns:
            The complete prompt string.
        """
        system_prompt = """You are TAMMY, the AI Technical Account Manager for CloudGeometry. You assist NON-TECHNICAL sales reps during live customer calls by providing real-time technical guidance.

ABOUT CLOUDGEOMETRY:
CloudGeometry is an AWS Advanced Consulting Partner and CNCF Kubernetes Certified Service Provider based in Sunnyvale, CA. We help enterprises modernize their infrastructure and adopt AI.

CORE SERVICES:
1. Application Modernization - Legacy to cloud-native transformation, containerization, API modernization
2. Cloud-Native & Kubernetes - K8s adoption, cloud migration, infrastructure-as-code
3. AI, Data & MLOps - AI transformation, GenAI development, data pipelines, AI agents
4. Managed CloudOps - 24/7 support across AWS, Azure, GCP with AI-driven optimization
5. Cloud Cost Optimization - FinOps, 50%+ compute savings possible
6. Security - DevSecOps, compliance (SOC 2, ISO 27001), vulnerability management

OUR PRODUCTS:
- CGDevX: Kubernetes-native delivery platform (50%+ compute savings, 90% DevOps reduction)
- LangBuilder: AI agent platform for enterprise automation
- ActionBridge: Open-source AI agent for HR, IT, Finance automation

KEY CLIENTS: Sinclair Broadcast Group, Tetra Science, Gemini Health, Ryder, Symphony

YOUR ROLE:
Help the sales rep by providing:
1. TECHNICAL ANSWERS when customers ask technical questions
2. SMART QUESTIONS TO ASK to qualify the customer and uncover needs
3. OBJECTION HANDLERS when customers push back
4. RELEVANT INFO when customers mention topics (AI, cloud, Kubernetes, etc.)

WHEN CUSTOMER ASKS A QUESTION: Provide a clear answer with talking points.
WHEN CUSTOMER STATES A NEED/TOPIC: Provide relevant info + suggest discovery questions.

CRITICAL RULES:
1. Be EXTREMELY CONCISE - rep needs to glance during live call
2. Use 2-4 bullet points MAX
3. Start with the most important point first
4. Use simple language the rep can repeat verbatim
5. If customer mentions a pain point, suggest a follow-up question
6. NEVER make up specific pricing - say "custom quote based on scope"

RESPONSE FORMAT:
📌 [One-line answer or suggestion]
• Talking point 1
• Talking point 2
• Talking point 3
💬 Suggest asking: "[follow-up question]"

QUESTION TYPE GUIDELINES:"""

        # Add type-specific guidance
        type_guidance = {
            QuestionType.PRICING: """
For PRICING questions:
- Say "Pricing is custom based on scope - we'll provide a detailed proposal"
- Emphasize ROI: "Clients typically see 50%+ compute savings with CGDevX"
- Mention flexible models: time & materials, fixed price, managed services
- Ask: "What's your current monthly cloud spend?" to qualify""",
            QuestionType.TECHNICAL: """
For TECHNICAL questions:
- Keep it simple for the sales rep to repeat
- Reference our AWS Advanced Partner and CNCF K8s certification
- Mention we work across AWS, Azure, GCP
- If too complex: "Let's schedule a call with our solutions architect"
- Common answers: K8s, Terraform, CI/CD, containerization, microservices""",
            QuestionType.SECURITY: """
For SECURITY questions:
- We help clients achieve SOC 2, ISO 27001, HIPAA compliance
- DevSecOps pipeline integration (Snyk, Trivy, SonarQube)
- Runtime protection for K8s workloads
- "We can share our security approach document"
- Ask: "What compliance requirements do you need to meet?" """,
            QuestionType.COMPARISON: """
For COMPARISON questions:
- Don't trash competitors, focus on CG strengths
- Key differentiators: hands-on engineering (not just consulting), open-source products
- AWS Advanced Partner + CNCF certified = proven expertise
- "We're happy to do a proof-of-concept to demonstrate value"
- Ask: "What's been your experience with [competitor]?" """,
            QuestionType.TIMELINE: """
For TIMELINE questions:
- Discovery/assessment: 2-4 weeks
- Migration projects: varies by scope, typically 3-6 months
- "We'll give you a realistic timeline after scoping"
- Mention our 24/7 managed services for ongoing support
- Ask: "What's driving your timeline? Any hard deadlines?" """,
            QuestionType.INTEGRATION: """
For INTEGRATION questions:
- We integrate with all major cloud platforms (AWS, Azure, GCP)
- Data platforms: Databricks, Snowflake, Redshift
- CI/CD: GitHub Actions, GitLab, Jenkins
- Monitoring: Datadog, New Relic
- Ask: "What's your current tech stack?" to understand needs""",
            QuestionType.SUPPORT: """
For SUPPORT questions:
- 24/7 Managed CloudOps available
- Dedicated customer success engineering
- Training and onboarding included
- SLAs customized to your needs
- Ask: "What level of support does your team need?" """,
            QuestionType.GENERAL: """
For GENERAL questions:
- Connect to CloudGeometry's expertise: "We've done this for clients like [Sinclair, Ryder]"
- Focus on outcomes not features
- If opportunity: pivot to discovery question
- Keep it conversational and helpful""",
        }

        full_prompt = system_prompt + type_guidance.get(question_type, "")

        # Add conversation context if available
        if self._conversation_context:
            context_text = "\n\nRECENT CONVERSATION:\n"
            for turn in self._conversation_context[-5:]:  # Last 5 turns
                context_text += f"[{turn['speaker']}]: {turn['text']}\n"
            full_prompt += context_text

        # Add RAG context if available
        if rag_context:
            full_prompt += f"""

RELEVANT INFORMATION FROM KNOWLEDGE BASE:
{rag_context}

Use this information to provide accurate, specific answers. Cite specific details when relevant."""

        # Add the actual question
        full_prompt += f"""

CUSTOMER QUESTION: "{question}"

Provide a helpful response for the presales consultant to use:"""

        return full_prompt

    def _generate_mock_response(
        self, question: str, question_type: QuestionType
    ) -> str:
        """Generate a mock response for development without API key."""
        mock_responses = {
            QuestionType.PRICING: """📌 Pricing is custom based on project scope

• We offer T&M, fixed price, or managed services models
• Clients typically see 50%+ compute savings with CGDevX
• ROI usually within 6-12 months

💬 Ask: "What's your current monthly cloud spend?" """,

            QuestionType.TECHNICAL: """📌 We're AWS Advanced Partners and CNCF K8s certified

• Full stack: Kubernetes, Terraform, CI/CD, microservices
• Work across AWS, Azure, and GCP
• Hands-on engineering, not just consulting

💬 Ask: "What does your current infrastructure look like?" """,

            QuestionType.SECURITY: """📌 We help clients meet SOC 2, ISO 27001, HIPAA

• DevSecOps pipeline integration (Snyk, Trivy)
• Runtime protection for Kubernetes workloads
• Regular security audits and compliance reviews

💬 Ask: "What compliance requirements do you need to meet?" """,

            QuestionType.COMPARISON: """📌 CloudGeometry = hands-on engineering expertise

• Not just consultants - we build and run infrastructure
• Open-source products: CGDevX, LangBuilder, ActionBridge
• AWS Advanced + CNCF certified = proven track record

💬 Ask: "What's been your experience with your current provider?" """,

            QuestionType.TIMELINE: """📌 Timeline depends on scope - we'll give you a realistic estimate

• Discovery/assessment: 2-4 weeks
• Migration projects: typically 3-6 months
• We offer 24/7 managed services for ongoing support

💬 Ask: "What's driving your timeline?" """,

            QuestionType.INTEGRATION: """📌 We integrate with your existing stack

• All major clouds: AWS, Azure, GCP
• Data platforms: Databricks, Snowflake, Redshift
• CI/CD: GitHub Actions, GitLab, Jenkins

💬 Ask: "What's your current tech stack?" """,

            QuestionType.SUPPORT: """📌 We offer 24/7 Managed CloudOps

• Dedicated customer success engineering
• Training and onboarding included
• SLAs customized to your needs

💬 Ask: "What level of support does your team need?" """,

            QuestionType.GENERAL: """📌 CloudGeometry helps enterprises modernize and adopt AI

• Clients: Sinclair, Ryder, Tetra Science, Gemini Health
• Services: App modernization, K8s, AI/MLOps, CloudOps
• Open-source products: CGDevX, LangBuilder

💬 Ask: "What's your biggest infrastructure challenge right now?" """,
        }

        return mock_responses.get(
            question_type,
            f"📌 Let me help with that\n\n[Configure GEMINI_API_KEY for AI-powered suggestions]\n\n💬 Ask: \"Can you tell me more about that?\"",
        )

    def _extract_key_points(self, text: str) -> list[str]:
        """Extract key bullet points from the response text."""
        key_points = []

        # Look for bullet points
        lines = text.split("\n")
        for line in lines:
            line = line.strip()
            # Match common bullet patterns
            if line.startswith(("-", "*", "+")):
                point = line.lstrip("-*+ ").strip()
                if point and len(point) > 10:
                    key_points.append(point)

        return key_points[:5]  # Return top 5 points

    def _calculate_confidence(self, response: Any) -> float:
        """
        Calculate a confidence score for the response.

        This is a simplified heuristic. In production, you might use:
        - Response length appropriateness
        - Presence of specific product knowledge
        - Sentiment analysis
        - Token probability scores if available
        """
        if not response or not response.text:
            return 0.0

        text = response.text
        confidence = 0.7  # Base confidence

        # Increase confidence for structured responses
        if any(marker in text for marker in ["**", "- ", "* "]):
            confidence += 0.1

        # Increase for reasonable length
        word_count = len(text.split())
        if 50 <= word_count <= 300:
            confidence += 0.1

        # Decrease for uncertainty markers
        uncertainty_markers = [
            "i'm not sure",
            "i don't know",
            "might be",
            "possibly",
            "unclear",
        ]
        if any(marker in text.lower() for marker in uncertainty_markers):
            confidence -= 0.2

        return min(max(confidence, 0.0), 1.0)

    def get_conversation_summary(self) -> str:
        """Get a summary of the conversation context."""
        if not self._conversation_context:
            return "No conversation context available."

        summary = f"Conversation: {len(self._conversation_context)} turns\n"
        questions = [
            turn for turn in self._conversation_context if turn.get("is_question")
        ]
        summary += f"Questions asked: {len(questions)}\n"

        if questions:
            summary += "Recent questions:\n"
            for q in questions[-3:]:
                summary += f"  - {q['text'][:50]}...\n"

        return summary

    async def _retrieve_rag_context(self, question: str) -> Optional[str]:
        """
        Retrieve relevant context from the RAG knowledge base.

        Args:
            question: The question to retrieve context for.

        Returns:
            Formatted context string or None if retrieval failed.
        """
        retriever = get_rag_retriever()
        if retriever is None:
            logger.debug("RAG retriever not available, skipping context retrieval")
            return None

        try:
            result = await retriever.retrieve(question)

            if result.has_relevant_content:
                logger.info(
                    f"RAG retrieved {len(result.chunks)} chunks "
                    f"(top_score={result.top_score:.3f})"
                )
                return result.context_text
            else:
                logger.debug("No relevant RAG context found for question")
                return None

        except Exception as e:
            logger.error(f"RAG retrieval failed: {e}")
            return None

    async def generate_suggestion_with_rag(
        self,
        question: str,
        speaker: Optional[str] = None,
    ) -> tuple[Optional[Suggestion], Optional[dict]]:
        """
        Generate a suggestion with RAG context retrieval.

        This method explicitly retrieves RAG context and returns
        both the suggestion and the retrieval metadata.

        Args:
            question: The customer's question.
            speaker: The speaker who asked the question.

        Returns:
            Tuple of (Suggestion, retrieval_metadata) where metadata
            includes information about the RAG retrieval.
        """
        retriever = get_rag_retriever()
        retrieval_metadata = None

        if retriever is not None:
            try:
                result = await retriever.retrieve(question)
                retrieval_metadata = {
                    "has_relevant_content": result.has_relevant_content,
                    "num_chunks": len(result.chunks),
                    "top_score": result.top_score,
                    "average_score": result.average_score,
                    "sources": [
                        {
                            "title": chunk.metadata.get("title", "Unknown"),
                            "score": chunk.score,
                        }
                        for chunk in result.chunks
                    ],
                }

                rag_context = result.context_text if result.has_relevant_content else None

            except Exception as e:
                logger.error(f"RAG retrieval failed: {e}")
                rag_context = None
                retrieval_metadata = {"error": str(e)}
        else:
            rag_context = None

        suggestion = await self.generate_suggestion(
            question=question,
            speaker=speaker,
            rag_context=rag_context,
            use_rag=False,  # Already retrieved
        )

        return suggestion, retrieval_metadata
