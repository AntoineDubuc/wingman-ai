#!/usr/bin/env python3
"""
RAG Knowledge Base CLI

Command-line tool for managing the presales knowledge base.
Supports document ingestion, querying, and maintenance operations.

Usage:
    python -m app.rag.cli ingest --dir ./data/knowledge
    python -m app.rag.cli query "What cloud platforms do you support?"
    python -m app.rag.cli stats
    python -m app.rag.cli clear --confirm
"""

import argparse
import asyncio
import logging
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from app.config import settings
from app.rag.vector_store import ChromaVectorStore, get_embedding_generator
from app.rag.ingestion import DocumentIngestionPipeline, ingest_knowledge_base
from app.rag.retriever import RAGRetriever

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


async def cmd_ingest(args: argparse.Namespace) -> int:
    """Ingest documents into the knowledge base."""
    directory = args.dir or str(
        Path(__file__).parent.parent.parent.parent / "data" / "knowledge"
    )

    print(f"Ingesting documents from: {directory}")
    print("-" * 50)

    try:
        pipeline = DocumentIngestionPipeline(
            chunk_size=args.chunk_size,
            chunk_overlap=args.chunk_overlap,
        )

        stats = await pipeline.ingest_directory(
            directory,
            recursive=args.recursive,
        )

        print("\nIngestion Complete!")
        print("-" * 50)
        print(f"Directory: {stats['directory']}")
        print(f"Files found: {stats['files_found']}")
        print(f"Files processed: {stats['files_processed']}")
        print(f"Files failed: {stats['files_failed']}")
        print(f"Total chunks created: {stats['total_chunks']}")

        if stats['failed_files']:
            print("\nFailed files:")
            for f in stats['failed_files']:
                print(f"  - {f}")

        return 0

    except Exception as e:
        logger.error(f"Ingestion failed: {e}")
        return 1


async def cmd_query(args: argparse.Namespace) -> int:
    """Query the knowledge base."""
    query = " ".join(args.query)

    if not query:
        print("Error: Please provide a query")
        return 1

    print(f"Query: {query}")
    print("-" * 50)

    try:
        retriever = RAGRetriever(
            top_k=args.top_k,
            relevance_threshold=args.threshold,
        )

        result = await retriever.retrieve(query)

        print(f"\nRetrieved {len(result.chunks)} relevant chunks")
        print(f"Has relevant content: {result.has_relevant_content}")
        print(f"Top score: {result.top_score:.3f}")
        print(f"Average score: {result.average_score:.3f}")

        if result.chunks:
            print("\n" + "=" * 50)
            print("RETRIEVED CHUNKS:")
            print("=" * 50)

            for i, chunk in enumerate(result.chunks):
                print(f"\n--- Chunk {i + 1} (score: {chunk.score:.3f}) ---")
                print(f"Source: {chunk.metadata.get('title', 'Unknown')}")
                print(f"Content:\n{chunk.content[:500]}...")

            print("\n" + "=" * 50)
            print("FORMATTED CONTEXT:")
            print("=" * 50)
            print(result.context_text)

        return 0

    except Exception as e:
        logger.error(f"Query failed: {e}")
        return 1


async def cmd_stats(args: argparse.Namespace) -> int:
    """Show knowledge base statistics."""
    try:
        store = ChromaVectorStore()
        stats = store.get_collection_stats()

        print("Knowledge Base Statistics")
        print("-" * 50)
        print(f"Collection name: {stats['collection_name']}")
        print(f"Document count: {stats['document_count']}")
        print(f"Persist directory: {stats['persist_directory']}")

        return 0

    except Exception as e:
        logger.error(f"Failed to get stats: {e}")
        return 1


async def cmd_clear(args: argparse.Namespace) -> int:
    """Clear the knowledge base."""
    if not args.confirm:
        print("Error: Use --confirm flag to clear the knowledge base")
        return 1

    try:
        store = ChromaVectorStore()
        count = await store.get_document_count()

        print(f"Clearing {count} documents from knowledge base...")
        await store.clear()

        print("Knowledge base cleared successfully!")
        return 0

    except Exception as e:
        logger.error(f"Failed to clear: {e}")
        return 1


async def cmd_ingest_file(args: argparse.Namespace) -> int:
    """Ingest a single file."""
    file_path = args.file

    if not Path(file_path).exists():
        print(f"Error: File not found: {file_path}")
        return 1

    print(f"Ingesting file: {file_path}")
    print("-" * 50)

    try:
        pipeline = DocumentIngestionPipeline()
        chunks = await pipeline.ingest_file(file_path)

        if chunks:
            print(f"Successfully created {len(chunks)} chunks")
            for i, chunk in enumerate(chunks):
                print(f"  Chunk {i + 1}: {len(chunk.content)} chars")
        else:
            print("No chunks created (file may be empty or unsupported)")

        return 0

    except Exception as e:
        logger.error(f"Ingestion failed: {e}")
        return 1


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="RAG Knowledge Base CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  Ingest all documents:
    python -m app.rag.cli ingest --dir ./data/knowledge

  Query the knowledge base:
    python -m app.rag.cli query "What cloud platforms do you support?"

  Show statistics:
    python -m app.rag.cli stats

  Clear the database:
    python -m app.rag.cli clear --confirm
        """,
    )

    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # Ingest command
    ingest_parser = subparsers.add_parser("ingest", help="Ingest documents")
    ingest_parser.add_argument(
        "--dir", "-d", type=str, help="Directory to ingest from"
    )
    ingest_parser.add_argument(
        "--recursive", "-r", action="store_true", default=True,
        help="Process subdirectories (default: True)"
    )
    ingest_parser.add_argument(
        "--chunk-size", type=int, default=500,
        help="Target chunk size in tokens (default: 500)"
    )
    ingest_parser.add_argument(
        "--chunk-overlap", type=int, default=50,
        help="Overlap between chunks in tokens (default: 50)"
    )

    # Ingest file command
    ingest_file_parser = subparsers.add_parser("ingest-file", help="Ingest a single file")
    ingest_file_parser.add_argument("file", type=str, help="File to ingest")

    # Query command
    query_parser = subparsers.add_parser("query", help="Query the knowledge base")
    query_parser.add_argument("query", nargs="+", help="Query text")
    query_parser.add_argument(
        "--top-k", "-k", type=int, default=4,
        help="Number of results to retrieve (default: 4)"
    )
    query_parser.add_argument(
        "--threshold", "-t", type=float, default=0.7,
        help="Minimum relevance threshold (default: 0.7)"
    )

    # Stats command
    subparsers.add_parser("stats", help="Show knowledge base statistics")

    # Clear command
    clear_parser = subparsers.add_parser("clear", help="Clear the knowledge base")
    clear_parser.add_argument(
        "--confirm", action="store_true",
        help="Confirm clearing the knowledge base"
    )

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return 1

    # Run the appropriate command
    commands = {
        "ingest": cmd_ingest,
        "ingest-file": cmd_ingest_file,
        "query": cmd_query,
        "stats": cmd_stats,
        "clear": cmd_clear,
    }

    if args.command in commands:
        return asyncio.run(commands[args.command](args))
    else:
        parser.print_help()
        return 1


if __name__ == "__main__":
    sys.exit(main())
