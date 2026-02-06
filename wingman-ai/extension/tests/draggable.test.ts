/**
 * Contract tests for Draggable component
 *
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';
import type { DraggableOptions } from '../src/content/overlay/draggable';

describe('Draggable Interface Contract', () => {
  describe('DraggableOptions interface', () => {
    it('accepts minimal required options', () => {
      // Simulate minimal options (we can't actually create DOM elements in node env)
      const options: DraggableOptions = {
        handle: {} as HTMLElement,
        target: {} as HTMLElement,
      };

      expect(options.handle).toBeDefined();
      expect(options.target).toBeDefined();
    });

    it('accepts all optional callbacks', () => {
      const onDragStart = () => {};
      const onDragEnd = (pos: { left: number; top: number }) => {
        expect(pos.left).toBeTypeOf('number');
        expect(pos.top).toBeTypeOf('number');
      };
      const isDisabled = () => false;

      const options: DraggableOptions = {
        handle: {} as HTMLElement,
        target: {} as HTMLElement,
        onDragStart,
        onDragEnd,
        isDisabled,
      };

      expect(options.onDragStart).toBe(onDragStart);
      expect(options.onDragEnd).toBe(onDragEnd);
      expect(options.isDisabled).toBe(isDisabled);
    });

    it('onDragEnd receives position object', () => {
      let receivedPosition: { left: number; top: number } | null = null;

      const options: DraggableOptions = {
        handle: {} as HTMLElement,
        target: {} as HTMLElement,
        onDragEnd: (pos) => {
          receivedPosition = pos;
        },
      };

      // Simulate callback
      options.onDragEnd?.({ left: 100, top: 200 });

      expect(receivedPosition).toEqual({ left: 100, top: 200 });
    });

    it('isDisabled can block dragging', () => {
      let blocked = true;

      const options: DraggableOptions = {
        handle: {} as HTMLElement,
        target: {} as HTMLElement,
        isDisabled: () => blocked,
      };

      expect(options.isDisabled?.()).toBe(true);
      blocked = false;
      expect(options.isDisabled?.()).toBe(false);
    });
  });
});
