/**
 * Contract tests for AIOverlay interfaces
 *
 * These tests verify the exported interfaces remain stable during refactoring.
 * DOM-based tests would require jsdom environment.
 *
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';
import type { Suggestion, Transcript } from '../src/content/overlay';

describe('Overlay Interface Contracts', () => {
  describe('Suggestion interface', () => {
    it('accepts valid answer suggestion', () => {
      const suggestion: Suggestion = {
        type: 'answer',
        text: 'Here is my answer',
        timestamp: Date.now(),
      };

      expect(suggestion.type).toBe('answer');
      expect(suggestion.text).toBeDefined();
      expect(suggestion.timestamp).toBeTypeOf('number');
    });

    it('accepts valid objection suggestion', () => {
      const suggestion: Suggestion = {
        type: 'objection',
        text: 'I disagree because...',
        question: 'What about the budget?',
        timestamp: Date.now(),
      };

      expect(suggestion.type).toBe('objection');
      expect(suggestion.question).toBeDefined();
    });

    it('accepts valid info suggestion', () => {
      const suggestion: Suggestion = {
        type: 'info',
        text: 'FYI: The deadline is Friday',
        timestamp: Date.now(),
      };

      expect(suggestion.type).toBe('info');
    });

    it('supports optional properties', () => {
      const suggestion: Suggestion = {
        type: 'answer',
        text: 'Answer with all optional fields',
        question: 'What is the price?',
        confidence: 0.95,
        timestamp: Date.now(),
        kbSource: 'pricing-guide.pdf',
        personas: [
          { id: '1', name: 'Sales Expert', color: '#e74c3c' },
          { id: '2', name: 'Technical Lead', color: '#3498db' },
        ],
      };

      expect(suggestion.confidence).toBe(0.95);
      expect(suggestion.kbSource).toBe('pricing-guide.pdf');
      expect(suggestion.personas).toHaveLength(2);
      expect(suggestion.personas?.[0].name).toBe('Sales Expert');
    });

    it('type discriminates correctly', () => {
      const types: Array<Suggestion['type']> = ['answer', 'objection', 'info'];
      expect(types).toContain('answer');
      expect(types).toContain('objection');
      expect(types).toContain('info');
      expect(types).toHaveLength(3);
    });
  });

  describe('Transcript interface', () => {
    it('accepts valid transcript', () => {
      const transcript: Transcript = {
        text: 'Hello, how are you?',
        speaker: 'John Smith',
        is_final: true,
        is_self: false,
        timestamp: '2024-01-15T10:30:00.000Z',
      };

      expect(transcript.text).toBe('Hello, how are you?');
      expect(transcript.speaker).toBe('John Smith');
      expect(transcript.is_final).toBe(true);
      expect(transcript.is_self).toBe(false);
      expect(transcript.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('accepts self transcript', () => {
      const transcript: Transcript = {
        text: 'My response',
        speaker: 'You',
        is_final: true,
        is_self: true,
        timestamp: new Date().toISOString(),
      };

      expect(transcript.is_self).toBe(true);
    });

    it('accepts interim (non-final) transcript', () => {
      const transcript: Transcript = {
        text: 'Still speaking...',
        speaker: 'Jane',
        is_final: false,
        is_self: false,
        timestamp: new Date().toISOString(),
      };

      expect(transcript.is_final).toBe(false);
    });
  });

  describe('Hydra multi-persona support', () => {
    it('Suggestion supports multiple personas', () => {
      const suggestion: Suggestion = {
        type: 'answer',
        text: 'Combined response',
        timestamp: Date.now(),
        personas: [
          { id: 'sales', name: 'Sales Closer', color: '#e74c3c' },
          { id: 'tech', name: 'Technical Expert', color: '#3498db' },
          { id: 'legal', name: 'Legal Advisor', color: '#9b59b6' },
        ],
      };

      expect(suggestion.personas).toHaveLength(3);
      expect(suggestion.personas?.map(p => p.name)).toEqual([
        'Sales Closer',
        'Technical Expert',
        'Legal Advisor',
      ]);
    });

    it('persona colors are valid hex', () => {
      const suggestion: Suggestion = {
        type: 'info',
        text: 'Test',
        timestamp: Date.now(),
        personas: [{ id: '1', name: 'Test', color: '#ff5500' }],
      };

      const color = suggestion.personas?.[0].color;
      expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
    });
  });
});

/**
 * AIOverlay Public API Contract
 *
 * This documents the public interface that must be preserved:
 *
 * Properties:
 *   - container: HTMLDivElement (public, read-only in practice)
 *
 * Methods:
 *   - constructor(onClose?: () => void)
 *   - toggleMinimize(): void
 *   - forceShow(): void
 *   - updateTranscript(transcript: Transcript): void
 *   - updateCost(data: CostData): void
 *   - showLoading(): void
 *   - showSummary(summary: CallSummary): void
 *   - showSummaryError(message: string): void
 *   - updateDriveStatus(result: DriveResult): void
 *   - showTimelineView(): void
 *
 * Note: Full DOM testing requires jsdom environment.
 * See IMPLEMENTATION-PLAN.md Phase 20 for refactoring details.
 */
