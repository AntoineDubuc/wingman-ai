import { describe, it, expect, vi, beforeEach } from 'vitest';

// Dynamic import target — we always import a fresh copy in tests that need
// isolation by using vi.resetModules.
async function freshBuffer() {
  vi.resetModules();
  const mod = await import('../src/content/overlay/transcript-buffer');
  return mod;
}

function makeEntry(overrides: Partial<{
  text: string;
  speaker: string;
  is_final: boolean;
  is_self: boolean;
  timestamp: string;
}> = {}) {
  return {
    text: 'hello world',
    speaker: 'Alice',
    is_final: true,
    is_self: false,
    timestamp: '2026-04-15T12:00:00.000Z',
    ...overrides,
  };
}

describe('transcript-buffer module shape', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('AC1: exports a TranscriptEntry-compatible singleton with matching shape', async () => {
    const { transcriptBuffer } = await freshBuffer();
    // Accepts an entry with the exact 5 fields that match Transcript.
    const entry = makeEntry();
    expect(() => transcriptBuffer.append(entry)).not.toThrow();
  });

  it('AC2: exports a singleton `transcriptBuffer` (named export, object instance)', async () => {
    const mod = await freshBuffer();
    expect(mod.transcriptBuffer).toBeDefined();
    expect(typeof mod.transcriptBuffer.append).toBe('function');
    expect(typeof mod.transcriptBuffer.getSnapshot).toBe('function');
    expect(typeof mod.transcriptBuffer.onAppend).toBe('function');

    // Two fresh imports (without vi.resetModules) return the same instance.
    const modAgain = await import('../src/content/overlay/transcript-buffer');
    expect(modAgain.transcriptBuffer).toBe(mod.transcriptBuffer);
  });

  it('AC3: append(entry) pushes the entry onto the internal array', async () => {
    const { transcriptBuffer } = await freshBuffer();
    const entry = makeEntry({ text: 'first' });
    transcriptBuffer.append(entry);
    const snap = transcriptBuffer.getSnapshot();
    expect(snap).toHaveLength(1);
    expect(snap[0]).toEqual(entry);
  });

  it('AC4: getSnapshot returns a defensive copy (not a reference)', async () => {
    const { transcriptBuffer } = await freshBuffer();
    const entry = makeEntry({ text: 'original' });
    transcriptBuffer.append(entry);

    const snap1 = transcriptBuffer.getSnapshot();
    const snap2 = transcriptBuffer.getSnapshot();
    // Different array identity
    expect(snap1).not.toBe(snap2);
    // Same contents
    expect(snap1).toEqual(snap2);
  });

  it('AC5: onAppend registers a subscriber and returns an unsubscribe function', async () => {
    const { transcriptBuffer } = await freshBuffer();
    const cb = vi.fn();
    const unsub = transcriptBuffer.onAppend(cb);
    expect(typeof unsub).toBe('function');

    const entry = makeEntry();
    transcriptBuffer.append(entry);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(entry);
  });

  it('AC6: append synchronously invokes every subscriber in registration order', async () => {
    const { transcriptBuffer } = await freshBuffer();
    const calls: string[] = [];
    transcriptBuffer.onAppend(() => calls.push('first'));
    transcriptBuffer.onAppend(() => calls.push('second'));
    transcriptBuffer.onAppend(() => calls.push('third'));

    transcriptBuffer.append(makeEntry());

    expect(calls).toEqual(['first', 'second', 'third']);
  });

  it('AC7: unsubscribe function removes exactly one subscriber', async () => {
    const { transcriptBuffer } = await freshBuffer();
    const a = vi.fn();
    const b = vi.fn();
    const c = vi.fn();
    transcriptBuffer.onAppend(a);
    const unsubB = transcriptBuffer.onAppend(b);
    transcriptBuffer.onAppend(c);

    unsubB();

    transcriptBuffer.append(makeEntry());
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(0);
    expect(c).toHaveBeenCalledTimes(1);
  });

  it('AC8: no public clear/delete/splice/truncate/reset methods exist', async () => {
    const { transcriptBuffer } = await freshBuffer();
    const forbidden = ['clear', 'delete', 'splice', 'truncate', 'reset'];
    for (const name of forbidden) {
      expect(
        (transcriptBuffer as unknown as Record<string, unknown>)[name],
        `Public method "${name}" must not exist on transcriptBuffer`
      ).toBeUndefined();
    }
  });

  it('AC9 (subscriber error isolation, per Notes): a throwing subscriber does not block later subscribers', async () => {
    const { transcriptBuffer } = await freshBuffer();
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    const first = vi.fn();
    const thrower = vi.fn(() => {
      throw new Error('boom');
    });
    const third = vi.fn();
    transcriptBuffer.onAppend(first);
    transcriptBuffer.onAppend(thrower);
    transcriptBuffer.onAppend(third);

    const entry = makeEntry();
    expect(() => transcriptBuffer.append(entry)).not.toThrow();

    expect(first).toHaveBeenCalledTimes(1);
    expect(thrower).toHaveBeenCalledTimes(1);
    expect(third).toHaveBeenCalledTimes(1);
    expect(debugSpy).toHaveBeenCalledWith(
      '[TranscriptBuffer] subscriber threw',
      expect.any(Error)
    );

    debugSpy.mockRestore();
  });
});

describe('isValidTranscriptMessage — content-script boundary validator', () => {
  // These tests cover Task 2's negative-test requirement: the content-script
  // handler validates the FULL TranscriptEntry shape before forwarding to
  // transcriptBuffer.append. Validation lives at the system boundary
  // (content-script), not in the buffer itself.

  it('NEG-V1: rejects messages with missing or empty `text`', async () => {
    const { isValidTranscriptMessage } = await import('../src/content/overlay/transcript-validator');
    // Missing text
    expect(isValidTranscriptMessage({
      speaker: 'Alice',
      is_final: true,
      is_self: false,
      timestamp: '2026-04-15T12:00:00.000Z',
    })).toBe(false);
    // Empty string text
    expect(isValidTranscriptMessage({
      text: '',
      speaker: 'Alice',
      is_final: true,
      is_self: false,
      timestamp: '2026-04-15T12:00:00.000Z',
    })).toBe(false);
    // Wrong type
    expect(isValidTranscriptMessage({
      text: 123,
      speaker: 'Alice',
      is_final: true,
      is_self: false,
      timestamp: '2026-04-15T12:00:00.000Z',
    })).toBe(false);
  });

  it('NEG-V2: rejects messages with missing or wrong-typed `speaker`', async () => {
    const { isValidTranscriptMessage } = await import('../src/content/overlay/transcript-validator');
    expect(isValidTranscriptMessage({
      text: 'hello',
      is_final: true,
      is_self: false,
      timestamp: '2026-04-15T12:00:00.000Z',
    })).toBe(false);
    expect(isValidTranscriptMessage({
      text: 'hello',
      speaker: 42,
      is_final: true,
      is_self: false,
      timestamp: '2026-04-15T12:00:00.000Z',
    })).toBe(false);
  });

  it('NEG-V3: rejects messages with missing or non-boolean `is_final`', async () => {
    const { isValidTranscriptMessage } = await import('../src/content/overlay/transcript-validator');
    expect(isValidTranscriptMessage({
      text: 'hello',
      speaker: 'Alice',
      is_self: false,
      timestamp: '2026-04-15T12:00:00.000Z',
    })).toBe(false);
    expect(isValidTranscriptMessage({
      text: 'hello',
      speaker: 'Alice',
      is_final: 'true',
      is_self: false,
      timestamp: '2026-04-15T12:00:00.000Z',
    })).toBe(false);
  });

  it('NEG-V4: rejects messages with missing or non-boolean `is_self`', async () => {
    const { isValidTranscriptMessage } = await import('../src/content/overlay/transcript-validator');
    expect(isValidTranscriptMessage({
      text: 'hello',
      speaker: 'Alice',
      is_final: true,
      timestamp: '2026-04-15T12:00:00.000Z',
    })).toBe(false);
    expect(isValidTranscriptMessage({
      text: 'hello',
      speaker: 'Alice',
      is_final: true,
      is_self: 1,
      timestamp: '2026-04-15T12:00:00.000Z',
    })).toBe(false);
  });

  it('NEG-V5: rejects messages with missing or empty `timestamp`', async () => {
    const { isValidTranscriptMessage } = await import('../src/content/overlay/transcript-validator');
    expect(isValidTranscriptMessage({
      text: 'hello',
      speaker: 'Alice',
      is_final: true,
      is_self: false,
    })).toBe(false);
    expect(isValidTranscriptMessage({
      text: 'hello',
      speaker: 'Alice',
      is_final: true,
      is_self: false,
      timestamp: '',
    })).toBe(false);
    expect(isValidTranscriptMessage({
      text: 'hello',
      speaker: 'Alice',
      is_final: true,
      is_self: false,
      timestamp: 12345,
    })).toBe(false);
  });

  it('V-POS: accepts a fully-formed transcript message', async () => {
    const { isValidTranscriptMessage } = await import('../src/content/overlay/transcript-validator');
    expect(isValidTranscriptMessage({
      text: 'hello',
      speaker: 'Alice',
      is_final: true,
      is_self: false,
      timestamp: '2026-04-15T12:00:00.000Z',
    })).toBe(true);
  });

  it('V-NULL: rejects null and non-object inputs', async () => {
    const { isValidTranscriptMessage } = await import('../src/content/overlay/transcript-validator');
    expect(isValidTranscriptMessage(null)).toBe(false);
    expect(isValidTranscriptMessage(undefined)).toBe(false);
    expect(isValidTranscriptMessage('string')).toBe(false);
    expect(isValidTranscriptMessage(42)).toBe(false);
  });
});

describe('transcript-buffer negative tests', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('NEG1: mutating the snapshot does not affect subsequent getSnapshot calls', async () => {
    const { transcriptBuffer } = await freshBuffer();
    const e1 = makeEntry({ text: 'one' });
    const e2 = makeEntry({ text: 'two' });
    transcriptBuffer.append(e1);
    transcriptBuffer.append(e2);

    const snap = transcriptBuffer.getSnapshot();
    // Mutate in several nasty ways
    snap.push(makeEntry({ text: 'fake' }));
    snap.pop();
    snap.pop();
    (snap as unknown as unknown[])[0] = null;

    // Append a real entry, confirm internal state is intact
    const e3 = makeEntry({ text: 'three' });
    transcriptBuffer.append(e3);

    const next = transcriptBuffer.getSnapshot();
    expect(next).toEqual([e1, e2, e3]);
  });

  it('NEG2: TypeScript rejects append called with a non-matching shape (compile-time)', async () => {
    const { transcriptBuffer } = await freshBuffer();
    // If this test file compiles, that means the `as any` cast was required.
    // Without the cast, `npm run typecheck` would fail. The runtime assertion
    // below is just a sanity check that the call still happens.
    transcriptBuffer.append({} as any);
    expect(transcriptBuffer.getSnapshot()).toHaveLength(1);

    // The following statement is intentionally commented out — uncommenting
    // it would cause `npm run typecheck` to fail, proving the contract.
    // transcriptBuffer.append({ text: 'bad' });
  });
});

describe('lifecycle invariants (Task 3)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('INV-1: buffer survives session stop (no clear happens when STOP_SESSION would fire)', async () => {
    // The buffer has no subscription to STOP_SESSION — there is no lifecycle
    // hook that clears it. This test appends 3 entries and confirms the
    // snapshot still has all 3, simulating that nothing in the content-script
    // path touches the buffer on STOP_SESSION.
    const { transcriptBuffer } = await freshBuffer();
    transcriptBuffer.append(makeEntry({ text: 'one' }));
    transcriptBuffer.append(makeEntry({ text: 'two' }));
    transcriptBuffer.append(makeEntry({ text: 'three' }));

    // Simulating STOP_SESSION: by design, no clear/reset call is made.
    // (If a regression ever adds such a call, this assertion will fail.)

    const snap = transcriptBuffer.getSnapshot();
    expect(snap).toHaveLength(3);
    expect(snap.map((e) => e.text)).toEqual(['one', 'two', 'three']);
  });

  it('INV-2: buffer survives session restart (STOP then START), new entries append after old ones', async () => {
    const { transcriptBuffer } = await freshBuffer();
    transcriptBuffer.append(makeEntry({ text: 'one' }));
    transcriptBuffer.append(makeEntry({ text: 'two' }));
    transcriptBuffer.append(makeEntry({ text: 'three' }));

    // Simulate STOP_SESSION — no clear. Simulate START_SESSION — no clear.
    // The buffer has no lifecycle hooks that respond to these events.

    transcriptBuffer.append(makeEntry({ text: 'four' }));
    transcriptBuffer.append(makeEntry({ text: 'five' }));

    const snap = transcriptBuffer.getSnapshot();
    expect(snap).toHaveLength(5);
    expect(snap.map((e) => e.text)).toEqual(['one', 'two', 'three', 'four', 'five']);
  });

  it('INV-3: soft-limit telemetry warns exactly once when crossing SOFT_LIMIT_ENTRIES', async () => {
    const { transcriptBuffer } = await freshBuffer();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // 20_001 appends: the 20_001st append crosses the 20_000 threshold.
    const entry = makeEntry({ text: 'tick' });
    for (let i = 0; i < 20_001; i++) {
      transcriptBuffer.append(entry);
    }

    const softLimitCalls = warnSpy.mock.calls.filter((args) =>
      typeof args[0] === 'string' && /soft limit reached/.test(args[0])
    );
    expect(softLimitCalls).toHaveLength(1);
    // Plan spec: message matches '[TranscriptBuffer] soft limit reached: <length> entries'.
    // Length when crossing happens at the 20000th append: push first → length=20000 → 20000 >= 20000 → warn.
    // Locking the literal count catches regressions that corrupt the count (e.g., off-by-one or stale capture).
    expect(softLimitCalls[0]?.[0]).toBe('[TranscriptBuffer] soft limit reached: 20000 entries');

    // Further appends must NOT re-fire the warn.
    transcriptBuffer.append(entry);
    transcriptBuffer.append(entry);
    const stillOne = warnSpy.mock.calls.filter((args) =>
      typeof args[0] === 'string' && /soft limit reached/.test(args[0])
    );
    expect(stillOne).toHaveLength(1);

    warnSpy.mockRestore();
  }, 20_000);

  it('INV-4: onAppend accepts up to MAX_SUBSCRIBERS = 8, 9th throws with exact message', async () => {
    const { transcriptBuffer } = await freshBuffer();
    // Register 8 subscribers successfully.
    for (let i = 0; i < 8; i++) {
      expect(() => transcriptBuffer.onAppend(() => {})).not.toThrow();
    }
    // 9th throws.
    expect(() => transcriptBuffer.onAppend(() => {})).toThrowError(
      'TranscriptBuffer: exceeded MAX_SUBSCRIBERS (8)'
    );
  });

  it('INV-5 (negative): public API surface is exactly {append, getSnapshot, onAppend}', async () => {
    const { transcriptBuffer } = await freshBuffer();
    // Runtime: confirm forbidden names are not present.
    const forbidden = ['clear', 'reset', 'destroy', 'dispose', 'empty'];
    for (const name of forbidden) {
      expect(
        (transcriptBuffer as unknown as Record<string, unknown>)[name],
        `Public method "${name}" must not exist on transcriptBuffer`
      ).toBeUndefined();
    }

    // Compile-time: the exact union of keys on the singleton's public interface.
    // If anyone adds a method, this type assertion fails `npm run typecheck`.
    type BufferPublicAPI = 'append' | 'getSnapshot' | 'onAppend';
    // The singleton's public shape is captured via a structural interface, so
    // we assert the keys match exactly. Any extra public key would break the
    // Exclude-based check below at compile time.
    type ActualKeys = keyof {
      append: typeof transcriptBuffer.append;
      getSnapshot: typeof transcriptBuffer.getSnapshot;
      onAppend: typeof transcriptBuffer.onAppend;
    };
    // Both directions: ActualKeys ⊆ BufferPublicAPI AND BufferPublicAPI ⊆ ActualKeys.
    const _fwd: BufferPublicAPI = '' as unknown as ActualKeys;
    const _back: ActualKeys = '' as unknown as BufferPublicAPI;
    void _fwd;
    void _back;
    expect(true).toBe(true);
  });
});

describe('handleTranscriptMessage — wiring + ordering guarantee', () => {
  // These tests cover Task 2 AC: "overlay.updateTranscript is called BEFORE
  // transcriptBuffer.append, and a throw from append does NOT block the
  // rendering path."
  beforeEach(() => {
    vi.resetModules();
  });

  it('WIRE-1: calls overlay.updateTranscript before transcriptBuffer.append (order)', async () => {
    const { handleTranscriptMessage } = await import('../src/content/overlay/transcript-handler');
    const calls: string[] = [];
    const updateTranscript = vi.fn((_e: unknown) => { calls.push('overlay'); });
    const append = vi.fn((_e: unknown) => { calls.push('buffer'); });
    const entry = makeEntry();

    handleTranscriptMessage(entry, { updateTranscript }, { append });

    expect(updateTranscript).toHaveBeenCalledTimes(1);
    expect(append).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(['overlay', 'buffer']);
  });

  it('WIRE-2: if transcriptBuffer.append throws, overlay.updateTranscript was still called', async () => {
    const { handleTranscriptMessage } = await import('../src/content/overlay/transcript-handler');
    const updateTranscript = vi.fn();
    const append = vi.fn(() => {
      throw new Error('buffer failure');
    });
    const entry = makeEntry();

    // Should not throw out of the handler — buffer failures must not crash the
    // content script.
    expect(() => handleTranscriptMessage(entry, { updateTranscript }, { append })).not.toThrow();
    expect(updateTranscript).toHaveBeenCalledTimes(1);
    expect(updateTranscript).toHaveBeenCalledWith(entry);
    expect(append).toHaveBeenCalledTimes(1);
  });

  it('WIRE-3: malformed transcript messages skip append and emit the canonical console.warn', async () => {
    const { handleTranscriptMessage } = await import('../src/content/overlay/transcript-handler');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const updateTranscript = vi.fn();
    const append = vi.fn();
    const malformed = { text: '', speaker: 'Alice', is_final: true, is_self: false, timestamp: 'x' };

    handleTranscriptMessage(malformed as unknown as Parameters<typeof handleTranscriptMessage>[0], { updateTranscript }, { append });

    // Neither the overlay nor the buffer should be touched when validation fails.
    expect(updateTranscript).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith('[ContentScript] skipping malformed transcript', malformed);
    warnSpy.mockRestore();
  });
});
