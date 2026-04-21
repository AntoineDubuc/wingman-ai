/**
 * offscreen.ts mic constraint invariant test.
 *
 * The dual-capture mic stream must enable Chrome's standard WebRTC audio
 * processing trio (echoCancellation + noiseSuppression + autoGainControl).
 * Partial configurations (e.g., AEC on, NS off) put Chrome's AEC3 into an
 * unsupported state that degrades self-transcript quality and — more
 * critically — lets remote audio bleed back into the "self" channel when
 * users are on speakers rather than headphones, producing misattributed
 * self-aligned transcripts.
 *
 * Source: Research/features/transcript-alignment-fix/research.md#Finding-5,
 * Senior Engineer review Findings 1 + 8.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('offscreen.ts mic constraints — WebRTC trio invariant', () => {
  const offscreenSource = readFileSync(
    resolve(import.meta.dirname, '../src/offscreen/offscreen.ts'),
    'utf8',
  );

  it('startDualCapture mic stream sets echoCancellation: true', () => {
    // Find the startDualCapture body and verify the mic getUserMedia block
    const dualCaptureMatch = offscreenSource.match(
      /async function startDualCapture[\s\S]*?micStream\s*=\s*await\s+navigator\.mediaDevices\.getUserMedia\(\s*\{[\s\S]*?\}\s*\)/,
    );
    expect(dualCaptureMatch, 'startDualCapture mic getUserMedia block not found').not.toBeNull();

    const micBlock = dualCaptureMatch![0];
    expect(micBlock).toMatch(/echoCancellation:\s*true/);
    expect(micBlock).not.toMatch(/echoCancellation:\s*false/);
  });

  it('startDualCapture mic stream sets noiseSuppression: true', () => {
    const dualCaptureMatch = offscreenSource.match(
      /async function startDualCapture[\s\S]*?micStream\s*=\s*await\s+navigator\.mediaDevices\.getUserMedia\(\s*\{[\s\S]*?\}\s*\)/,
    );
    expect(dualCaptureMatch, 'startDualCapture mic getUserMedia block not found').not.toBeNull();

    const micBlock = dualCaptureMatch![0];
    expect(micBlock).toMatch(/noiseSuppression:\s*true/);
    expect(micBlock).not.toMatch(/noiseSuppression:\s*false/);
  });

  it('startDualCapture mic stream sets autoGainControl: true', () => {
    const dualCaptureMatch = offscreenSource.match(
      /async function startDualCapture[\s\S]*?micStream\s*=\s*await\s+navigator\.mediaDevices\.getUserMedia\(\s*\{[\s\S]*?\}\s*\)/,
    );
    expect(dualCaptureMatch, 'startDualCapture mic getUserMedia block not found').not.toBeNull();

    const micBlock = dualCaptureMatch![0];
    expect(micBlock).toMatch(/autoGainControl:\s*true/);
  });

  it('startDualCapture mic stream keeps channelCount: 1 (mono mic track)', () => {
    const dualCaptureMatch = offscreenSource.match(
      /async function startDualCapture[\s\S]*?micStream\s*=\s*await\s+navigator\.mediaDevices\.getUserMedia\(\s*\{[\s\S]*?\}\s*\)/,
    );
    expect(dualCaptureMatch, 'startDualCapture mic getUserMedia block not found').not.toBeNull();

    const micBlock = dualCaptureMatch![0];
    // channelCount: 1 is load-bearing — the stereo merger expects a mono mic input
    // on channel 0; tab audio supplies channel 1. Changing this would break the
    // deterministic is_self signal.
    expect(micBlock).toMatch(/channelCount:\s*1/);
  });

  it('no mic-constraints block anywhere in offscreen.ts sets echoCancellation: false', () => {
    // Guards against future partial flips. The legacy mono paths (startMicrophoneCapture)
    // are cold code per research Finding 16, but a regression there would still ship bad
    // constraints if dual capture ever falls back.
    expect(offscreenSource).not.toMatch(/echoCancellation:\s*false/);
  });

  it('no mic-constraints block anywhere in offscreen.ts sets noiseSuppression: false', () => {
    expect(offscreenSource).not.toMatch(/noiseSuppression:\s*false/);
  });
});
