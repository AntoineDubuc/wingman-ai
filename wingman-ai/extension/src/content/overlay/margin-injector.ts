/**
 * Margin Injector — pushes Google Meet content aside when docked.
 *
 * Standalone module importable by both content-script.ts and dockable.ts.
 * Both run in the same content script context (same `document`), so the
 * module-level state is shared correctly.
 *
 * Primary approach: set margin on document.body.
 * Fallback: inject a <style> tag with !important if direct style doesn't work.
 *
 * removeDockMargin() is idempotent — multiple calls are harmless no-ops.
 */

let marginApplied = false;
let fallbackStyleEl: HTMLStyleElement | null = null;

/**
 * Inject margin on the page to push content aside for a docked panel.
 *
 * @param side - Which side the panel is docked on ('left' or 'right')
 * @param width - Panel width in pixels
 */
export function injectDockMargin(side: 'left' | 'right', width: number): void {
  const prop = side === 'left' ? 'margin-left' : 'margin-right';
  const value = `${width}px`;

  // Primary: direct body style
  document.body.style.setProperty(prop, value);

  // Clean the other side if switching
  const otherProp = side === 'left' ? 'margin-right' : 'margin-left';
  if (document.body.style.getPropertyValue(otherProp) && marginApplied) {
    document.body.style.removeProperty(otherProp);
  }

  // Also inject a fallback <style> tag in case direct style is overridden
  if (!fallbackStyleEl) {
    fallbackStyleEl = document.createElement('style');
    fallbackStyleEl.id = 'wingman-dock-margin';
    document.head.appendChild(fallbackStyleEl);
  }
  fallbackStyleEl.textContent = `body { ${prop}: ${value} !important; }`;

  marginApplied = true;
}

/**
 * Remove all dock margins. Idempotent — safe to call multiple times.
 */
export function removeDockMargin(): void {
  if (!marginApplied) return;

  // Remove direct styles
  document.body.style.removeProperty('margin-left');
  document.body.style.removeProperty('margin-right');

  // Remove fallback style tag
  if (fallbackStyleEl) {
    fallbackStyleEl.remove();
    fallbackStyleEl = null;
  }

  marginApplied = false;
}
