"""
Document Ingestion Pipeline

Processes markdown and PDF documents, chunks them intelligently,
generates embeddings, and stores them in the vector database.
"""

import hashlib
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from app.config import settings
from app.rag.vector_store import (
    EmbeddingGenerator,
    VectorStore,
    get_embedding_generator,
    get_vector_store,
)

logger = logging.getLogger(__name__)


@dataclass
class Document:
    """
    Represents a source document before processing.
    """

    content: str
    source: str  # File path or identifier
    title: str = ""
    doc_type: str = "unknown"  # markdown, pdf, text
    metadata: Dict[str, Any] = field(default_factory=dict)
    created_at: datetime = field(default_factory=datetime.now)

    def __post_init__(self) -> None:
        if not self.title:
            # Extract title from source filename
            self.title = Path(self.source).stem.replace("-", " ").replace("_", " ").title()


@dataclass
class Chunk:
    """
    Represents a processed chunk of a document.
    """

    id: str
    content: str
    source: str
    title: str
    chunk_index: int
    total_chunks: int
    start_char: int
    end_char: int
    metadata: Dict[str, Any] = field(default_factory=dict)
    embedding: Optional[List[float]] = None

    @property
    def token_estimate(self) -> int:
        """Rough token estimate (4 chars per token average)."""
        return len(self.content) // 4


class TextChunker:
    """
    Intelligently chunks text for vector storage.

    Supports multiple chunking strategies:
    - Fixed size with overlap (default)
    - Semantic chunking based on paragraph/section boundaries
    - Hybrid approach combining both
    """

    def __init__(
        self,
        chunk_size: int = 500,  # Target tokens per chunk
        chunk_overlap: int = 50,  # Overlap tokens between chunks
        min_chunk_size: int = 100,  # Minimum tokens to create a chunk
        respect_boundaries: bool = True,  # Try to split at natural boundaries
    ) -> None:
        """
        Initialize the text chunker.

        Args:
            chunk_size: Target number of tokens per chunk (approx 4 chars per token).
            chunk_overlap: Number of tokens to overlap between chunks.
            min_chunk_size: Minimum chunk size to create.
            respect_boundaries: Try to split at paragraph/sentence boundaries.
        """
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.min_chunk_size = min_chunk_size
        self.respect_boundaries = respect_boundaries

        # Convert token counts to approximate character counts
        self.char_chunk_size = chunk_size * 4
        self.char_overlap = chunk_overlap * 4
        self.char_min_size = min_chunk_size * 4

    def chunk_text(self, text: str) -> List[Tuple[str, int, int]]:
        """
        Split text into chunks with optional overlap.

        Args:
            text: Text to chunk.

        Returns:
            List of tuples: (chunk_text, start_char, end_char)
        """
        if not text.strip():
            return []

        text = self._normalize_whitespace(text)

        if len(text) <= self.char_chunk_size:
            return [(text, 0, len(text))]

        chunks = []
        start = 0

        while start < len(text):
            # Calculate end position
            end = min(start + self.char_chunk_size, len(text))

            # If we're not at the end and respecting boundaries, find a good split point
            if end < len(text) and self.respect_boundaries:
                end = self._find_split_point(text, start, end)

            chunk_text = text[start:end].strip()

            # Only add if chunk meets minimum size (unless it's the last chunk)
            if len(chunk_text) >= self.char_min_size or start + self.char_chunk_size >= len(text):
                chunks.append((chunk_text, start, end))

            # Move to next chunk with overlap
            start = end - self.char_overlap
            if start <= chunks[-1][1] if chunks else 0:
                start = end  # Prevent infinite loop

        return chunks

    def _normalize_whitespace(self, text: str) -> str:
        """Normalize whitespace while preserving paragraph structure."""
        # Replace multiple newlines with double newline (paragraph break)
        text = re.sub(r"\n{3,}", "\n\n", text)
        # Replace multiple spaces with single space
        text = re.sub(r" {2,}", " ", text)
        return text.strip()

    def _find_split_point(self, text: str, start: int, end: int) -> int:
        """
        Find a natural split point near the end position.

        Prefers splitting at:
        1. Paragraph boundaries (double newline)
        2. Section headers (markdown headers)
        3. Sentence boundaries (period, exclamation, question mark)
        4. Clause boundaries (comma, semicolon)
        """
        search_start = max(start, end - 200)  # Search in last 200 chars
        search_text = text[search_start:end]

        # Try paragraph boundary first
        para_match = search_text.rfind("\n\n")
        if para_match != -1 and para_match > 50:  # Ensure reasonable chunk size
            return search_start + para_match + 2

        # Try sentence boundary
        sentence_patterns = [". ", "! ", "? ", ".\n", "!\n", "?\n"]
        best_pos = -1
        for pattern in sentence_patterns:
            pos = search_text.rfind(pattern)
            if pos > best_pos:
                best_pos = pos

        if best_pos != -1 and best_pos > 50:
            return search_start + best_pos + 2

        # Try clause boundary as fallback
        clause_patterns = [", ", "; ", ":\n", " - "]
        for pattern in clause_patterns:
            pos = search_text.rfind(pattern)
            if pos != -1 and pos > 50:
                return search_start + pos + len(pattern)

        # No good boundary found, split at word boundary
        space_pos = search_text.rfind(" ")
        if space_pos != -1 and space_pos > 50:
            return search_start + space_pos + 1

        return end


class MarkdownProcessor:
    """
    Processes markdown documents, extracting structure and content.
    """

    def __init__(self) -> None:
        self.header_pattern = re.compile(r"^(#{1,6})\s+(.+)$", re.MULTILINE)

    def process(self, content: str, source: str) -> Document:
        """
        Process a markdown document.

        Args:
            content: Raw markdown content.
            source: Source file path or identifier.

        Returns:
            Processed Document object.
        """
        # Extract title from first H1 header
        title = ""
        h1_match = re.search(r"^#\s+(.+)$", content, re.MULTILINE)
        if h1_match:
            title = h1_match.group(1).strip()

        # Extract all headers for metadata
        headers = []
        for match in self.header_pattern.finditer(content):
            level = len(match.group(1))
            text = match.group(2).strip()
            headers.append({"level": level, "text": text})

        # Clean up the content (remove excessive whitespace but keep structure)
        processed_content = self._clean_markdown(content)

        return Document(
            content=processed_content,
            source=source,
            title=title,
            doc_type="markdown",
            metadata={
                "headers": headers,
                "header_count": len(headers),
                "word_count": len(processed_content.split()),
            },
        )

    def _clean_markdown(self, content: str) -> str:
        """Clean markdown while preserving useful structure."""
        # Remove HTML comments
        content = re.sub(r"<!--.*?-->", "", content, flags=re.DOTALL)
        # Normalize line endings
        content = content.replace("\r\n", "\n")
        # Remove excessive blank lines
        content = re.sub(r"\n{3,}", "\n\n", content)
        return content.strip()


class PDFProcessor:
    """
    Processes PDF documents using basic text extraction.

    Note: For production, consider using more sophisticated PDF libraries
    like PyMuPDF (fitz) or pdfplumber for better text extraction.
    """

    def process(self, content: bytes, source: str) -> Document:
        """
        Process a PDF document.

        Args:
            content: Raw PDF bytes.
            source: Source file path or identifier.

        Returns:
            Processed Document object.

        Note:
            This is a basic implementation. For production use, install
            and use PyMuPDF: pip install pymupdf
        """
        try:
            import fitz  # PyMuPDF

            doc = fitz.open(stream=content, filetype="pdf")
            text_parts = []

            for page_num, page in enumerate(doc):
                text = page.get_text()
                if text.strip():
                    text_parts.append(f"[Page {page_num + 1}]\n{text}")

            extracted_text = "\n\n".join(text_parts)

            return Document(
                content=extracted_text,
                source=source,
                title=Path(source).stem.replace("-", " ").replace("_", " ").title(),
                doc_type="pdf",
                metadata={
                    "page_count": len(doc),
                    "word_count": len(extracted_text.split()),
                },
            )

        except ImportError:
            logger.warning("PyMuPDF not installed. PDF processing unavailable. Install with: pip install pymupdf")
            return Document(
                content="[PDF content extraction requires PyMuPDF]",
                source=source,
                doc_type="pdf",
                metadata={"error": "PyMuPDF not installed"},
            )
        except Exception as e:
            logger.error(f"Failed to process PDF {source}: {e}")
            return Document(
                content=f"[Failed to extract PDF content: {e}]",
                source=source,
                doc_type="pdf",
                metadata={"error": str(e)},
            )


class DocumentIngestionPipeline:
    """
    Complete document ingestion pipeline.

    Orchestrates document loading, processing, chunking, embedding generation,
    and storage in the vector database.
    """

    def __init__(
        self,
        vector_store: Optional[VectorStore] = None,
        embedding_generator: Optional[EmbeddingGenerator] = None,
        chunk_size: int = 500,
        chunk_overlap: int = 50,
    ) -> None:
        """
        Initialize the ingestion pipeline.

        Args:
            vector_store: Vector store instance (uses global if not provided).
            embedding_generator: Embedding generator (uses global if not provided).
            chunk_size: Target tokens per chunk.
            chunk_overlap: Overlap tokens between chunks.
        """
        self.vector_store = vector_store or get_vector_store()
        self.embedding_generator = embedding_generator or get_embedding_generator()
        self.chunker = TextChunker(chunk_size=chunk_size, chunk_overlap=chunk_overlap)
        self.markdown_processor = MarkdownProcessor()
        self.pdf_processor = PDFProcessor()

    def _generate_chunk_id(self, source: str, chunk_index: int, content: str) -> str:
        """Generate a unique ID for a chunk."""
        content_hash = hashlib.md5(content.encode()).hexdigest()[:8]
        source_hash = hashlib.md5(source.encode()).hexdigest()[:8]
        return f"{source_hash}_{chunk_index}_{content_hash}"

    async def ingest_file(self, file_path: str) -> List[Chunk]:
        """
        Ingest a single file into the vector store.

        Args:
            file_path: Path to the file to ingest.

        Returns:
            List of created chunks.
        """
        path = Path(file_path)

        if not path.exists():
            logger.error(f"File not found: {file_path}")
            return []

        # Read and process based on file type
        suffix = path.suffix.lower()

        if suffix in [".md", ".markdown"]:
            content = path.read_text(encoding="utf-8")
            document = self.markdown_processor.process(content, str(path))
        elif suffix == ".pdf":
            content = path.read_bytes()
            document = self.pdf_processor.process(content, str(path))
        elif suffix == ".txt":
            content = path.read_text(encoding="utf-8")
            document = Document(content=content, source=str(path), doc_type="text")
        else:
            logger.warning(f"Unsupported file type: {suffix}")
            return []

        return await self.ingest_document(document)

    async def ingest_document(self, document: Document) -> List[Chunk]:
        """
        Ingest a document into the vector store.

        Args:
            document: Document to ingest.

        Returns:
            List of created chunks.
        """
        # Chunk the document
        chunk_tuples = self.chunker.chunk_text(document.content)

        if not chunk_tuples:
            logger.warning(f"No chunks created for document: {document.source}")
            return []

        # Create Chunk objects
        chunks = []
        for i, (chunk_text, start, end) in enumerate(chunk_tuples):
            chunk_id = self._generate_chunk_id(document.source, i, chunk_text)

            chunk = Chunk(
                id=chunk_id,
                content=chunk_text,
                source=document.source,
                title=document.title,
                chunk_index=i,
                total_chunks=len(chunk_tuples),
                start_char=start,
                end_char=end,
                metadata={
                    "doc_type": document.doc_type,
                    "title": document.title,
                    "chunk_index": i,
                    "total_chunks": len(chunk_tuples),
                    **document.metadata,
                },
            )
            chunks.append(chunk)

        # Generate embeddings
        contents = [chunk.content for chunk in chunks]
        embeddings = await self.embedding_generator.embed_texts(contents)

        # Filter out chunks with failed embeddings
        valid_chunks = []
        valid_embeddings = []
        for chunk, embedding in zip(chunks, embeddings):
            if embedding is not None:
                chunk.embedding = embedding
                valid_chunks.append(chunk)
                valid_embeddings.append(embedding)
            else:
                logger.warning(f"Failed to generate embedding for chunk {chunk.id}")

        if not valid_chunks:
            logger.error(f"No valid embeddings generated for document: {document.source}")
            return []

        # Store in vector database
        await self.vector_store.add_documents(
            ids=[c.id for c in valid_chunks],
            embeddings=valid_embeddings,
            contents=[c.content for c in valid_chunks],
            metadatas=[c.metadata for c in valid_chunks],
        )

        logger.info(
            f"Ingested document '{document.title}' from {document.source}: "
            f"{len(valid_chunks)} chunks stored"
        )

        return valid_chunks

    async def ingest_directory(
        self,
        directory_path: str,
        recursive: bool = True,
        file_patterns: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """
        Ingest all documents from a directory.

        Args:
            directory_path: Path to the directory.
            recursive: Whether to process subdirectories.
            file_patterns: File patterns to match (e.g., ["*.md", "*.pdf"]).

        Returns:
            Dictionary with ingestion statistics.
        """
        path = Path(directory_path)

        if not path.exists():
            logger.error(f"Directory not found: {directory_path}")
            return {"error": "Directory not found", "files_processed": 0}

        if file_patterns is None:
            file_patterns = ["*.md", "*.markdown", "*.txt", "*.pdf"]

        # Collect files
        files = []
        for pattern in file_patterns:
            if recursive:
                files.extend(path.rglob(pattern))
            else:
                files.extend(path.glob(pattern))

        # Remove duplicates and sort
        files = sorted(set(files))

        logger.info(f"Found {len(files)} files to process in {directory_path}")

        # Process each file
        total_chunks = 0
        successful_files = 0
        failed_files = []

        for file_path in files:
            try:
                chunks = await self.ingest_file(str(file_path))
                if chunks:
                    total_chunks += len(chunks)
                    successful_files += 1
                else:
                    failed_files.append(str(file_path))
            except Exception as e:
                logger.error(f"Failed to ingest {file_path}: {e}")
                failed_files.append(str(file_path))

        stats = {
            "directory": str(path),
            "files_found": len(files),
            "files_processed": successful_files,
            "files_failed": len(failed_files),
            "total_chunks": total_chunks,
            "failed_files": failed_files,
        }

        logger.info(
            f"Directory ingestion complete: {successful_files}/{len(files)} files, "
            f"{total_chunks} total chunks"
        )

        return stats

    async def ingest_text(
        self,
        text: str,
        source: str = "direct_input",
        title: str = "",
        metadata: Optional[Dict[str, Any]] = None,
    ) -> List[Chunk]:
        """
        Ingest raw text directly.

        Args:
            text: Text content to ingest.
            source: Source identifier.
            title: Optional title for the content.
            metadata: Optional additional metadata.

        Returns:
            List of created chunks.
        """
        document = Document(
            content=text,
            source=source,
            title=title or source,
            doc_type="text",
            metadata=metadata or {},
        )
        return await self.ingest_document(document)


# Convenience function for CLI usage
async def ingest_knowledge_base(knowledge_dir: Optional[str] = None) -> Dict[str, Any]:
    """
    Ingest all documents from the knowledge base directory.

    Args:
        knowledge_dir: Path to knowledge directory (uses default if not provided).

    Returns:
        Ingestion statistics.
    """
    if knowledge_dir is None:
        # Use default knowledge directory relative to project root
        knowledge_dir = str(Path(__file__).parent.parent.parent.parent / "data" / "knowledge")

    pipeline = DocumentIngestionPipeline()
    return await pipeline.ingest_directory(knowledge_dir)
