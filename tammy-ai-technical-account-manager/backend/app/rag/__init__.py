"""
RAG (Retrieval-Augmented Generation) Pipeline

This package provides the knowledge retrieval infrastructure for the Presales AI Assistant.

Modules:
    - vector_store: ChromaDB integration for vector storage and similarity search
    - ingestion: Document processing and chunking pipeline
    - retriever: Query processing and context injection for LLM prompts
    - cli: Command-line interface for knowledge base management

Usage:
    # Programmatic usage
    from app.rag import RAGRetriever, DocumentIngestionPipeline

    # Initialize knowledge base
    pipeline = DocumentIngestionPipeline()
    await pipeline.ingest_directory("./data/knowledge")

    # Query for relevant context
    retriever = RAGRetriever()
    result = await retriever.retrieve("What cloud platforms do you support?")

    # CLI usage (from backend directory)
    python -m app.rag.cli ingest --dir ./data/knowledge
    python -m app.rag.cli query "What is your pricing model?"
    python -m app.rag.cli stats
"""

from app.rag.vector_store import (
    ChromaVectorStore,
    VectorStore,
    VectorSearchResult,
    EmbeddingGenerator,
    EmbeddingConfig,
    get_vector_store,
    get_embedding_generator,
    create_vector_store,
)
from app.rag.ingestion import (
    DocumentIngestionPipeline,
    Document,
    Chunk,
    TextChunker,
    MarkdownProcessor,
    ingest_knowledge_base,
)
from app.rag.retriever import (
    RAGRetriever,
    RetrievalResult,
    ContextInjector,
    get_retriever,
    retrieve_context,
)

__all__ = [
    # Vector Store
    "VectorStore",
    "ChromaVectorStore",
    "VectorSearchResult",
    "EmbeddingGenerator",
    "EmbeddingConfig",
    "get_vector_store",
    "get_embedding_generator",
    "create_vector_store",
    # Ingestion
    "DocumentIngestionPipeline",
    "Document",
    "Chunk",
    "TextChunker",
    "MarkdownProcessor",
    "ingest_knowledge_base",
    # Retriever
    "RAGRetriever",
    "RetrievalResult",
    "ContextInjector",
    "get_retriever",
    "retrieve_context",
]
