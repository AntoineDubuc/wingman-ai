import * as pdfjsLib from 'pdfjs-dist';
import { lexer, type Token, type Tokens } from 'marked';

// Disable worker for service worker compatibility
pdfjsLib.GlobalWorkerOptions.workerSrc = '';

const PDF_TIMEOUT_MS = 30_000;

/**
 * Extract text from a File based on its type.
 * Returns the extracted text and an optional warning (e.g. scanned PDF).
 */
export async function extractText(
  file: File
): Promise<{ text: string; warning?: string }> {
  const ext = file.name.split('.').pop()?.toLowerCase();

  switch (ext) {
    case 'pdf':
      return extractFromPDF(file);
    case 'md':
    case 'markdown':
      return { text: await extractFromMarkdown(file) };
    case 'txt':
      return { text: await extractFromText(file) };
    default:
      throw new Error(`Unsupported file type: .${ext}`);
  }
}

async function extractFromPDF(
  file: File
): Promise<{ text: string; warning?: string }> {
  const buffer = await file.arrayBuffer();

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    disableAutoFetch: true,
    useSystemFonts: true,
  });

  // Timeout protection
  const doc = await Promise.race([
    loadingTask.promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => {
        loadingTask.destroy();
        reject(new Error('PDF processing timed out'));
      }, PDF_TIMEOUT_MS)
    ),
  ]);

  const pages: string[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ');
    pages.push(text.trim());
  }

  doc.destroy();

  const fullText = pages.filter((p) => p.length > 0).join('\n\n');

  if (!fullText.trim()) {
    return {
      text: '',
      warning:
        'This PDF appears to be a scanned image. Please upload a text-based document.',
    };
  }

  return { text: fullText };
}

async function extractFromMarkdown(file: File): Promise<string> {
  const raw = await file.text();
  const tokens = lexer(raw);
  return tokensToText(tokens);
}

function tokensToText(tokens: Token[]): string {
  const parts: string[] = [];

  for (const token of tokens) {
    switch (token.type) {
      case 'heading':
        parts.push(`${(token as Tokens.Heading).text}:`);
        break;
      case 'paragraph':
        parts.push((token as Tokens.Paragraph).text);
        break;
      case 'list':
        for (const item of (token as Tokens.List).items) {
          parts.push(`- ${item.text}`);
        }
        break;
      case 'code':
        parts.push((token as Tokens.Code).text);
        break;
      case 'blockquote':
        parts.push((token as Tokens.Blockquote).text);
        break;
      case 'table': {
        const table = token as Tokens.Table;
        for (const row of table.rows) {
          parts.push(row.map((cell) => cell.text).join(' | '));
        }
        break;
      }
      case 'space':
        break;
      default:
        if ('text' in token) {
          parts.push((token as { text: string }).text);
        }
        break;
    }
  }

  return parts.join('\n\n');
}

async function extractFromText(file: File): Promise<string> {
  const raw = await file.text();
  // Normalize line endings and trim
  return raw.replace(/\r\n/g, '\n').trim();
}
