"""
RAG Retriever Module

Handles query processing, semantic search, relevance filtering,
and context injection for LLM prompts.
"""

import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from app.config import settings
from app.rag.vector_store import (
    EmbeddingGenerator,
    VectorSearchResult,
    VectorStore,
    get_embedding_generator,
    get_vector_store,
)

logger = logging.getLogger(__name__)


@dataclass
class RetrievalResult:
    """
    Result from the RAG retrieval pipeline.
    """

    query: str
    chunks: List[VectorSearchResult]
    context_text: str
    has_relevant_content: bool
    relevance_scores: List[float]
    metadata: Dict[str, Any] = field(default_factory=dict)

    @property
    def top_score(self) -> float:
        """Get the highest relevance score."""
        return max(self.relevance_scores) if self.relevance_scores else 0.0

    @property
    def average_score(self) -> float:
        """Get the average relevance score."""
        if not self.relevance_scores:
            return 0.0
        return sum(self.relevance_scores) / len(self.relevance_scores)


class RAGRetriever:
    """
    RAG (Retrieval-Augmented Generation) retriever.

    Processes queries, retrieves relevant document chunks from the vector store,
    filters by relevance, and formats context for LLM consumption.
    """

    def __init__(
        self,
        vector_store: Optional[VectorStore] = None,
        embedding_generator: Optional[EmbeddingGenerator] = None,
        top_k: int = 4,
        relevance_threshold: float = 0.7,
        max_context_tokens: int = 2000,
    ) -> None:
        """
        Initialize the RAG retriever.

        Args:
            vector_store: Vector store for document retrieval.
            embedding_generator: Generator for query embeddings.
            top_k: Number of results to retrieve (default: 4).
            relevance_threshold: Minimum similarity score to include (default: 0.7).
            max_context_tokens: Maximum tokens for context (approx 4 chars/token).
        """
        self.vector_store = vector_store or get_vector_store()
        self.embedding_generator = embedding_generator or get_embedding_generator()
        self.top_k = top_k
        self.relevance_threshold = relevance_threshold
        self.max_context_chars = max_context_tokens * 4

        logger.info(
            f"RAGRetriever initialized: top_k={top_k}, "
            f"relevance_threshold={relevance_threshold}"
        )

    async def retrieve(
        self,
        query: str,
        top_k: Optional[int] = None,
        relevance_threshold: Optional[float] = None,
        filter_metadata: Optional[Dict[str, Any]] = None,
    ) -> RetrievalResult:
        """
        Retrieve relevant context for a query.

        Args:
            query: The user's question or query.
            top_k: Override default top_k for this query.
            relevance_threshold: Override default threshold for this query.
            filter_metadata: Optional metadata filters.

        Returns:
            RetrievalResult with relevant chunks and formatted context.
        """
        k = top_k or self.top_k
        threshold = relevance_threshold or self.relevance_threshold

        # Preprocess query
        processed_query = self._preprocess_query(query)

        # Generate query embedding
        query_embedding = await self.embedding_generator.embed_text(processed_query)

        if query_embedding is None:
            logger.error("Failed to generate query embedding")
            return RetrievalResult(
                query=query,
                chunks=[],
                context_text="",
                has_relevant_content=False,
                relevance_scores=[],
                metadata={"error": "Failed to generate query embedding"},
            )

        # Search vector store
        results = await self.vector_store.search(
            query_embedding=query_embedding,
            top_k=k,
            filter_metadata=filter_metadata,
        )

        # Filter by relevance threshold
        relevant_results = [r for r in results if r.score >= threshold]

        # Log filtered results for monitoring
        filtered_count = len(results) - len(relevant_results)
        if filtered_count > 0:
            logger.debug(
                f"Filtered {filtered_count} results below threshold {threshold}"
            )

        # Format context for LLM
        context_text = self._format_context(relevant_results)
        relevance_scores = [r.score for r in relevant_results]

        result = RetrievalResult(
            query=query,
            chunks=relevant_results,
            context_text=context_text,
            has_relevant_content=len(relevant_results) > 0,
            relevance_scores=relevance_scores,
            metadata={
                "total_results": len(results),
                "filtered_results": len(relevant_results),
                "threshold_used": threshold,
                "top_k_used": k,
            },
        )

        logger.info(
            f"Retrieved {len(relevant_results)} relevant chunks for query "
            f"(top_score={result.top_score:.3f})"
        )

        return result

    def _preprocess_query(self, query: str) -> str:
        """
        Preprocess the query for better retrieval.

        Args:
            query: Raw query text.

        Returns:
            Preprocessed query.
        """
        # Basic normalization
        processed = query.strip()

        # Remove excessive whitespace
        processed = " ".join(processed.split())

        # Could add query expansion here in the future
        # e.g., synonym expansion, spelling correction

        return processed

    def _format_context(self, results: List[VectorSearchResult]) -> str:
        """
        Format retrieved chunks into context for LLM.

        Args:
            results: List of search results.

        Returns:
            Formatted context string.
        """
        if not results:
            return ""

        context_parts = []
        total_chars = 0

        for i, result in enumerate(results):
            # Format each chunk with source attribution
            title = result.metadata.get("title", "Unknown")
            source = result.metadata.get("source", result.id)

            chunk_header = f"[Source {i + 1}: {title}]"
            chunk_content = result.content.strip()

            # Check if adding this chunk would exceed limit
            chunk_text = f"{chunk_header}\n{chunk_content}"
            if total_chars + len(chunk_text) > self.max_context_chars:
                # Truncate to fit
                remaining = self.max_context_chars - total_chars - len(chunk_header) - 10
                if remaining > 100:  # Only add if meaningful amount
                    chunk_content = chunk_content[:remaining] + "..."
                    chunk_text = f"{chunk_header}\n{chunk_content}"
                    context_parts.append(chunk_text)
                break

            context_parts.append(chunk_text)
            total_chars += len(chunk_text) + 2  # +2 for separator

        return "\n\n---\n\n".join(context_parts)

    async def retrieve_and_format_prompt(
        self,
        query: str,
        system_prompt: str,
        top_k: Optional[int] = None,
        relevance_threshold: Optional[float] = None,
    ) -> tuple[str, RetrievalResult]:
        """
        Retrieve context and format a complete prompt for the LLM.

        Args:
            query: The user's question.
            system_prompt: Base system prompt.
            top_k: Optional override for top_k.
            relevance_threshold: Optional override for threshold.

        Returns:
            Tuple of (formatted_prompt, retrieval_result).
        """
        result = await self.retrieve(
            query=query,
            top_k=top_k,
            relevance_threshold=relevance_threshold,
        )

        # Build prompt with context injection
        prompt = self._build_prompt_with_context(query, system_prompt, result)

        return prompt, result

    def _build_prompt_with_context(
        self,
        query: str,
        system_prompt: str,
        result: RetrievalResult,
    ) -> str:
        """
        Build a complete prompt with injected context.

        Args:
            query: User's question.
            system_prompt: Base system prompt.
            result: Retrieval result with context.

        Returns:
            Complete prompt string.
        """
        if result.has_relevant_content:
            context_section = f"""
RELEVANT KNOWLEDGE BASE CONTENT:
================================
{result.context_text}
================================

Use the above knowledge base content to inform your response.
Cite specific information when relevant.
If the content doesn't fully address the question, acknowledge what you know and what may need follow-up.
"""
        else:
            context_section = """
NOTE: No directly relevant content was found in the knowledge base for this question.
Provide general guidance based on your training, but clearly indicate that you're
not drawing from the company's specific documentation. Suggest the consultant
offer to follow up with more specific information if needed.
"""

        user_prompt = f"""Customer question: "{query}"

{context_section}

Provide suggested talking points for the presales consultant:"""

        return f"{system_prompt}\n\n{user_prompt}"


class ContextInjector:
    """
    Utility class for injecting RAG context into various prompt templates.
    """

    # Context template markers
    CONTEXT_START = "{{CONTEXT_START}}"
    CONTEXT_END = "{{CONTEXT_END}}"
    QUERY_MARKER = "{{QUERY}}"

    @staticmethod
    def inject_context(
        template: str,
        context: str,
        query: str,
    ) -> str:
        """
        Inject context and query into a prompt template.

        Args:
            template: Prompt template with markers.
            context: Retrieved context to inject.
            query: User's query.

        Returns:
            Filled prompt string.
        """
        filled = template.replace(ContextInjector.QUERY_MARKER, query)

        # Handle context section
        if ContextInjector.CONTEXT_START in filled and ContextInjector.CONTEXT_END in filled:
            start_idx = filled.index(ContextInjector.CONTEXT_START)
            end_idx = filled.index(ContextInjector.CONTEXT_END) + len(ContextInjector.CONTEXT_END)

            if context:
                context_block = f"""
RELEVANT KNOWLEDGE BASE CONTENT:
{context}
"""
            else:
                context_block = "[No relevant knowledge base content found]"

            filled = filled[:start_idx] + context_block + filled[end_idx:]

        return filled

    @staticmethod
    def create_default_template() -> str:
        """
        Create the default prompt template for presales assistance.

        Returns:
            Default prompt template string.
        """
        return """You are an expert Technical Cloud Solutions Presales Consultant assistant.
Your role is to help the presales consultant respond to customer questions during live sales calls.

Guidelines:
- Provide concise, actionable talking points (3-5 bullet points max)
- Focus on value propositions and technical accuracy
- Never make up features, statistics, or capabilities
- If the knowledge base doesn't have specific information, acknowledge this
- Suggest the consultant offer to follow up if you're uncertain
- Keep responses brief - this is for real-time assistance

{{CONTEXT_START}}
{{CONTEXT_END}}

Customer question: "{{QUERY}}"

Format your response as bullet points that the consultant can quickly glance at:"""


# Global retriever instance
_retriever: Optional[RAGRetriever] = None


def get_retriever() -> RAGRetriever:
    """
    Get the global RAG retriever instance.

    Returns:
        RAGRetriever instance.
    """
    global _retriever
    if _retriever is None:
        _retriever = RAGRetriever()
    return _retriever


async def retrieve_context(query: str) -> RetrievalResult:
    """
    Convenience function to retrieve context for a query.

    Args:
        query: User's question.

    Returns:
        RetrievalResult with relevant context.
    """
    retriever = get_retriever()
    return await retriever.retrieve(query)
