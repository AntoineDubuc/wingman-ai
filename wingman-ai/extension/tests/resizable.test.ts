/**
 * Contract tests for Resizable component
 *
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';
import type { ResizableOptions } from '../src/content/overlay/resizable';

describe('Resizable Interface Contract', () => {
  describe('ResizableOptions interface', () => {
    it('accepts minimal required options', () => {
      const options: ResizableOptions = {
        handle: {} as HTMLElement,
        target: {} as HTMLElement,
      };

      expect(options.handle).toBeDefined();
      expect(options.target).toBeDefined();
    });

    it('accepts dimension constraints', () => {
      const options: ResizableOptions = {
        handle: {} as HTMLElement,
        target: {} as HTMLElement,
        minWidth: 280,
        maxWidth: 600,
        minHeight: 200,
        maxHeight: 800,
      };

      expect(options.minWidth).toBe(280);
      expect(options.maxWidth).toBe(600);
      expect(options.minHeight).toBe(200);
      expect(options.maxHeight).toBe(800);
    });

    it('accepts dynamic maxWidth function', () => {
      let layoutMode = 'single';

      const options: ResizableOptions = {
        handle: {} as HTMLElement,
        target: {} as HTMLElement,
        maxWidth: () => layoutMode === 'side-by-side' ? 900 : 600,
      };

      // Test with single layout
      expect((options.maxWidth as () => number)()).toBe(600);

      // Change layout mode
      layoutMode = 'side-by-side';
      expect((options.maxWidth as () => number)()).toBe(900);
    });

    it('accepts dynamic maxHeight function', () => {
      const options: ResizableOptions = {
        handle: {} as HTMLElement,
        target: {} as HTMLElement,
        maxHeight: () => 800 * 0.8, // 80% of viewport
      };

      expect((options.maxHeight as () => number)()).toBe(640);
    });

    it('accepts all optional callbacks', () => {
      const onResizeEnd = (size: { width: number; height: number }) => {
        expect(size.width).toBeTypeOf('number');
        expect(size.height).toBeTypeOf('number');
      };
      const isDisabled = () => false;

      const options: ResizableOptions = {
        handle: {} as HTMLElement,
        target: {} as HTMLElement,
        onResizeEnd,
        isDisabled,
      };

      expect(options.onResizeEnd).toBe(onResizeEnd);
      expect(options.isDisabled).toBe(isDisabled);
    });

    it('onResizeEnd receives size object', () => {
      let receivedSize: { width: number; height: number } | null = null;

      const options: ResizableOptions = {
        handle: {} as HTMLElement,
        target: {} as HTMLElement,
        onResizeEnd: (size) => {
          receivedSize = size;
        },
      };

      // Simulate callback
      options.onResizeEnd?.({ width: 400, height: 300 });

      expect(receivedSize).toEqual({ width: 400, height: 300 });
    });

    it('isDisabled can block resizing', () => {
      let minimized = true;

      const options: ResizableOptions = {
        handle: {} as HTMLElement,
        target: {} as HTMLElement,
        isDisabled: () => minimized,
      };

      expect(options.isDisabled?.()).toBe(true);
      minimized = false;
      expect(options.isDisabled?.()).toBe(false);
    });
  });
});
