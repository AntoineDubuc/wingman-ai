# Implementation Plan: AI & Knowledge Base Track

---

## Executive Summary

The AI & Knowledge Base track establishes the intelligent core of the Presales AI Assistant, integrating Google's Gemini LLM with a vector database-powered knowledge retrieval system. This track implements a complete RAG (Retrieval-Augmented Generation) pipeline that enables the assistant to provide contextually relevant, accurate responses based on the organization's presales documentation and knowledge base. The system is designed with a dual-environment architecture using Chroma for local development and Pinecone for production scalability.

**Key Outcomes:**
- Fully functional Gemini LLM integration with streaming responses and cost-controlled token limits
- Production-ready vector database infrastructure with intelligent document chunking and semantic search
- Complete RAG pipeline delivering relevant, well-formatted presales guidance with confidence-based filtering

---

## Product Manager Review

### Feature Overview

This track delivers the AI intelligence layer that transforms the Presales AI Assistant from a simple recording tool into an intelligent advisor. By combining state-of-the-art language models with domain-specific knowledge retrieval, the system provides real-time, contextually relevant responses to questions detected during presales meetings. The architecture prioritizes accuracy over creativity, implementing guardrails to prevent hallucination while maintaining fast response times through streaming.

### Features

#### 1. Gemini LLM Integration
**What it is:** Integration with Google's Gemini language model through the Google AI Python SDK, providing the natural language understanding and generation capabilities for the assistant.

**Why it matters:** Gemini offers a strong balance of capability and cost-effectiveness for enterprise applications. The streaming implementation ensures users see responses begin immediately, improving perceived responsiveness during live meetings.

**User perspective:** "When a prospect asks a technical question, I see the AI begin formulating a response almost instantly, with talking points appearing as they're generated rather than waiting for a complete response."

#### 2. Knowledge Base Setup - Vector Database
**What it is:** A dual-environment vector database infrastructure using Chroma for local development and Pinecone for production, with intelligent document chunking and embedding generation.

**Why it matters:** Vector databases enable semantic search that understands meaning, not just keywords. This allows the system to find relevant information even when the exact terminology differs between the question and the documentation.

**User perspective:** "The system finds relevant content from our sales materials even when prospects phrase questions differently than how our docs are written. It just understands what they're asking about."

#### 3. RAG Retrieval Pipeline
**What it is:** A complete Retrieval-Augmented Generation pipeline that finds relevant documentation, formats it as context, and provides it to the LLM for accurate response generation.

**Why it matters:** RAG grounds the LLM's responses in actual company documentation, dramatically reducing hallucination and ensuring responses reflect current, accurate information about products and services.

**User perspective:** "The AI suggestions are always based on our actual materials - I can trust that the talking points it provides are accurate and approved messaging."

#### 4. System Prompt Engineering
**What it is:** Carefully crafted system prompts that define the AI's persona as a presales expert, establish response formats, implement accuracy guardrails, and structure context injection.

**Why it matters:** The system prompt is the control mechanism that shapes all AI behavior. Well-engineered prompts ensure consistent, professional responses that align with presales best practices.

**User perspective:** "The AI responds like an experienced colleague would - professional, focused on value propositions, and structured in a way that's easy to quickly glance at during a call."

#### 5. Response Formatting & Filtering
**What it is:** Logic to detect actual questions worth responding to, format responses as actionable talking points, and filter out noise to avoid cluttering the interface.

**Why it matters:** Not every utterance in a meeting requires AI assistance. Intelligent filtering ensures the assistant only surfaces information when genuinely helpful, preventing distraction.

**User perspective:** "The assistant knows when to stay quiet and when to help. It doesn't flood me with suggestions for small talk, but when a real technical question comes up, it's ready with relevant points."

---

## Master Checklist

### Instructions for Claude Code

**Time Tracking Protocol:**
1. When starting a task, record the current time in the "Start" column (HH:MM format)
2. When completing a task, record the end time in the "End" column
3. Calculate total minutes and update the "Total (min)" column
4. The "Multiplier" is calculated as: Human Est. / Total (min)
   - Multiplier > 1 means faster than human estimate
   - Multiplier < 1 means slower than human estimate

**Checkbox Usage:**
- `[ ]` - Task not started
- `[~]` - Task in progress
- `[x]` - Task completed
- `[!]` - Task blocked or needs attention

**After completing each task:**
1. Mark the checkbox as complete `[x]`
2. Fill in all time columns
3. Update the Summary section totals
4. Add any notes about deviations or blockers in the task description

### Progress Dashboard

| Done | # | Task Name | Start | End | Total (min) | Human Est. (min) | Multiplier |
|:----:|:-:|-----------|:-----:|:---:|:-----------:|:----------------:|:----------:|
| [ ] | C1 | Gemini LLM Integration | | | | 90 | |
| [ ] | C2 | Knowledge Base Setup - Vector DB | | | | 180 | |
| [ ] | C3 | RAG Retrieval Pipeline | | | | 150 | |
| [ ] | C4 | System Prompt Engineering | | | | 60 | |
| [ ] | C5 | Response Formatting & Filtering | | | | 60 | |

**Summary:**
- Total tasks: 5
- Completed: 0
- Total time spent: 0 minutes
- Total human estimate: 540 minutes
- Overall multiplier: TBD

---

## Task Descriptions

### C1: Gemini LLM Integration
**Human Estimate:** 90 minutes

#### Intent
Establish the foundational LLM integration that powers all AI capabilities in the assistant. This task creates a robust, production-ready service for interacting with Google's Gemini model.

#### Context
The Gemini integration must support both synchronous and streaming response modes. Streaming is critical for the user experience during live meetings, as it allows talking points to appear progressively. Token limits are essential for cost control in a potentially high-volume production environment.

#### Expected Behavior
- The system can send prompts to Gemini and receive responses
- Streaming mode delivers tokens as they're generated
- Token limits prevent runaway costs on lengthy responses
- Errors are handled gracefully with appropriate fallback messages
- API keys are securely managed through environment configuration

#### Key Components

**1. Google GenAI Python SDK Setup**
- **IMPORTANT:** Install `google-genai` package (NOT the deprecated `google-generativeai` which reached EOL Nov 30, 2025)
- New SDK usage: `from google import genai; client = genai.Client(api_key='...')`
- Implement secure API key management via environment variables
- Create configuration class for model parameters (temperature, top_p, top_k)
- Set up connection pooling for efficient API usage
- Implement retry logic with exponential backoff for rate limits

**2. Prompt Construction with Context Injection**
- Design prompt template structure with clear sections
- Implement context injection points for RAG-retrieved content
- Support variable substitution for dynamic content
- Maintain conversation history for multi-turn interactions (optional enhancement)
- Validate prompt length against model limits

**3. Response Generation Service**
- Create `GeminiService` class with clean interface
- Implement `generate()` method for synchronous responses
- Handle model response parsing and extraction
- Add response metadata (tokens used, latency, model version)
- Implement caching layer for repeated queries (optional)

**4. Streaming Response Handling**
- Implement `generate_stream()` method yielding response chunks
- Handle partial token assembly for clean word boundaries
- Provide progress callbacks for UI updates
- Implement cancellation support for abandoned requests
- Handle stream interruptions gracefully

**5. Token Limits for Cost Control**
- Configure maximum input token limits
- Configure maximum output token limits
- Implement token counting before sending requests
- Add cost estimation utilities
- Create usage tracking for monitoring and alerts

#### Notes
- **Current models (2026):** Use `gemini-2.5-flash` for development (faster, cheaper), `gemini-2.5-pro` for production
- Note: `gemini-2.0-flash-lite` is deprecated (shutdown March 31, 2026)
- Consider implementing a mock mode for testing without API calls
- Document all configuration options for operations team

---

### C2: Knowledge Base Setup - Vector Database
**Human Estimate:** 180 minutes

#### Intent
Build the semantic search infrastructure that enables the assistant to find relevant information from the organization's presales documentation, using a development/production split architecture.

#### Context
The dual-database approach (Chroma locally, Pinecone in production) allows for rapid local development without cloud dependencies while ensuring production scalability. Document chunking strategy significantly impacts retrieval quality - chunks must be large enough to contain meaningful context but small enough to be precisely relevant.

#### Expected Behavior
- Documents can be ingested, chunked, embedded, and stored
- Semantic search returns relevant chunks for any natural language query
- Development environment works fully offline with Chroma
- Production environment scales efficiently with Pinecone
- Document updates reflect in search results promptly

#### Key Components

**1. Chroma (Dev) / Pinecone (Prod) Integration**
- Install `chromadb` for local development
- Install `pinecone-client` for production
- Create abstract `VectorStore` interface for database-agnostic operations
- Implement `ChromaVectorStore` with local persistence
- Implement `PineconeVectorStore` with cloud configuration
- Add environment-based selection logic
- Configure indexes and collections appropriately for each

**2. Document Chunking Logic (~500 tokens)**
- Implement token-aware text splitter
- Support multiple chunking strategies:
  - Fixed-size with overlap (default: 500 tokens, 50 token overlap)
  - Semantic chunking based on paragraph/section boundaries
  - Hybrid approach combining both
- Preserve document metadata through chunking (source, section, page)
- Handle various document formats (plain text, markdown, HTML)
- Implement chunk deduplication

**3. Embedding Generation**
- Integrate embedding model: **`gemini-embedding-001`** (GA in Gemini API, 3072-dimensional vectors)
- Alternative for on-device: `embeddinggemma-300m` (308M params, multilingual, <200MB RAM)
- Implement batch embedding for efficiency
- Add embedding caching to reduce API calls
- Handle embedding failures gracefully
- Support embedding model versioning for consistency

**4. Similarity Search Implementation**
- Implement cosine similarity search
- Support configurable top-k retrieval
- Add metadata filtering (by source, date, category)
- Implement hybrid search combining vector + keyword (optional)
- Return results with similarity scores
- Add search result deduplication for overlapping chunks

#### Notes
- Plan for ~500 token chunks as default but make configurable
- Include document ingestion CLI tool for operations
- Consider implementing incremental updates vs. full reindex
- Document the embedding model choice and versioning strategy

---

### C3: RAG Retrieval Pipeline
**Human Estimate:** 150 minutes

#### Intent
Create the complete retrieval-augmented generation pipeline that connects user queries to relevant documentation and structures that context for optimal LLM response generation.

#### Context
The RAG pipeline is the critical bridge between raw questions and informed answers. Quality at each stage compounds - poor retrieval leads to irrelevant context leads to unhelpful responses. The pipeline must handle edge cases gracefully, including queries with no relevant documentation.

#### Expected Behavior
- Questions are embedded and matched against the knowledge base
- Most relevant chunks are retrieved and ranked
- Context is formatted clearly for LLM consumption
- Low-relevance results are filtered out
- System responds appropriately when no relevant content exists

#### Key Components

**1. Query Embedding**
- Use same embedding model as document ingestion (critical for consistency)
- Implement query preprocessing (normalization, expansion)
- Add query caching for repeated questions
- Handle query embedding failures
- Support batch query processing for testing

**2. Top-k Retrieval (k=3-5)**
- Configure default k value (recommend k=4)
- Make k configurable per query or globally
- Implement retrieval timeout handling
- Add retrieval latency tracking
- Support retrieval from multiple collections/namespaces

**3. Context Formatting for Prompt**
- Design context template with clear structure
- Format retrieved chunks with source attribution
- Order chunks by relevance score
- Truncate context if exceeding token budget
- Add separators between chunks for clarity
- Include metadata hints (document title, section)

**4. Relevance Threshold Filtering**
- Implement configurable similarity score threshold (recommend 0.7)
- Filter out results below threshold before including in context
- Log filtered results for quality monitoring
- Support per-query threshold adjustment
- Add relevance distribution tracking

**5. Fallback When No Relevant Content**
- Detect when all results are below threshold
- Implement graceful fallback response
- Provide "I don't have information about that" messaging
- Log no-match queries for knowledge base gap analysis
- Optionally route to general LLM knowledge with disclosure

#### Notes
- The relevance threshold is critical - too high misses useful content, too low includes noise
- Consider A/B testing different k values and thresholds
- Build query logging for continuous improvement of the knowledge base

---

### C4: System Prompt Engineering
**Human Estimate:** 60 minutes

#### Intent
Design and implement the system prompts that define the AI assistant's persona, behavior, and output format to ensure consistent, helpful, and accurate responses.

#### Context
System prompts are the primary mechanism for controlling LLM behavior. For a presales assistant, the prompts must establish expertise credibility, enforce accuracy over creativity, and structure outputs for quick scanning during live meetings.

#### Expected Behavior
- AI responds as a knowledgeable presales expert
- Responses are formatted as actionable talking points
- AI acknowledges uncertainty rather than fabricating information
- Retrieved context is used appropriately and cited
- Responses maintain professional tone and appropriate length

#### Key Components

**1. Presales Expert Persona Definition**
- Define the assistant's role and expertise boundaries
- Establish tone (professional, helpful, confident but not arrogant)
- Set knowledge scope (company products, industry, competition)
- Define relationship to user (supportive colleague, not replacement)
- Include personality traits that build trust

**2. Response Format Instructions (Talking Points)**
- Specify bullet-point format for quick scanning
- Define maximum response length (3-5 points typically)
- Instruct on prioritization (most impactful first)
- Request action-oriented language
- Specify formatting rules (no walls of text)

**3. Guardrails (Accuracy, No Hallucination)**
- Explicit instruction to only use provided context
- Define behavior when context is insufficient
- Prohibit making up statistics, features, or claims
- Require acknowledgment of uncertainty
- Instruct on handling questions outside scope

**4. Context Injection Template**
- Design clear structure for injecting retrieved content
- Label context sections clearly
- Include instructions on context usage
- Handle empty context gracefully
- Support variable context lengths

**5. Example Responses**
- Provide 2-3 few-shot examples of ideal responses
- Show examples of different question types:
  - Technical/feature questions
  - Pricing/commercial questions
  - Competitive differentiation questions
- Include example of appropriate "I don't know" response
- Show formatting expectations concretely

#### Notes
- System prompts should be versioned and A/B testable
- Consider creating prompt variants for different meeting types
- Document prompt design decisions for future iteration
- Plan for prompt template management system

---

### C5: Response Formatting & Filtering
**Human Estimate:** 60 minutes

#### Intent
Implement the logic that determines when to generate responses and how to format them for maximum utility during live presales meetings.

#### Context
Not every piece of meeting audio requires AI intervention. The filtering layer prevents information overload by only surfacing the assistant when genuinely helpful. Response formatting ensures that when information is surfaced, it's immediately actionable.

#### Expected Behavior
- Actual questions are detected and trigger AI response
- Filler phrases and small talk are filtered out
- Responses are formatted as scannable bullet points
- Key terms and values are highlighted
- Low-confidence responses are suppressed or flagged

#### Key Components

**1. Question Detection Logic**
- Implement interrogative pattern detection
- Identify question intent even without question words
- Detect multi-part questions
- Handle indirect questions and requests
- Filter rhetorical questions
- Consider using lightweight classifier model

**2. Response Formatting (Bullets, Highlights)**
- Convert LLM prose to structured bullets
- Implement key term highlighting (bold/emphasis)
- Extract and highlight numbers/metrics
- Add source references for verification
- Support multiple format templates
- Implement markdown-to-rich-text conversion

**3. Noise Filtering (Skip "yes", "okay", etc.)**
- Build list of filler words/phrases to ignore
- Implement short utterance filtering (< N words)
- Filter greetings and pleasantries
- Skip acknowledgments and affirmations
- Handle partial sentences and fragments
- Make filter rules configurable

**4. Confidence Thresholding**
- Extract confidence signals from LLM response
- Define confidence thresholds for display
- Implement tiered response treatment:
  - High confidence: Display normally
  - Medium confidence: Display with caveat
  - Low confidence: Suppress or queue for review
- Log confidence distributions for monitoring
- Support user feedback to improve thresholds

#### Notes
- Question detection false positives are less costly than false negatives
- Consider user preference settings for filtering aggressiveness
- Build filtering analytics for continuous improvement
- Test extensively with real meeting transcripts

---

## Appendix

### Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| LLM Provider | Google Gemini (`gemini-2.5-flash`) | Cost-effective, strong performance, good streaming support |
| Embedding Model | `gemini-embedding-001` | Native integration with Gemini, 3072-dim vectors, GA status |
| Dev Vector DB | Chroma (v1.4+) | Zero-config local setup, good developer experience |
| Prod Vector DB | Pinecone (v8.0+) | Managed service, scales well, production-proven |
| Chunk Size | ~500 tokens | Balance between context richness and retrieval precision |
| Top-k Retrieval | k=4 | Provides sufficient context without overwhelming |
| Relevance Threshold | 0.7 | Filters noise while retaining useful content |

### Dependencies

**External Services:**
- Google AI Platform (Gemini API)
- Pinecone (production only)

**Python Packages:**
- `google-genai` - Gemini SDK (NOT the deprecated `google-generativeai`)
- `chromadb>=1.4.0` - Local vector database
- `pinecone>=8.0.0` - Production vector database (NOT the deprecated `pinecone-client`; requires Python 3.10+)
- `tiktoken` or equivalent - Token counting
- `langchain` (optional) - RAG utilities if needed

**IMPORTANT Package Migration Notes:**
- If upgrading from old packages, first uninstall deprecated versions:
  - `pip uninstall pinecone-client` before `pip install pinecone`
  - The old `google-generativeai` reached EOL Nov 30, 2025

**Internal Dependencies:**
- Track A (Audio): Provides transcribed text for question detection
- Track B (UI): Consumes formatted responses for display

### Out of Scope

The following items are explicitly not part of this track:

1. **Fine-tuning Gemini** - Using base model with prompt engineering only
2. **Custom embedding model training** - Using pre-trained embeddings
3. **Multi-language support** - English only for MVP
4. **Document OCR/parsing** - Assumes clean text input
5. **Real-time knowledge base updates during meetings** - Batch ingestion only
6. **Conversation memory across meetings** - Each meeting is independent
7. **User feedback loop for response quality** - Post-MVP enhancement
8. **A/B testing infrastructure** - Manual testing for MVP
9. **Advanced analytics dashboard** - Basic logging only
10. **Competitive intelligence automation** - Manual knowledge base curation

---

*Last Updated: 2025-01-26*
*Track Owner: AI Engineering*
*Status: Planning*
