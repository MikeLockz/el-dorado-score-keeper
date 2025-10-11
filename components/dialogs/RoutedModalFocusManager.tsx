'use client';

import * as React from 'react';

const FOCUSABLE_SELECTORS = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[role="button"]',
].join(',');

const liveRegionCache = new Map<'polite' | 'assertive', HTMLDivElement>();

const VISUALLY_HIDDEN_STYLES: Partial<CSSStyleDeclaration> = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  margin: '-1px',
  border: '0',
  padding: '0',
  clip: 'rect(0 0 0 0)',
  overflow: 'hidden',
};

export type RoutedModalFocusManagerProps = {
  contentRef: React.RefObject<HTMLElement>;
  initialFocusRef?: React.RefObject<HTMLElement>;
  announcement?: string;
  politeness?: 'polite' | 'assertive';
  restoreFocusDelayMs?: number;
};

export function RoutedModalFocusManager({
  contentRef,
  initialFocusRef,
  announcement,
  politeness = 'polite',
  restoreFocusDelayMs = 0,
}: RoutedModalFocusManagerProps) {
  useRoutedModalFocusManager({
    contentRef,
    initialFocusRef,
    announcement,
    politeness,
    restoreFocusDelayMs,
  });
  return null;
}

export function useRoutedModalFocusManager({
  contentRef,
  initialFocusRef,
  announcement,
  politeness = 'polite',
  restoreFocusDelayMs = 0,
}: RoutedModalFocusManagerProps) {
  const previousFocusRef = React.useRef<HTMLElement | null>(null);

  React.useLayoutEffect(() => {
    if (typeof document === 'undefined') return;
    const container = contentRef.current;
    if (!container) return;
    const activeElement = document.activeElement;
    previousFocusRef.current =
      activeElement instanceof HTMLElement && activeElement !== container ? activeElement : null;

    const preferred = initialFocusRef?.current ?? findFirstFocusable(container) ?? container;
    const frame = window.requestAnimationFrame(() => {
      if (preferred && typeof preferred.focus === 'function') {
        preferred.focus({ preventScroll: true });
      }
    });

    return () => {
      window.cancelAnimationFrame(frame);
      const previous = previousFocusRef.current;
      if (!previous) return;
      window.setTimeout(() => {
        if (previous.isConnected && typeof previous.focus === 'function') {
          previous.focus({ preventScroll: true });
        }
      }, restoreFocusDelayMs);
    };
  }, [contentRef, initialFocusRef, restoreFocusDelayMs]);

  React.useEffect(() => {
    if (!announcement || typeof document === 'undefined') return undefined;
    const region = ensureLiveRegion(politeness);
    region.textContent = announcement;
    return () => {
      window.setTimeout(() => {
        if (region.textContent === announcement) {
          region.textContent = '';
        }
      }, 250);
    };
  }, [announcement, politeness]);
}

function findFirstFocusable(root: HTMLElement): HTMLElement | null {
  return root.querySelector<HTMLElement>(FOCUSABLE_SELECTORS);
}

function ensureLiveRegion(politeness: 'polite' | 'assertive'): HTMLDivElement {
  let region = liveRegionCache.get(politeness);
  if (region && document.body.contains(region)) {
    return region;
  }
  region = document.createElement('div');
  region.setAttribute('aria-live', politeness);
  region.setAttribute('aria-atomic', 'true');
  region.setAttribute('data-routed-modal-live-region', politeness);
  Object.assign(region.style, VISUALLY_HIDDEN_STYLES);
  document.body.appendChild(region);
  liveRegionCache.set(politeness, region);
  return region;
}
