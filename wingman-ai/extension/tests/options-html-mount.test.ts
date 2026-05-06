/**
 * Tests for Plan 2 Task 1: language-picker-container HTML mount point.
 *
 * Asserts that #language-picker-container exists in options.html and is
 * a descendant of #panel-setup, positioned as the first card in the panel.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('options.html: language-picker-container mount point', () => {
  const html = readFileSync(resolve(__dirname, '../src/options/options.html'), 'utf8');

  it('AC-T1-1: #language-picker-container exists in options.html', () => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const container = doc.querySelector('#language-picker-container');
    expect(container).not.toBeNull();
  });

  it('AC-T1-1: #language-picker-container is a descendant of #panel-setup', () => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const setupPanel = doc.querySelector('#panel-setup');
    expect(setupPanel).not.toBeNull();
    const container = setupPanel!.querySelector('#language-picker-container');
    expect(container).not.toBeNull();
  });

  it('AC-T1-2: #language-picker-container is the first picker-related card in #panel-setup', () => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const setupPanel = doc.querySelector('#panel-setup');
    expect(setupPanel).not.toBeNull();

    // Find the first .options-card and confirm it contains the picker container.
    const firstCard = setupPanel!.querySelector('.options-card');
    expect(firstCard).not.toBeNull();
    const container = firstCard!.querySelector('#language-picker-container');
    expect(container).not.toBeNull();
  });

  it('AC-T1-3: no inline string literals beyond a comment inside the picker card', () => {
    // The picker card should contain ONLY the container div + an HTML comment.
    // No <h2>, <p>, or other text content (those keys don't exist in the bundles).
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const setupPanel = doc.querySelector('#panel-setup');
    const firstCard = setupPanel!.querySelector('.options-card');
    const container = firstCard!.querySelector('#language-picker-container');

    // The card's children that are Element nodes: should be exactly 1 (the container).
    const elementChildren = Array.from(firstCard!.children);
    expect(elementChildren).toHaveLength(1);
    expect(elementChildren[0]).toBe(container);
  });
});
