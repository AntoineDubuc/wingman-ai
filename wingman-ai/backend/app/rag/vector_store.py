"""
Vector Store Module

Provides ChromaDB integration for local development vector storage.
Implements an abstract VectorStore interface for future production backends (e.g., Pinecone).
"""

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

import chromadb
from chromadb.config import Settings as ChromaSettings

from app.config import settings

logger = logging.getLogger(__name__)


@dataclass
class VectorSearchResult:
    """Result from a vector similarity search."""

    id: str
    content: str
    metadata: Dict[str, Any]
    score: float  # Similarity score (higher = more similar)


@dataclass
class EmbeddingConfig:
    """Configuration for embedding generation."""

    model: str = "gemini-embedding-001"
    dimensions: int = 3072  # gemini-embedding-001 produces 3072-dim vectors
    batch_size: int = 100


class VectorStore(ABC):
    """
    Abstract base class for vector stores.

    Provides a consistent interface for different vector database backends
    (ChromaDB for development, Pinecone for production).
    """

    @abstractmethod
    async def add_documents(
        self,
        ids: List[str],
        embeddings: List[List[float]],
        contents: List[str],
        metadatas: Optional[List[Dict[str, Any]]] = None,
    ) -> None:
        """
        Add documents to the vector store.

        Args:
            ids: Unique identifiers for each document.
            embeddings: Vector embeddings for each document.
            contents: Text content of each document.
            metadatas: Optional metadata dictionaries for each document.
        """
        pass

    @abstractmethod
    async def search(
        self,
        query_embedding: List[float],
        top_k: int = 4,
        filter_metadata: Optional[Dict[str, Any]] = None,
    ) -> List[VectorSearchResult]:
        """
        Search for similar documents.

        Args:
            query_embedding: The query vector to search for.
            top_k: Number of results to return.
            filter_metadata: Optional metadata filters.

        Returns:
            List of search results ordered by similarity (highest first).
        """
        pass

    @abstractmethod
    async def delete_documents(self, ids: List[str]) -> None:
        """
        Delete documents from the vector store.

        Args:
            ids: List of document IDs to delete.
        """
        pass

    @abstractmethod
    async def get_document_count(self) -> int:
        """
        Get the total number of documents in the store.

        Returns:
            Number of documents.
        """
        pass

    @abstractmethod
    async def clear(self) -> None:
        """Clear all documents from the vector store."""
        pass


class ChromaVectorStore(VectorStore):
    """
    ChromaDB-based vector store for local development.

    Uses persistent storage for data durability across restarts.
    Implements cosine similarity search with metadata filtering.
    """

    def __init__(
        self,
        collection_name: Optional[str] = None,
        persist_directory: Optional[str] = None,
    ) -> None:
        """
        Initialize the ChromaDB vector store.

        Args:
            collection_name: Name of the ChromaDB collection.
            persist_directory: Directory for persistent storage.
        """
        self.collection_name = collection_name or settings.rag_collection_name
        self.persist_directory = persist_directory or settings.chroma_persist_directory

        # Ensure persist directory exists
        persist_path = Path(self.persist_directory)
        persist_path.mkdir(parents=True, exist_ok=True)

        # Initialize ChromaDB client with persistence
        self._client = chromadb.PersistentClient(
            path=str(persist_path),
            settings=ChromaSettings(
                anonymized_telemetry=False,
                allow_reset=True,
            ),
        )

        # Get or create the collection
        # Using cosine similarity as it works well with normalized embeddings
        self._collection = self._client.get_or_create_collection(
            name=self.collection_name,
            metadata={"hnsw:space": "cosine"},
        )

        logger.info(
            f"ChromaDB initialized: collection='{self.collection_name}', "
            f"persist_dir='{self.persist_directory}', "
            f"document_count={self._collection.count()}"
        )

    async def add_documents(
        self,
        ids: List[str],
        embeddings: List[List[float]],
        contents: List[str],
        metadatas: Optional[List[Dict[str, Any]]] = None,
    ) -> None:
        """
        Add documents to the ChromaDB collection.

        Args:
            ids: Unique identifiers for each document chunk.
            embeddings: Pre-computed embeddings for each chunk.
            contents: Text content of each chunk.
            metadatas: Optional metadata for each chunk.
        """
        if not ids:
            logger.warning("No documents to add")
            return

        if len(ids) != len(embeddings) or len(ids) != len(contents):
            raise ValueError("ids, embeddings, and contents must have the same length")

        # Prepare metadata (ChromaDB requires non-None metadata)
        if metadatas is None:
            metadatas = [{} for _ in ids]

        # Sanitize metadata - ChromaDB only supports str, int, float, bool
        sanitized_metadatas = []
        for meta in metadatas:
            sanitized = {}
            for key, value in meta.items():
                if isinstance(value, (str, int, float, bool)):
                    sanitized[key] = value
                elif value is None:
                    sanitized[key] = ""
                else:
                    sanitized[key] = str(value)
            sanitized_metadatas.append(sanitized)

        try:
            # Upsert to handle potential duplicates
            self._collection.upsert(
                ids=ids,
                embeddings=embeddings,
                documents=contents,
                metadatas=sanitized_metadatas,
            )
            logger.info(f"Added {len(ids)} documents to collection '{self.collection_name}'")

        except Exception as e:
            logger.error(f"Failed to add documents to ChromaDB: {e}")
            raise

    async def search(
        self,
        query_embedding: List[float],
        top_k: int = 4,
        filter_metadata: Optional[Dict[str, Any]] = None,
    ) -> List[VectorSearchResult]:
        """
        Search for similar documents using cosine similarity.

        Args:
            query_embedding: The query vector.
            top_k: Maximum number of results to return.
            filter_metadata: Optional metadata filters (ChromaDB where clause).

        Returns:
            List of search results with similarity scores.
        """
        try:
            # Build query parameters
            query_params = {
                "query_embeddings": [query_embedding],
                "n_results": min(top_k, self._collection.count() or 1),
                "include": ["documents", "metadatas", "distances"],
            }

            # Add metadata filter if provided
            if filter_metadata:
                query_params["where"] = filter_metadata

            results = self._collection.query(**query_params)

            # Convert ChromaDB results to VectorSearchResult objects
            # ChromaDB returns cosine distance (0 = identical, 2 = opposite)
            # Convert to similarity score (1 = identical, 0 = orthogonal, -1 = opposite)
            search_results = []

            if results["ids"] and results["ids"][0]:
                for i, doc_id in enumerate(results["ids"][0]):
                    distance = results["distances"][0][i] if results["distances"] else 0.0
                    # Convert cosine distance to similarity: similarity = 1 - distance
                    similarity = 1.0 - (distance / 2.0)  # Normalize to [0, 1]

                    search_results.append(
                        VectorSearchResult(
                            id=doc_id,
                            content=results["documents"][0][i] if results["documents"] else "",
                            metadata=results["metadatas"][0][i] if results["metadatas"] else {},
                            score=similarity,
                        )
                    )

            logger.debug(f"Search returned {len(search_results)} results")
            return search_results

        except Exception as e:
            logger.error(f"Search failed: {e}")
            return []

    async def delete_documents(self, ids: List[str]) -> None:
        """
        Delete documents from the collection.

        Args:
            ids: List of document IDs to delete.
        """
        if not ids:
            return

        try:
            self._collection.delete(ids=ids)
            logger.info(f"Deleted {len(ids)} documents from collection '{self.collection_name}'")

        except Exception as e:
            logger.error(f"Failed to delete documents: {e}")
            raise

    async def get_document_count(self) -> int:
        """
        Get the number of documents in the collection.

        Returns:
            Document count.
        """
        return self._collection.count()

    async def clear(self) -> None:
        """Clear all documents from the collection."""
        try:
            # Delete and recreate the collection
            self._client.delete_collection(self.collection_name)
            self._collection = self._client.create_collection(
                name=self.collection_name,
                metadata={"hnsw:space": "cosine"},
            )
            logger.info(f"Cleared collection '{self.collection_name}'")

        except Exception as e:
            logger.error(f"Failed to clear collection: {e}")
            raise

    def get_collection_stats(self) -> Dict[str, Any]:
        """
        Get statistics about the collection.

        Returns:
            Dictionary with collection statistics.
        """
        return {
            "collection_name": self.collection_name,
            "document_count": self._collection.count(),
            "persist_directory": self.persist_directory,
        }


class EmbeddingGenerator:
    """
    Generates embeddings using Google's Gemini embedding model.

    Uses the gemini-embedding-001 model which produces 3072-dimensional vectors.
    """

    def __init__(self, config: Optional[EmbeddingConfig] = None) -> None:
        """
        Initialize the embedding generator.

        Args:
            config: Optional embedding configuration.
        """
        self.config = config or EmbeddingConfig(model=settings.embedding_model)
        self._client = None
        self._initialize_client()

    def _initialize_client(self) -> None:
        """Initialize the Google GenAI client for embeddings."""
        if not settings.gemini_api_key:
            logger.warning("Gemini API key not configured - embeddings will not be available")
            return

        try:
            from google import genai

            self._client = genai.Client(api_key=settings.gemini_api_key)
            logger.info(f"Embedding generator initialized with model: {self.config.model}")

        except ImportError:
            logger.error("google-genai not installed. Install with: pip install google-genai")
        except Exception as e:
            logger.error(f"Failed to initialize embedding client: {e}")

    async def embed_text(self, text: str) -> Optional[List[float]]:
        """
        Generate an embedding for a single text.

        Args:
            text: Text to embed.

        Returns:
            Embedding vector or None if generation failed.
        """
        if not self._client:
            logger.error("Embedding client not initialized")
            return None

        try:
            result = self._client.models.embed_content(
                model=self.config.model,
                contents=text,
            )

            # Extract embedding from response
            if result.embeddings and len(result.embeddings) > 0:
                return result.embeddings[0].values

            logger.warning("No embedding returned from API")
            return None

        except Exception as e:
            logger.error(f"Failed to generate embedding: {e}")
            return None

    async def embed_texts(self, texts: List[str]) -> List[Optional[List[float]]]:
        """
        Generate embeddings for multiple texts.

        Processes texts in batches for efficiency.

        Args:
            texts: List of texts to embed.

        Returns:
            List of embedding vectors (None for failed embeddings).
        """
        if not self._client:
            logger.error("Embedding client not initialized")
            return [None] * len(texts)

        embeddings = []
        batch_size = self.config.batch_size

        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]
            batch_embeddings = []

            for text in batch:
                embedding = await self.embed_text(text)
                batch_embeddings.append(embedding)

            embeddings.extend(batch_embeddings)

            if i + batch_size < len(texts):
                logger.debug(f"Processed {i + batch_size}/{len(texts)} embeddings")

        logger.info(f"Generated {len([e for e in embeddings if e])} embeddings out of {len(texts)} texts")
        return embeddings


# Factory function for creating vector stores
def create_vector_store(
    store_type: str = "chroma",
    **kwargs: Any,
) -> VectorStore:
    """
    Factory function to create a vector store instance.

    Args:
        store_type: Type of vector store ("chroma" or "pinecone").
        **kwargs: Additional arguments passed to the store constructor.

    Returns:
        VectorStore instance.

    Raises:
        ValueError: If store_type is not supported.
    """
    if store_type == "chroma":
        return ChromaVectorStore(**kwargs)
    elif store_type == "pinecone":
        # TODO: Implement PineconeVectorStore for production
        raise NotImplementedError("Pinecone vector store not yet implemented")
    else:
        raise ValueError(f"Unsupported vector store type: {store_type}")


# Global singleton for easy access
_vector_store: Optional[VectorStore] = None
_embedding_generator: Optional[EmbeddingGenerator] = None


def get_vector_store() -> VectorStore:
    """
    Get the global vector store instance.

    Creates a new ChromaDB store if not already initialized.

    Returns:
        VectorStore instance.
    """
    global _vector_store
    if _vector_store is None:
        _vector_store = ChromaVectorStore()
    return _vector_store


def get_embedding_generator() -> EmbeddingGenerator:
    """
    Get the global embedding generator instance.

    Returns:
        EmbeddingGenerator instance.
    """
    global _embedding_generator
    if _embedding_generator is None:
        _embedding_generator = EmbeddingGenerator()
    return _embedding_generator
