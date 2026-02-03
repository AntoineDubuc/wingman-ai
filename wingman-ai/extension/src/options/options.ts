import { ToastManager, ModalManager } from './sections/shared';
import { ThemeSection } from './sections/theme';
import { SpeakerFilterSection } from './sections/speaker-filter';
import { TranscriptionSection } from './sections/transcription';
import { CallSummarySection } from './sections/call-summary';
import { ApiKeysSection } from './sections/api-keys';
import { DriveSection } from './sections/drive';
import { SystemPromptSection } from './sections/system-prompt';
import { KnowledgeBaseSection } from './sections/knowledge-base';
import { PersonaSection } from './sections/personas';
import { TabManager } from './sections/tabs';

class OptionsController {
  private systemPrompt = new SystemPromptSection();
  private personas = new PersonaSection();

  async init(): Promise<void> {
    const toast = new ToastManager();
    const modal = new ModalManager();
    const ctx = {
      showToast: toast.show,
      showConfirmModal: modal.show,
    };

    // Cmd/Ctrl+S → save active editor (persona or system prompt)
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        // Save persona if editing, otherwise save system prompt
        if (this.personas.dirty) {
          this.personas.save();
        } else {
          this.systemPrompt.save();
        }
      }
    });

    // Warn on page leave with unsaved changes
    window.addEventListener('beforeunload', (e) => {
      if (this.systemPrompt.dirty || this.personas.dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    });

    // Tutorials link
    document.getElementById('open-tutorials')?.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: chrome.runtime.getURL('src/tutorials/index.html') });
    });

    await Promise.all([
      new TabManager().init(),
      new ThemeSection().init(),
      new TranscriptionSection().init(ctx),
      new SpeakerFilterSection().init(ctx),
      new CallSummarySection().init(ctx),
      new ApiKeysSection().init(ctx),
      new DriveSection().init(ctx),
      this.systemPrompt.init(ctx),
      new KnowledgeBaseSection().init(ctx),
      this.personas.init(ctx),
    ]);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const controller = new OptionsController();
  controller.init().catch((error) => {
    console.error('Failed to initialize options page:', error);
  });
});
