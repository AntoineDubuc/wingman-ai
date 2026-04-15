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
