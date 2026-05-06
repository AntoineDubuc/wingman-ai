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
import { initOptionsI18n, renderLanguagePicker, handleStorageChange } from './options-locale';
import { installationStateService } from '../services/installation-state';
import type { i18n as I18n } from 'i18next';
import type { SupportedLocale } from '../shared/i18n-types';

// chrome.runtime.sendMessage without an explicit extensionId is sender-authenticated to this
// extension's own service worker — the SW will only respond to messages from this extension's
// own contexts (popup, options, content scripts). No cross-extension trust boundary is crossed.
async function fetchSessionActive(): Promise<boolean> {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
    return response?.isSessionActive === true;
  } catch {
    return false;
  }
}

// Cadence for polling the SW's GET_STATUS to detect session start/stop transitions
// for FR-009 picker lock dynamics. Aligned with the popup's existing pattern.
export const SESSION_POLL_INTERVAL_MS = 1000;

/**
 * Polls the SW for session-active state. On transition, re-renders the picker
 * with the new sessionActive value so FR-009 lock dynamics work at runtime.
 * Uses an in-flight guard to prevent out-of-order resolves on slow SW replies.
 */
function startSessionStatePoll(
  i18n: I18n,
  locale: SupportedLocale,
  initialSessionActive: boolean,
): { stop: () => void } {
  let lastSeen = initialSessionActive;
  let inFlight = false;
  const tick = async () => {
    if (document.hidden) return;
    if (inFlight) return;
    inFlight = true;
    try {
      const next = await fetchSessionActive();
      if (next !== lastSeen) {
        lastSeen = next;
        renderLanguagePicker(i18n, locale, next);
      }
    } finally {
      inFlight = false;
    }
  };
  const intervalId = window.setInterval(tick, SESSION_POLL_INTERVAL_MS);
  return {
    stop: () => clearInterval(intervalId),
  };
}

/**
 * Wires up the language picker on the Options page Setup tab.
 * Reads initial session state from the SW, renders the picker, registers a
 * chrome.storage.onChanged listener so cross-context locale changes propagate,
 * and returns a stop() handle for cleanup (Task 4 will add the polling
 * teardown to this handle).
 */
export async function setupLanguagePickerWiring(
  i18n: I18n,
  locale: SupportedLocale,
): Promise<{ stop: () => void }> {
  const initialSessionActive = await fetchSessionActive();
  renderLanguagePicker(i18n, locale, initialSessionActive);

  // Listener registers AFTER the initial render so the first paint is not
  // interrupted by an in-flight reload. handleStorageChange itself gates on
  // areaName === 'sync' and 'language_preference' in changes; it never writes
  // back to storage (verified by AC-T3-5/T3-6).
  const rerender = () => window.location.reload();
  chrome.storage.onChanged.addListener((changes, areaName) => {
    void handleStorageChange(changes, areaName, i18n, rerender);
  });

  return startSessionStatePoll(i18n, locale, initialSessionActive);
}

export async function maybeShowUpgradeBanner(i18n: I18n): Promise<void> {
  const state = await installationStateService.getState();
  if (state !== 'UPGRADE_PENDING') return;

  const banner = document.createElement('div');
  banner.id = 'localization-upgrade-banner';
  banner.className = 'upgrade-banner';

  const title = document.createElement('h3');
  title.textContent = i18n.t('options.upgrade_banner.title');

  const body = document.createElement('p');
  body.textContent = i18n.t('options.upgrade_banner.body');

  const dismissButton = document.createElement('button');
  dismissButton.textContent = i18n.t('options.upgrade_banner.dismiss_button');
  dismissButton.addEventListener('click', async () => {
    await installationStateService.acknowledgeUpgrade();
    banner.remove();
  });

  banner.appendChild(title);
  banner.appendChild(body);
  banner.appendChild(dismissButton);

  const content = document.querySelector('.options-content');
  if (content) {
    content.insertBefore(banner, content.firstChild);
  }
}

class OptionsController {
  private personas = new PersonaSection();
  private activePersonas = new ActivePersonasSection();
  private apiKeys = new ApiKeysSection();
  private setupImport = new SetupImportSection();

  async init(): Promise<void> {
    // Initialize i18n first
    const { i18n, locale } = await initOptionsI18n();
    await maybeShowUpgradeBanner(i18n);
    await setupLanguagePickerWiring(i18n, locale);

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
