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
import { PanelLayoutSection } from './sections/panel-layout';
import { TabManager } from './sections/tabs';
import { SetupImportSection } from './sections/setup-import';
import { WebSearchSection } from './sections/web-search';

class OptionsController {
  private personas = new PersonaSection();
  private activePersonas = new ActivePersonasSection();
  private apiKeys = new ApiKeysSection();
  private setupImport = new SetupImportSection();

  async init(): Promise<void> {
    const toast = new ToastManager();
    const modal = new ModalManager();
    const ctx = {
      showToast: toast.show,
      showConfirmModal: modal.show,
      showConfirmModalNode: modal.showNode,
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
      new PanelLayoutSection().init(),
      new CallSummarySection().init(ctx),
      this.apiKeys.init(ctx),
      new DriveSection().init(ctx),
      new ConclaveSection().init(ctx),
      new LangBuilderSection().init(ctx),
      this.personas.init(ctx),
      this.activePersonas.init(ctx),
      new WebSearchSection().init(ctx),
    ]);

    // SetupImportSection depends on personas and apiKeys being initialized
    // (it calls their public refresh() methods).
    await this.setupImport.init(ctx, this.personas, this.apiKeys);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const controller = new OptionsController();
  controller.init().catch((error) => {
    console.error('Failed to initialize options page:', error);
  });
});
