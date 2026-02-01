import type { OptionsContext } from './shared';
import { kbDatabase, ingestDocument, isIngesting } from '../../services/kb/kb-database';
import { searchKB } from '../../services/kb/kb-search';

export class KnowledgeBaseSection {
  private ctx!: OptionsContext;
  private dropZone: HTMLElement | null = null;
  private fileInput: HTMLInputElement | null = null;
  private progress: HTMLElement | null = null;
  private progressFill: HTMLElement | null = null;
  private progressText: HTMLElement | null = null;
  private docList: HTMLElement | null = null;
  private empty: HTMLElement | null = null;
  private testSection: HTMLElement | null = null;
  private testInput: HTMLInputElement | null = null;
  private testBtn: HTMLButtonElement | null = null;
  private testResults: HTMLElement | null = null;
  private stats: HTMLElement | null = null;

  async init(ctx: OptionsContext): Promise<void> {
    this.ctx = ctx;

    this.dropZone = document.getElementById('kb-drop-zone');
    this.fileInput = document.getElementById('kb-file-input') as HTMLInputElement;
    this.progress = document.getElementById('kb-progress');
    this.progressFill = document.getElementById('kb-progress-fill');
    this.progressText = document.getElementById('kb-progress-text');
    this.docList = document.getElementById('kb-doc-list');
    this.empty = document.getElementById('kb-empty');
    this.testSection = document.getElementById('kb-test-section');
    this.testInput = document.getElementById('kb-test-input') as HTMLInputElement;
    this.testBtn = document.getElementById('kb-test-btn') as HTMLButtonElement;
    this.testResults = document.getElementById('kb-test-results');
    this.stats = document.getElementById('kb-stats');

    this.dropZone?.addEventListener('click', () => this.fileInput?.click());
    this.dropZone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.dropZone?.classList.add('drag-over');
    });
    this.dropZone?.addEventListener('dragleave', () => {
      this.dropZone?.classList.remove('drag-over', 'drag-invalid');
    });
    this.dropZone?.addEventListener('drop', (e) => {
      e.preventDefault();
      this.dropZone?.classList.remove('drag-over', 'drag-invalid');
      const files = (e as DragEvent).dataTransfer?.files;
      if (files) this.handleFiles(files);
    });
    this.fileInput?.addEventListener('change', () => {
      const files = this.fileInput?.files;
      if (files) this.handleFiles(files);
      if (this.fileInput) this.fileInput.value = '';
    });
    this.testBtn?.addEventListener('click', () => this.testQuery());
    this.testInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.testQuery();
    });

    await this.initDB();
  }

  private async initDB(): Promise<void> {
    try {
      await kbDatabase.init();

      const incomplete = await kbDatabase.getIncompleteDocuments();
      for (const doc of incomplete) {
        await kbDatabase.deleteDocument(doc.id);
        console.log(`[KB] Cleaned up incomplete: ${doc.filename}`);
      }
      if (incomplete.length > 0) {
        this.ctx.showToast(
          `Cleaned up ${incomplete.length} incomplete upload(s)`,
          'success'
        );
      }

      await this.renderDocList();
    } catch (error) {
      console.error('Failed to init KB:', error);
    }
  }

  private async handleFiles(files: FileList): Promise<void> {
    if (isIngesting()) {
      this.ctx.showToast('Processing in progress. Please wait.', 'error');
      return;
    }

    for (const file of Array.from(files)) {
      await this.processFile(file);
    }
  }

  private async processFile(file: File): Promise<void> {
    if (this.progress) this.progress.hidden = false;
    this.dropZone?.classList.add('disabled');

    const result = await ingestDocument(file, (_stage, percent) => {
      if (this.progressFill) this.progressFill.style.width = `${percent}%`;
      if (this.progressText)
        this.progressText.textContent = `Processing: ${file.name}...`;
    });

    if (this.progress) this.progress.hidden = true;
    if (this.progressFill) this.progressFill.style.width = '0%';
    this.dropZone?.classList.remove('disabled');

    if (result.success) {
      this.ctx.showToast(
        `${file.name} added (${result.chunkCount} sections)`,
        'success'
      );
    } else {
      this.ctx.showToast(result.error ?? 'Failed to process file', 'error');
    }

    await this.renderDocList();
  }

  private async renderDocList(): Promise<void> {
    const docs = await kbDatabase.getDocuments();
    const completeDocs = docs.filter((d) => d.status === 'complete');

    if (this.empty) {
      this.empty.style.display = completeDocs.length === 0 ? 'block' : 'none';
    }

    if (this.testSection) {
      this.testSection.hidden = completeDocs.length === 0;
    }

    if (this.docList) {
      this.docList.innerHTML = '';
      for (const doc of completeDocs) {
        const item = document.createElement('div');
        item.className = 'kb-doc-item';
        item.dataset.id = doc.id;

        const ago = this.timeAgo(doc.uploadedAt);
        const size = this.formatFileSize(doc.fileSize);

        item.innerHTML = `
          <span class="kb-doc-icon">\uD83D\uDCC4</span>
          <div class="kb-doc-info">
            <span class="kb-doc-name" title="${doc.filename}">${doc.filename}</span>
            <span class="kb-doc-meta">${doc.chunkCount} sections \u00B7 ${size} \u00B7 Added ${ago}</span>
          </div>
          <button class="kb-doc-delete" title="Delete">\uD83D\uDDD1\uFE0F</button>
        `;

        const deleteBtn = item.querySelector('.kb-doc-delete') as HTMLButtonElement;
        deleteBtn.addEventListener('click', () => {
          this.ctx.showConfirmModal(
            'Delete document?',
            `Remove "${doc.filename}" from your knowledge base? This cannot be undone.`,
            () => this.deleteDocument(doc.id, doc.filename)
          );
        });

        this.docList.appendChild(item);
      }
    }

    await this.updateStats();
  }

  private async deleteDocument(docId: string, filename: string): Promise<void> {
    try {
      await kbDatabase.deleteDocument(docId);
      this.ctx.showToast(`Deleted ${filename}`, 'success');
      await this.renderDocList();
    } catch (error) {
      console.error('Failed to delete KB document:', error);
      this.ctx.showToast('Failed to delete document', 'error');
    }
  }

  private async updateStats(): Promise<void> {
    if (!this.stats) return;

    const kbStats = await kbDatabase.getStats();
    if (kbStats.docCount === 0) {
      this.stats.textContent = '';
      return;
    }

    const storageStr = this.formatFileSize(kbStats.storageUsed);
    this.stats.textContent = `${kbStats.docCount} document${kbStats.docCount !== 1 ? 's' : ''} \u00B7 ${kbStats.chunkCount} sections \u00B7 ${storageStr} used`;
  }

  private async testQuery(): Promise<void> {
    const query = this.testInput?.value?.trim();
    if (!query) {
      this.ctx.showToast('Enter a test query', 'error');
      return;
    }

    if (this.testBtn) {
      this.testBtn.disabled = true;
      this.testBtn.textContent = 'Searching...';
    }

    try {
      const results = await searchKB(query);

      if (this.testResults) {
        if (results.length === 0) {
          this.testResults.innerHTML =
            '<p class="kb-empty">No matching sections found. Try a different query.</p>';
        } else {
          this.testResults.innerHTML = results
            .map(
              (r) => `
              <div class="kb-test-result">
                <div class="kb-test-result-source">\uD83D\uDCC4 ${r.documentName}</div>
                <div class="kb-test-result-text">${r.chunk.text.slice(0, 300)}${r.chunk.text.length > 300 ? '...' : ''}</div>
              </div>
            `
            )
            .join('');
          this.testResults.innerHTML +=
            '<p class="kb-stats">This is what Wingman will use to answer similar questions.</p>';
        }
      }
    } catch (error) {
      console.error('KB test query failed:', error);
      this.ctx.showToast('Test query failed. Check your API key.', 'error');
    } finally {
      if (this.testBtn) {
        this.testBtn.disabled = false;
        this.testBtn.textContent = 'Test';
      }
    }
  }

  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  private timeAgo(timestamp: number): string {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'yesterday';
    return `${days} days ago`;
  }
}
