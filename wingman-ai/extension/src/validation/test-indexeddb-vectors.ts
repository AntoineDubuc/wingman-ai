/**
 * Validation Test: IndexedDB Vector Storage
 *
 * Tests that IndexedDB can store and retrieve vector embeddings at scale.
 */

import type { ValidationResult } from './index';

const DB_NAME = 'wingman-kb-validation';
const DB_VERSION = 1;
const STORE_NAME = 'vectors';
const VECTOR_DIMENSIONS = 768;
const TEST_VECTOR_COUNT = 1000;

interface StoredVector {
  id: string;
  documentId: string;
  text: string;
  embedding: number[];
  createdAt: number;
}

/**
 * Generate a random normalized vector
 */
function generateRandomVector(dimensions: number): number[] {
  const vector = Array.from({ length: dimensions }, () => Math.random() * 2 - 1);
  // Normalize
  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  return vector.map((v) => v / magnitude);
}

/**
 * Open or create the test database
 */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('documentId', 'documentId', { unique: false });
      }
    };
  });
}

/**
 * Delete the test database
 */
function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

/**
 * Store vectors in bulk
 */
async function storeVectors(db: IDBDatabase, vectors: StoredVector[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    let count = 0;
    for (const vector of vectors) {
      const request = store.put(vector);
      request.onsuccess = () => count++;
    }

    transaction.oncomplete = () => resolve(count);
    transaction.onerror = () => reject(transaction.error);
  });
}

/**
 * Retrieve all vectors
 */
async function getAllVectors(db: IDBDatabase): Promise<StoredVector[]> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete vectors by document ID
 */
async function deleteByDocumentId(db: IDBDatabase, documentId: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('documentId');
    const request = index.getAllKeys(IDBKeyRange.only(documentId));

    request.onsuccess = () => {
      const keys = request.result;
      let deleted = 0;
      for (const key of keys) {
        store.delete(key);
        deleted++;
      }
      transaction.oncomplete = () => resolve(deleted);
    };

    request.onerror = () => reject(request.error);
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function testIndexedDbVectors(): Promise<ValidationResult> {
  const details: string[] = [];
  let success = true;
  let db: IDBDatabase | null = null;

  try {
    // Clean up any previous test database
    await deleteDatabase();
    details.push('Cleaned previous test DB');

    // Test 1: Create database
    const createStart = performance.now();
    db = await openDatabase();
    const createTime = Math.round(performance.now() - createStart);
    details.push(`DB created: ${createTime}ms`);

    // Test 2: Generate and store vectors
    const vectors: StoredVector[] = [];
    for (let i = 0; i < TEST_VECTOR_COUNT; i++) {
      vectors.push({
        id: `chunk-${i}`,
        documentId: `doc-${Math.floor(i / 100)}`, // 10 documents, 100 chunks each
        text: `Sample text chunk ${i}`,
        embedding: generateRandomVector(VECTOR_DIMENSIONS),
        createdAt: Date.now(),
      });
    }

    const storeStart = performance.now();
    const storedCount = await storeVectors(db, vectors);
    const storeTime = Math.round(performance.now() - storeStart);

    if (storedCount !== TEST_VECTOR_COUNT) {
      success = false;
      details.push(`FAIL: Stored ${storedCount}/${TEST_VECTOR_COUNT}`);
    } else {
      details.push(`Stored ${storedCount} vectors: ${storeTime}ms`);
      details.push(`Rate: ${Math.round(storedCount / (storeTime / 1000))}/sec`);
    }

    // Test 3: Retrieve all vectors
    const retrieveStart = performance.now();
    const retrieved = await getAllVectors(db);
    const retrieveTime = Math.round(performance.now() - retrieveStart);

    if (retrieved.length !== TEST_VECTOR_COUNT) {
      success = false;
      details.push(`FAIL: Retrieved ${retrieved.length}/${TEST_VECTOR_COUNT}`);
    } else {
      details.push(`Retrieved ${retrieved.length}: ${retrieveTime}ms`);
    }

    // Verify embedding dimensions
    const sampleEmbedding = retrieved[0]?.embedding;
    if (sampleEmbedding?.length !== VECTOR_DIMENSIONS) {
      success = false;
      details.push(`FAIL: Wrong dims ${sampleEmbedding?.length}`);
    } else {
      details.push(`Dims verified: ${VECTOR_DIMENSIONS}`);
    }

    // Test 4: Delete by document ID
    const deleteStart = performance.now();
    const deletedCount = await deleteByDocumentId(db, 'doc-0');
    const deleteTime = Math.round(performance.now() - deleteStart);

    if (deletedCount !== 100) {
      success = false;
      details.push(`FAIL: Deleted ${deletedCount}/100`);
    } else {
      details.push(`Deleted doc-0: ${deletedCount} chunks, ${deleteTime}ms`);
    }

    // Verify deletion
    const afterDelete = await getAllVectors(db);
    if (afterDelete.length !== TEST_VECTOR_COUNT - 100) {
      success = false;
      details.push(`FAIL: After delete: ${afterDelete.length}`);
    }

    // Test 5: Estimate storage size
    try {
      const estimate = await navigator.storage.estimate();
      const usedMB = ((estimate.usage || 0) / (1024 * 1024)).toFixed(2);
      const quotaMB = ((estimate.quota || 0) / (1024 * 1024)).toFixed(0);
      details.push(`Storage: ${usedMB}MB / ${quotaMB}MB`);
    } catch {
      details.push('Storage estimate unavailable');
    }
  } catch (error) {
    success = false;
    const errorMsg = error instanceof Error ? error.message : String(error);
    details.push(`FAIL: ${errorMsg}`);
  } finally {
    // Cleanup
    if (db) {
      db.close();
    }
    try {
      await deleteDatabase();
    } catch {
      // Ignore cleanup errors
    }
  }

  return {
    name: 'indexeddb-vectors',
    success,
    duration: 0,
    details: details.join(' | '),
  };
}
