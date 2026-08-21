import { useCallback, useEffect, useRef, useState } from 'react';

export interface ViewTransform {
  x: number;
  y: number;
  k: number;
}

/** Integer-friendly zoom steps: fractional scales blur pixel art. */
export const ZOOM_STEPS = [0.5, 0.75, 1, 1.5, 2] as const;

function snapIndex(k: number): number {
  let best = 0;
  ZOOM_STEPS.forEach((step, i) => {
    if (Math.abs(step - k) < Math.abs(ZOOM_STEPS[best] - k)) best = i;
  });
  return best;
}

export function usePanZoom(contentWidth: number, contentHeight: number) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [transform, setTransform] = useState<ViewTransform>({ x: 0, y: 0, k: 1 });
  const [panning, setPanning] = useState(false);
  const drag = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);
  /** True while the last pointer interaction moved — lets nodes suppress click-after-pan. */
  const movedRef = useRef(false);

  const fitToView = useCallback(() => {
    const el = containerRef.current;
    if (!el || contentWidth === 0 || contentHeight === 0) return;
    const { clientWidth, clientHeight } = el;
    const raw = Math.min(clientWidth / contentWidth, clientHeight / contentHeight, 1);
    const k = ZOOM_STEPS[snapIndex(raw)] <= raw ? ZOOM_STEPS[snapIndex(raw)] : ZOOM_STEPS[Math.max(0, snapIndex(raw) - 1)];
    setTransform({
      x: (clientWidth - contentWidth * k) / 2,
      y: Math.max(8, (clientHeight - contentHeight * k) / 2),
      k,
    });
  }, [contentWidth, contentHeight]);

  const zoomAt = useCallback((clientX: number, clientY: number, direction: 1 | -1) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    setTransform((t) => {
      const idx = Math.max(0, Math.min(ZOOM_STEPS.length - 1, snapIndex(t.k) + direction));
      const k = ZOOM_STEPS[idx];
      if (k === t.k) return t;
      return { x: mx - ((mx - t.x) * k) / t.k, y: my - ((my - t.y) * k) / t.k, k };
    });
  }, []);

  const zoomCentered = useCallback(
    (direction: 1 | -1) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, direction);
    },
    [zoomAt],
  );

  // Non-passive wheel listener so the page never scroll-chains.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoomAt(event.clientX, event.clientY, event.deltaY < 0 ? 1 : -1);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (event.button !== 0) return;
      drag.current = {
        startX: event.clientX,
        startY: event.clientY,
        ox: transform.x,
        oy: transform.y,
      };
      movedRef.current = false;
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    },
    [transform.x, transform.y],
  );

  const onPointerMove = useCallback((event: React.PointerEvent) => {
    if (!drag.current) return;
    const dx = event.clientX - drag.current.startX;
    const dy = event.clientY - drag.current.startY;
    if (!movedRef.current && Math.hypot(dx, dy) < 4) return;
    movedRef.current = true;
    setPanning(true);
    const { ox, oy } = drag.current;
    setTransform((t) => ({ ...t, x: ox + dx, y: oy + dy }));
  }, []);

  const endPan = useCallback(() => {
    drag.current = null;
    setPanning(false);
  }, []);

  return {
    containerRef,
    transform,
    panning,
    movedRef,
    fitToView,
    zoomIn: () => zoomCentered(1),
    zoomOut: () => zoomCentered(-1),
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endPan,
      onPointerCancel: endPan,
    },
  };
}
