import { describe, it, expect } from 'vitest';
import { parseDockMode, clampDockedWidth } from '../src/content/overlay/dockable';

describe('parseDockMode', () => {
  it('returns "floating" for undefined', () => {
    expect(parseDockMode(undefined)).toBe('floating');
  });

  it('returns "floating" for null', () => {
    expect(parseDockMode(null)).toBe('floating');
  });

  it('returns "floating" for empty string', () => {
    expect(parseDockMode('')).toBe('floating');
  });

  it('returns "floating" for numeric value', () => {
    expect(parseDockMode(123)).toBe('floating');
  });

  it('returns "floating" for invalid dock mode', () => {
    expect(parseDockMode('dock-top')).toBe('floating');
  });

  it('returns "floating" for boolean', () => {
    expect(parseDockMode(true)).toBe('floating');
  });

  it('returns "floating" for valid value "floating"', () => {
    expect(parseDockMode('floating')).toBe('floating');
  });

  it('returns "dock-left" for valid value', () => {
    expect(parseDockMode('dock-left')).toBe('dock-left');
  });

  it('returns "dock-right" for valid value', () => {
    expect(parseDockMode('dock-right')).toBe('dock-right');
  });
});

describe('clampDockedWidth', () => {
  it('returns default width for zero', () => {
    expect(clampDockedWidth(0, 1920)).toBe(350);
  });

  it('returns default width for negative value', () => {
    expect(clampDockedWidth(-100, 1920)).toBe(350);
  });

  it('returns default width for NaN', () => {
    expect(clampDockedWidth(NaN, 1920)).toBe(350);
  });

  it('returns default width for Infinity', () => {
    expect(clampDockedWidth(Infinity, 1920)).toBe(350);
  });

  it('clamps to min width (280)', () => {
    expect(clampDockedWidth(100, 1920)).toBe(280);
  });

  it('clamps to max width (600)', () => {
    expect(clampDockedWidth(800, 1920)).toBe(600);
  });

  it('returns exact value within range', () => {
    expect(clampDockedWidth(400, 1920)).toBe(400);
  });

  it('respects viewport constraint (viewport - 200)', () => {
    // viewport 500, max for viewport = 300, which is within [280, 600]
    expect(clampDockedWidth(400, 500)).toBe(300);
  });

  it('uses min width when viewport is very narrow', () => {
    // viewport 400, max for viewport = 280 (clamped to min), width 350 > 280
    expect(clampDockedWidth(350, 400)).toBe(280);
  });

  it('uses min width when viewport minus 200 is below min', () => {
    // viewport 300, max for viewport = max(280, 100) = 280
    expect(clampDockedWidth(500, 300)).toBe(280);
  });
});
