/**
 * Validation Test: PDF.js Text Extraction
 *
 * Tests that PDF.js can extract text in the extension environment.
 * May require offscreen document if service worker doesn't work.
 */

import type { ValidationResult } from './index';

// Minimal PDF with text "Hello World" - base64 encoded
// This is a valid PDF 1.4 file with a single page containing "Hello World"
const SAMPLE_PDF_BASE64 = `JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSAvQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgNSAwIFIgPj4gPj4gPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCA0NCA+PgpzdHJlYW0KQlQKL0YxIDI0IFRmCjEwMCA3MDAgVGQKKEhlbGxvIFdvcmxkKSBUagpFVAplbmRzdHJlYW0KZW5kb2JqCjUgMCBvYmoKPDwgL1R5cGUgL0ZvbnQgL1N1YnR5cGUgL1R5cGUxIC9CYXNlRm9udCAvSGVsdmV0aWNhID4+CmVuZG9iagp4cmVmCjAgNgowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMDkgMDAwMDAgbiAKMDAwMDAwMDA1OCAwMDAwMCBuIAowMDAwMDAwMTE1IDAwMDAwIG4gCjAwMDAwMDAyNzAgMDAwMDAgbiAKMDAwMDAwMDM2MyAwMDAwMCBuIAp0cmFpbGVyCjw8IC9TaXplIDYgL1Jvb3QgMSAwIFIgPj4Kc3RhcnR4cmVmCjQ0MwolJUVPRg==`;

/**
 * Convert base64 to Uint8Array
 */
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Attempt to load PDF.js dynamically
 */
async function loadPdfJs(): Promise<typeof import('pdfjs-dist') | null> {
  try {
    // Check if we're in Node.js (no window)
    const isNode = typeof window === 'undefined';

    if (isNode) {
      // Use legacy build for Node.js compatibility
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      // For Node.js, we need to configure the worker before use
      // Set a fake worker URL to prevent worker creation errors
      pdfjs.GlobalWorkerOptions.workerSrc = 'data:application/javascript,';
      return pdfjs as unknown as typeof import('pdfjs-dist');
    } else {
      // Use standard build for browser
      const pdfjs = await import('pdfjs-dist');
      return pdfjs;
    }
  } catch (error) {
    console.error('[PDF Test] Failed to import pdfjs-dist:', error);
    return null;
  }
}

export async function testPdfExtraction(): Promise<ValidationResult> {
  const details: string[] = [];
  let success = true;

  // Test 1: Check if pdfjs-dist is available
  details.push('Attempting to load PDF.js...');

  const pdfjs = await loadPdfJs();

  if (!pdfjs) {
    return {
      name: 'pdf-extraction',
      success: false,
      duration: 0,
      details: 'pdfjs-dist not installed. Run: npm install pdfjs-dist',
      error: 'Module not found',
    };
  }

  details.push('PDF.js loaded');

  // Test 2: Try to parse the sample PDF
  try {
    const pdfData = base64ToUint8Array(SAMPLE_PDF_BASE64);
    details.push(`PDF data: ${pdfData.length} bytes`);

    // Disable worker for service worker / Node.js compatibility
    // Setting workerSrc to empty string and using disableWorker option
    pdfjs.GlobalWorkerOptions.workerSrc = '';

    const start = performance.now();
    // Cast to any to allow disableWorker option (works at runtime but not in types)
    const loadingTask = pdfjs.getDocument({
      data: pdfData,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const pdf = await loadingTask.promise;
    const loadTime = Math.round(performance.now() - start);

    details.push(`PDF loaded: ${pdf.numPages} page(s), ${loadTime}ms`);

    // Test 3: Extract text from first page
    const page = await pdf.getPage(1);
    const textContent = await page.getTextContent();
    const extractTime = Math.round(performance.now() - start - loadTime);

    // Extract text, handling the TextItem type properly
    const text = textContent.items
      .map((item) => {
        if ('str' in item) {
          return item.str;
        }
        return '';
      })
      .join(' ')
      .trim();

    details.push(`Extracted text: "${text}" (${extractTime}ms)`);

    // Verify text matches expected
    if (text.includes('Hello') && text.includes('World')) {
      details.push('Text extraction verified');
    } else {
      success = false;
      details.push(`FAIL: Expected "Hello World", got "${text}"`);
    }
  } catch (error) {
    success = false;
    const errorMsg = error instanceof Error ? error.message : String(error);
    details.push(`FAIL: PDF parsing error - ${errorMsg}`);

    // Check if it's a worker-related error
    if (errorMsg.includes('worker') || errorMsg.includes('Worker')) {
      details.push('NOTE: May need offscreen document for PDF.js worker');
    }
  }

  return {
    name: 'pdf-extraction',
    success,
    duration: 0,
    details: details.join(' | '),
  };
}
