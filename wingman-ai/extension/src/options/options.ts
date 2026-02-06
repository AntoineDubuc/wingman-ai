import { ToastManager, ModalManager } from './sections/shared';
import { ThemeSection } from './sections/theme';
import { SpeakerFilterSection } from './sections/speaker-filter';
import { TranscriptionSection } from './sections/transcription';
import { CallSummarySection } from './sections/call-summary';
import { ApiKeysSection } from './sections/api-keys';
import { DriveSection } from './sections/drive';
import { PersonaSection } from './sections/personas';
import { ActivePersonasSection } from './sections/active-personas';
import { ConclaveSection } from './sections/conclave';
import { LangBuilderSection } from './sections/langbuilder';
import { TabManager } from './sections/tabs';

class OptionsController {
  private personas = new PersonaSection();
  private activePersonas = new ActivePersonasSection();

  async init(): Promise<void> {
    const toast = new ToastManager();
    const modal = new ModalManager();
    const ctx = {
      showToast: toast.show,
      showConfirmModal: modal.show,
    };

    // Cmd/Ctrl+S → save persona editor
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (this.personas.dirty) {
          this.personas.save();
        }
      }
    });

    // Warn on page leave with unsaved changes
    window.addEventListener('beforeunload', (e) => {
      if (this.personas.dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    });

    // Tutorials links
    const openTutorials = (e: Event) => {
      e.preventDefault();
      chrome.tabs.create({ url: chrome.runtime.getURL('src/tutorials/index.html') });
    };
    document.getElementById('open-tutorials')?.addEventListener('click', openTutorials);
    document.getElementById('open-tutorials-support')?.addEventListener('click', openTutorials);

    // Listen for persona changes to refresh the active personas list
    window.addEventListener('personas-changed', () => {
      this.activePersonas.refresh();
    });

    await Promise.all([
      new TabManager().init(),
      new ThemeSection().init(),
      new TranscriptionSection().init(ctx),
      new SpeakerFilterSection().init(ctx),
      new CallSummarySection().init(ctx),
      new ApiKeysSection().init(ctx),
      new DriveSection().init(ctx),
      new ConclaveSection().init(ctx),
      new LangBuilderSection().init(ctx),
      this.personas.init(ctx),
      this.activePersonas.init(ctx),
    ]);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const controller = new OptionsController();
  controller.init().catch((error) => {
    console.error('Failed to initialize options page:', error);
  });
});
