import type { OptionsContext } from './shared';
import { driveService } from '../../services/drive-service';

export class DriveSection {
  private ctx!: OptionsContext;
  private autosaveToggle: HTMLInputElement | null = null;
  private connectBtn: HTMLButtonElement | null = null;
  private disconnectBtn: HTMLButtonElement | null = null;
  private notConnectedEl: HTMLElement | null = null;
  private connectedEl: HTMLElement | null = null;
  private accountEmailEl: HTMLElement | null = null;
  private folderNameInput: HTMLInputElement | null = null;
  private formatRadios: NodeListOf<HTMLInputElement> | null = null;

  async init(ctx: OptionsContext): Promise<void> {
    this.ctx = ctx;

    this.autosaveToggle = document.getElementById('drive-autosave-toggle') as HTMLInputElement;
    this.connectBtn = document.getElementById('drive-connect-btn') as HTMLButtonElement;
    this.disconnectBtn = document.getElementById('drive-disconnect-btn') as HTMLButtonElement;
    this.notConnectedEl = document.getElementById('drive-not-connected');
    this.connectedEl = document.getElementById('drive-connected');
    this.accountEmailEl = document.getElementById('drive-account-email');
    this.folderNameInput = document.getElementById('drive-folder-name') as HTMLInputElement;
    this.formatRadios = document.querySelectorAll(
      'input[name="transcript-format"]'
    ) as NodeListOf<HTMLInputElement>;

    this.autosaveToggle?.addEventListener('change', () => this.save());
    this.connectBtn?.addEventListener('click', () => this.connect());
    this.disconnectBtn?.addEventListener('click', () => {
      this.ctx.showConfirmModal(
        'Disconnect Google Drive?',
        'Transcripts will no longer be automatically saved. You can reconnect at any time.',
        () => this.disconnect()
      );
    });
    this.folderNameInput?.addEventListener('change', () => this.save());
    this.formatRadios?.forEach((radio) => {
      radio.addEventListener('change', () => this.save());
    });

    await this.load();
  }

  private async load(): Promise<void> {
    try {
      const result = await chrome.storage.local.get([
        'driveAutosaveEnabled',
        'driveConnected',
        'driveAccountEmail',
        'driveFolderName',
        'transcriptFormat',
      ]);

      if (this.autosaveToggle) {
        this.autosaveToggle.checked = result.driveAutosaveEnabled ?? true;
      }

      if (this.folderNameInput) {
        this.folderNameInput.value = result.driveFolderName || 'Wingman Transcripts';
      }

      const format = result.transcriptFormat || 'googledoc';
      this.formatRadios?.forEach((radio) => {
        radio.checked = radio.value === format;
      });

      this.updateConnectionUI(result.driveConnected ?? false, result.driveAccountEmail);
    } catch (error) {
      console.error('Failed to load Drive settings:', error);
    }
  }

  private async save(): Promise<void> {
    try {
      const autosaveEnabled = this.autosaveToggle?.checked ?? true;
      const folderName = this.folderNameInput?.value?.trim() || 'Wingman Transcripts';

      let transcriptFormat = 'googledoc';
      this.formatRadios?.forEach((radio) => {
        if (radio.checked) transcriptFormat = radio.value;
      });

      await chrome.storage.local.set({
        driveAutosaveEnabled: autosaveEnabled,
        driveFolderName: folderName,
        transcriptFormat,
      });

      this.ctx.showToast('Drive settings saved', 'success');
    } catch (error) {
      console.error('Failed to save Drive settings:', error);
      this.ctx.showToast('Failed to save settings', 'error');
    }
  }

  private updateConnectionUI(connected: boolean, email?: string): void {
    if (connected && email) {
      if (this.notConnectedEl) this.notConnectedEl.style.display = 'none';
      if (this.connectedEl) this.connectedEl.style.display = 'flex';
      if (this.accountEmailEl) this.accountEmailEl.textContent = `Connected as ${email}`;
    } else {
      if (this.notConnectedEl) this.notConnectedEl.style.display = 'flex';
      if (this.connectedEl) this.connectedEl.style.display = 'none';
    }
  }

  private async connect(): Promise<void> {
    if (this.connectBtn) {
      this.connectBtn.disabled = true;
      this.connectBtn.textContent = 'Connecting...';
    }

    try {
      const result = await driveService.connect();

      if (result.success && result.email) {
        this.updateConnectionUI(true, result.email);
        this.ctx.showToast('Google Drive connected!', 'success');
      } else {
        this.ctx.showToast(result.error || 'Connection failed', 'error');
      }
    } catch (error) {
      console.error('Failed to connect Google Drive:', error);
      this.ctx.showToast('Failed to connect', 'error');
    } finally {
      if (this.connectBtn) {
        this.connectBtn.disabled = false;
        this.connectBtn.innerHTML =
          '<span class="drive-icon">\uD83D\uDCC1</span> Connect Google Account';
      }
    }
  }

  private async disconnect(): Promise<void> {
    try {
      await driveService.disconnect();
      this.updateConnectionUI(false);
      this.ctx.showToast('Google Drive disconnected', 'success');
    } catch (error) {
      console.error('Failed to disconnect Google Drive:', error);
      this.ctx.showToast('Failed to disconnect', 'error');
    }
  }
}
