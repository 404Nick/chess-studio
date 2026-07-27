'use client';

import { useEffect } from 'react';

export interface ShortcutHandlers {
  onPrevious?(): void;
  onNext?(): void;
  onFirst?(): void;
  onLast?(): void;
  onFlip?(): void;
  /** Up/Down cycle through sibling variations (falling back to first/last). */
  onUp?(): void;
  onDown?(): void;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
}

/** Arrow-key navigation for the board; disabled while the user is typing. */
export function useBoardShortcuts(handlers: ShortcutHandlers, enabled = true): void {
  useEffect(() => {
    if (!enabled) return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;

      switch (event.key) {
        case 'ArrowLeft':
          handlers.onPrevious?.();
          break;
        case 'ArrowRight':
          handlers.onNext?.();
          break;
        case 'ArrowUp':
          (handlers.onUp ?? handlers.onFirst)?.();
          break;
        case 'Home':
          handlers.onFirst?.();
          break;
        case 'ArrowDown':
          (handlers.onDown ?? handlers.onLast)?.();
          break;
        case 'End':
          handlers.onLast?.();
          break;
        case 'f':
        case 'F':
          handlers.onFlip?.();
          break;
        default:
          return;
      }
      event.preventDefault();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled, handlers]);
}
