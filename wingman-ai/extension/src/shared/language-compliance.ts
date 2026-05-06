/**
 * Language compliance instrumentation (FR-031).
 *
 * Tracks LLM response compliance with the user's selected non-English
 * locale. Goal: ≥95% of non-English LLM responses should match the
 * expected locale.
 *
 * Counters are persisted to `chrome.storage.local` so they survive
 * service-worker restarts. Reset on demand via `resetCompliance()`.
 *
 * Emission strategy: this module exposes a `getComplianceSnapshot()`
 * function that any release-readiness check can call. There is no
 * automatic remote-telemetry emit because the extension has no
 * backend (BYOK architecture). Future work: wire to a local-only
 * dashboard or a release-time `chrome://extensions` log inspector.
 */

import type { SupportedLocale } from './i18n-types';
import { isWrongLanguage } from './language-detection';

const STORAGE_KEY = 'language_compliance_v1';

interface ComplianceCounters {
  totalNonEnCalls: number;
  wrongLanguageCalls: number;
  /** ISO timestamp of the first call counted in this window. */
  windowStart: string;
  /** Per-locale breakdown for debugging. */
  byLocale: Partial<Record<SupportedLocale, { total: number; wrong: number }>>;
}

let inMemoryCache: ComplianceCounters | null = null;

async function loadCounters(): Promise<ComplianceCounters> {
  if (inMemoryCache) return inMemoryCache;
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const stored = result[STORAGE_KEY] as ComplianceCounters | undefined;
    if (stored) {
      inMemoryCache = stored;
      return stored;
    }
  } catch {
    // Storage unavailable in some contexts (jsdom test); fall through to default.
  }
  inMemoryCache = {
    totalNonEnCalls: 0,
    wrongLanguageCalls: 0,
    windowStart: new Date().toISOString(),
    byLocale: {},
  };
  return inMemoryCache;
}

async function saveCounters(c: ComplianceCounters): Promise<void> {
  inMemoryCache = c;
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: c });
  } catch {
    // Best-effort persistence — don't crash the LLM call path on a storage failure.
  }
}

/**
 * Record an LLM response and update compliance counters. Call this AFTER
 * receiving the LLM response. English locale is a no-op (FR-011 only
 * applies to non-en).
 */
export async function recordLlmResponse(
  responseText: string,
  expectedLocale: SupportedLocale,
): Promise<void> {
  if (expectedLocale === 'en') return; // baseline; not measured
  const counters = await loadCounters();
  counters.totalNonEnCalls += 1;
  const localeBucket = counters.byLocale[expectedLocale] ?? { total: 0, wrong: 0 };
  localeBucket.total += 1;
  if (isWrongLanguage(responseText, expectedLocale)) {
    counters.wrongLanguageCalls += 1;
    localeBucket.wrong += 1;
    console.warn(
      `[i18n-compliance] Wrong-language response for ${expectedLocale}: ` +
      `${counters.wrongLanguageCalls}/${counters.totalNonEnCalls} (` +
      `${(counters.wrongLanguageCalls / counters.totalNonEnCalls * 100).toFixed(1)}% non-compliant)`,
    );
  }
  counters.byLocale[expectedLocale] = localeBucket;
  await saveCounters(counters);
}

export interface ComplianceSnapshot {
  totalNonEnCalls: number;
  wrongLanguageCalls: number;
  compliancePercent: number;
  meetsTarget: boolean;
  windowStart: string;
  byLocale: Partial<Record<SupportedLocale, { total: number; wrong: number; compliancePercent: number }>>;
}

const COMPLIANCE_TARGET = 0.95;

/**
 * Read the current compliance snapshot. Returns 100% if no calls have been
 * recorded yet (vacuously true).
 */
export async function getComplianceSnapshot(): Promise<ComplianceSnapshot> {
  const c = await loadCounters();
  const compliancePercent = c.totalNonEnCalls === 0
    ? 1
    : 1 - (c.wrongLanguageCalls / c.totalNonEnCalls);
  const byLocale: ComplianceSnapshot['byLocale'] = {};
  for (const [locale, bucket] of Object.entries(c.byLocale)) {
    if (!bucket) continue;
    byLocale[locale as SupportedLocale] = {
      total: bucket.total,
      wrong: bucket.wrong,
      compliancePercent: bucket.total === 0 ? 1 : 1 - (bucket.wrong / bucket.total),
    };
  }
  return {
    totalNonEnCalls: c.totalNonEnCalls,
    wrongLanguageCalls: c.wrongLanguageCalls,
    compliancePercent,
    meetsTarget: compliancePercent >= COMPLIANCE_TARGET,
    windowStart: c.windowStart,
    byLocale,
  };
}

/** Reset counters and start a new measurement window. */
export async function resetCompliance(): Promise<void> {
  const fresh: ComplianceCounters = {
    totalNonEnCalls: 0,
    wrongLanguageCalls: 0,
    windowStart: new Date().toISOString(),
    byLocale: {},
  };
  await saveCounters(fresh);
}
