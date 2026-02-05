/**
 * Vitest global setup — mocks the chrome.* API for unit tests.
 *
 * Uses @webext-core/fake-browser for storage and runtime,
 * plus manual stubs for APIs fake-browser doesn't cover
 * (permissions, identity, action, tabs beyond CRUD).
 */

import { fakeBrowser } from '@webext-core/fake-browser';
import { beforeEach, vi } from 'vitest';

// Bridge: fake-browser implements browser.*, Wingman uses chrome.*
// Cast to any because fake-browser types don't 1:1 match @types/chrome,
// but the runtime behavior (get/set/sendMessage) is compatible.
const chromeMock = {
  storage: {
    local: {
      get: (keys: string | string[] | Record<string, unknown> | null) =>
        fakeBrowser.storage.local.get(keys as any),
      set: (items: Record<string, unknown>) =>
        fakeBrowser.storage.local.set(items),
      remove: (keys: string | string[]) =>
        fakeBrowser.storage.local.remove(keys as any),
      clear: () => fakeBrowser.storage.local.clear(),
      onChanged: fakeBrowser.storage.local.onChanged,
    },
    sync: fakeBrowser.storage.sync,
    session: fakeBrowser.storage.session,
    onChanged: fakeBrowser.storage.onChanged,
  },
  runtime: {
    id: fakeBrowser.runtime.id,
    getURL: fakeBrowser.runtime.getURL,
    sendMessage: vi.fn(),
    onMessage: fakeBrowser.runtime.onMessage,
    openOptionsPage: vi.fn(),
  },
  permissions: {
    contains: vi.fn().mockResolvedValue(true),
    request: vi.fn().mockResolvedValue(true),
    remove: vi.fn().mockResolvedValue(true),
  },
  identity: {
    getAuthToken: vi.fn(),
    launchWebAuthFlow: vi.fn(),
    removeCachedAuthToken: vi.fn(),
  },
  action: {
    openPopup: vi.fn(),
    setBadgeText: vi.fn(),
    setBadgeBackgroundColor: vi.fn(),
  },
  tabs: {
    create: vi.fn(),
    query: vi.fn().mockResolvedValue([]),
    sendMessage: vi.fn(),
  },
};

// Install as global
Object.defineProperty(globalThis, 'chrome', {
  value: chromeMock,
  writable: true,
  configurable: true,
});

// Reset all state before each test
beforeEach(() => {
  fakeBrowser.reset();
  vi.clearAllMocks();
});
