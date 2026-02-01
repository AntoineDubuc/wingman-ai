export class ThemeSection {
  private toggle: HTMLButtonElement | null = null;

  async init(): Promise<void> {
    this.toggle = document.getElementById('theme-toggle') as HTMLButtonElement;
    this.toggle?.addEventListener('click', () => this.toggleTheme());
    await this.load();
  }

  private async load(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(['theme']);
      if (result.theme) {
        document.documentElement.setAttribute('data-theme', result.theme);
      }
    } catch (error) {
      console.error('Failed to load theme:', error);
    }
  }

  private async toggleTheme(): Promise<void> {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    let newTheme: string;
    if (currentTheme === 'dark') {
      newTheme = 'light';
    } else if (currentTheme === 'light') {
      newTheme = 'dark';
    } else {
      newTheme = prefersDark ? 'light' : 'dark';
    }

    document.documentElement.setAttribute('data-theme', newTheme);

    try {
      await chrome.storage.local.set({ theme: newTheme });
    } catch (error) {
      console.error('Failed to save theme:', error);
    }
  }
}
