// === TYPES ===

export interface KBDocument {
  id: string;
  filename: string;
  fileType: 'pdf' | 'md' | 'txt';
  fileSize: number;
  chunkCount: number;
  uploadedAt: number;
  status: 'processing' | 'complete' | 'error';
  lastProcessedChunk?: number;
  error?: string;
}

export interface KBChunk {
  id: string;
  documentId: string;
  text: string;
  embedding: number[]; // 768 dimensions
  chunkIndex: number;
}

export interface KBSearchResult {
  chunk: KBChunk;
  score: number;
  documentName: string;
}

// === INDEXEDDB SERVICE ===

const DB_NAME = 'wingman-kb';
const DB_VERSION = 1;
const STORE_DOCUMENTS = 'documents';
const STORE_CHUNKS = 'chunks';
const CHUNK_BATCH_SIZE = 50;

class KBDatabase {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    if (this.db) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(STORE_DOCUMENTS)) {
          db.createObjectStore(STORE_DOCUMENTS, { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains(STORE_CHUNKS)) {
          const chunkStore = db.createObjectStore(STORE_CHUNKS, { keyPath: 'id' });
          chunkStore.createIndex('documentId', 'documentId', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        console.log('[KBDatabase] Initialized');
        resolve();
      };

      request.onerror = (event) => {
        console.error('[KBDatabase] Failed to open:', (event.target as IDBOpenDBRequest).error);
        reject((event.target as IDBOpenDBRequest).error);
      };
    });
  }

  private async ensureDb(): Promise<IDBDatabase> {
    if (!this.db) await this.init();
    return this.db!;
  }

  async addDocument(doc: KBDocument): Promise<void> {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_DOCUMENTS, 'readwrite');
      tx.objectStore(STORE_DOCUMENTS).put(doc);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async addChunks(chunks: KBChunk[]): Promise<void> {
    const db = await this.ensureDb();

    // Batch writes in groups of CHUNK_BATCH_SIZE to avoid IndexedDB timeout
    for (let i = 0; i < chunks.length; i += CHUNK_BATCH_SIZE) {
      const batch = chunks.slice(i, i + CHUNK_BATCH_SIZE);
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_CHUNKS, 'readwrite');
        const store = tx.objectStore(STORE_CHUNKS);
        for (const chunk of batch) {
          store.put(chunk);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }
  }

  async getDocuments(): Promise<KBDocument[]> {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_DOCUMENTS, 'readonly');
      const request = tx.objectStore(STORE_DOCUMENTS).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getChunksByDocumentId(docId: string): Promise<KBChunk[]> {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CHUNKS, 'readonly');
      const index = tx.objectStore(STORE_CHUNKS).index('documentId');
      const request = index.getAll(docId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllChunks(): Promise<KBChunk[]> {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CHUNKS, 'readonly');
      const request = tx.objectStore(STORE_CHUNKS).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Stream chunks via cursor for large datasets (>5000 chunks).
   * Returns chunks one batch at a time to avoid memory pressure.
   */
  async getAllChunksWithCursor(onBatch: (chunks: KBChunk[]) => void): Promise<void> {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CHUNKS, 'readonly');
      const store = tx.objectStore(STORE_CHUNKS);
      const request = store.openCursor();
      const batch: KBChunk[] = [];

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (cursor) {
          batch.push(cursor.value);
          if (batch.length >= CHUNK_BATCH_SIZE) {
            onBatch(batch.splice(0));
          }
          cursor.continue();
        } else {
          // Flush remaining
          if (batch.length > 0) onBatch(batch);
          resolve();
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  async deleteDocument(docId: string): Promise<void> {
    const db = await this.ensureDb();

    // Delete chunks first (cascade)
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_CHUNKS, 'readwrite');
      const index = tx.objectStore(STORE_CHUNKS).index('documentId');
      const request = index.openCursor(docId);

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    // Delete document record
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_DOCUMENTS, 'readwrite');
      tx.objectStore(STORE_DOCUMENTS).delete(docId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async updateDocumentStatus(
    docId: string,
    status: KBDocument['status'],
    extra?: Partial<Pick<KBDocument, 'chunkCount' | 'lastProcessedChunk' | 'error'>>
  ): Promise<void> {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_DOCUMENTS, 'readwrite');
      const store = tx.objectStore(STORE_DOCUMENTS);
      const getReq = store.get(docId);

      getReq.onsuccess = () => {
        const doc = getReq.result as KBDocument | undefined;
        if (!doc) {
          reject(new Error(`Document ${docId} not found`));
          return;
        }
        doc.status = status;
        if (extra?.chunkCount !== undefined) doc.chunkCount = extra.chunkCount;
        if (extra?.lastProcessedChunk !== undefined) doc.lastProcessedChunk = extra.lastProcessedChunk;
        if (extra?.error !== undefined) doc.error = extra.error;
        store.put(doc);
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getStats(): Promise<{ docCount: number; chunkCount: number; storageUsed: number }> {
    const db = await this.ensureDb();

    const docCount = await new Promise<number>((resolve, reject) => {
      const tx = db.transaction(STORE_DOCUMENTS, 'readonly');
      const request = tx.objectStore(STORE_DOCUMENTS).count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const chunkCount = await new Promise<number>((resolve, reject) => {
      const tx = db.transaction(STORE_CHUNKS, 'readonly');
      const request = tx.objectStore(STORE_CHUNKS).count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    let storageUsed = 0;
    try {
      const estimate = await navigator.storage.estimate();
      storageUsed = estimate.usage ?? 0;
    } catch {
      // Storage API not available in all contexts
    }

    return { docCount, chunkCount, storageUsed };
  }

  async getIncompleteDocuments(): Promise<KBDocument[]> {
    const docs = await this.getDocuments();
    return docs.filter((d) => d.status === 'processing');
  }
}

// === CHUNKING ===

/**
 * Split text into chunks of ~maxSize characters with overlap.
 * Strategy: split on paragraphs first, then sentences, then hard split.
 */
export function chunkText(text: string, maxSize = 1500, overlap = 0.15): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= maxSize) return [trimmed];

  const overlapSize = Math.floor(maxSize * overlap);
  const chunks: string[] = [];

  // Split into paragraphs
  const paragraphs = trimmed.split(/\n\s*\n/);
  let current = '';

  for (const para of paragraphs) {
    const candidate = current ? `${current}\n\n${para}` : para;

    if (candidate.length <= maxSize) {
      current = candidate;
    } else if (current) {
      // Current chunk is full, push it
      chunks.push(current.trim());
      // Start new chunk with overlap from end of previous
      const overlapText = current.slice(-overlapSize);
      current = para.length > maxSize ? para : `${overlapText}\n\n${para}`;
    } else {
      // Single paragraph exceeds maxSize — split on sentences
      const sentences = para.match(/[^.!?]+[.!?]+\s*/g) || [para];
      for (const sentence of sentences) {
        const sentCandidate = current ? `${current}${sentence}` : sentence;
        if (sentCandidate.length <= maxSize) {
          current = sentCandidate;
        } else if (current) {
          chunks.push(current.trim());
          const sentOverlap = current.slice(-overlapSize);
          current = sentence.length > maxSize ? sentence.slice(0, maxSize) : `${sentOverlap}${sentence}`;
        } else {
          // Single sentence exceeds maxSize — hard split
          for (let i = 0; i < sentence.length; i += maxSize - overlapSize) {
            chunks.push(sentence.slice(i, i + maxSize).trim());
          }
          current = '';
        }
      }
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks.filter((c) => c.length > 0);
}

// Export singleton
export const kbDatabase = new KBDatabase();

// === INGESTION ===

const VALID_TYPES = new Set(['pdf', 'md', 'markdown', 'txt']);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MIN_STORAGE_HEADROOM = 50 * 1024 * 1024; // 50MB

let isProcessing = false;

/**
 * Check if a document ingestion is currently in progress
 */
export function isIngesting(): boolean {
  return isProcessing;
}

/**
 * Full ingestion pipeline: validate → extract → chunk → embed → store
 */
export async function ingestDocument(
  file: File,
  onProgress?: (stage: string, percent: number) => void
): Promise<{ success: boolean; documentId?: string; chunkCount?: number; error?: string }> {
  if (isProcessing) {
    return { success: false, error: 'Another document is being processed. Please wait.' };
  }

  isProcessing = true;

  const docId = crypto.randomUUID();
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

  try {
    // 1. Validate API key exists
    const storage = await chrome.storage.local.get(['geminiApiKey']);
    if (!storage.geminiApiKey) {
      return { success: false, error: 'Your Gemini API key is missing. Please add it in the API Keys section above.' };
    }
    const { geminiClient } = await import('../gemini-client');

    // 2. Check storage headroom
    try {
      const estimate = await navigator.storage.estimate();
      const available = (estimate.quota ?? 0) - (estimate.usage ?? 0);
      if (available < MIN_STORAGE_HEADROOM) {
        return { success: false, error: 'Your browser storage is full. Delete some documents to make room.' };
      }
    } catch {
      // Storage API not available, proceed optimistically
    }

    // 3. Check file
    if (!VALID_TYPES.has(ext)) {
      return { success: false, error: 'File type not supported. Please upload PDF, Markdown (.md), or Text (.txt) files.' };
    }
    if (file.size > MAX_FILE_SIZE) {
      return { success: false, error: 'This file is too large (max 10MB). Try compressing it or splitting into smaller files.' };
    }

    // 4. Create document record
    const doc: KBDocument = {
      id: docId,
      filename: file.name,
      fileType: ext === 'markdown' ? 'md' : ext as KBDocument['fileType'],
      fileSize: file.size,
      chunkCount: 0,
      uploadedAt: Date.now(),
      status: 'processing',
    };
    await kbDatabase.addDocument(doc);
    onProgress?.('Processing...', 0);

    // 5. Extract text
    const { extractText } = await import('./extractors');
    const { text, warning } = await extractText(file);
    onProgress?.('Processing...', 20);

    if (!text.trim()) {
      await kbDatabase.deleteDocument(docId);
      return {
        success: false,
        error: warning ?? 'Could not read this file. It may be corrupted or in an unsupported format.',
      };
    }

    // 6. Chunk text
    const textChunks = chunkText(text);
    onProgress?.('Processing...', 30);

    if (textChunks.length === 0) {
      await kbDatabase.deleteDocument(docId);
      return { success: false, error: 'No content could be extracted from this file.' };
    }

    // 7. Generate embeddings in batch
    const embeddings = await geminiClient.generateEmbeddings(textChunks, 'RETRIEVAL_DOCUMENT');
    onProgress?.('Processing...', 90);

    // 8. Store chunks
    const chunks: KBChunk[] = textChunks.map((text, i) => ({
      id: `${docId}_${i}`,
      documentId: docId,
      text,
      embedding: embeddings[i]!,
      chunkIndex: i,
    }));
    await kbDatabase.addChunks(chunks);
    onProgress?.('Processing...', 100);

    // 9. Update document status
    await kbDatabase.updateDocumentStatus(docId, 'complete', { chunkCount: chunks.length });

    return { success: true, documentId: docId, chunkCount: chunks.length };
  } catch (error) {
    console.error('[KB] Ingestion failed:', error);
    // Cleanup partial document
    try {
      await kbDatabase.deleteDocument(docId);
    } catch {
      // Best effort cleanup
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('429')) {
      return { success: false, error: 'Too many requests. Waiting a moment before continuing...' };
    }
    if (message.includes('timed out')) {
      return { success: false, error: 'Network timeout. Please check your connection and try again.' };
    }
    return { success: false, error: 'Could not process document. Please try again in a few minutes.' };
  } finally {
    isProcessing = false;
  }
}
