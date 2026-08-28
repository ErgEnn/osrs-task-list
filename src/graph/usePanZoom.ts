import { useCallback, useEffect, useRef, useState } from 'react';

export interface ViewTransform {
  x: number;
  y: number;
  k: number;
}

/** Integer-friendly zoom steps: fractional scales blur pixel art. */
export const ZOOM_STEPS = [0.5, 0.75, 1, 1.5, 2] as const;

/**
 * How far two fingers must spread, relative to where the last step left them,
 * before the pinch takes the next one. The zoom is stepped rather than
 * continuous, so a pinch cannot be smooth — this is the distance that keeps it
 * from flickering between two steps mid-gesture.
 */
const PINCH_STEP = 1.25;

/** Between the first two points; 0 unless there are at least two. */
function distanceBetween(points: Iterable<{ x: number; y: number }>): number {
  const [a, b] = [...points];
  return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
}

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
  /** Every finger currently down on the graph, so two of them can pinch. */
  const touches = useRef(new Map<number, { x: number; y: number }>());
  /** Distance between the pinching fingers when the current step was taken. */
  const pinchRef = useRef<number | null>(null);
  /**
   * Whether the view was placed by hand. An untouched one is refitted when the
   * graph changes size — a rotated phone, a sidebar opening — while a view
   * somebody panned or zoomed is left exactly where they put it.
   */
  const placedRef = useRef(false);

  const fitToView = useCallback(() => {
    const el = containerRef.current;
    if (!el || contentWidth === 0 || contentHeight === 0) return;
    const { clientWidth, clientHeight } = el;
    placedRef.current = false;
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
    placedRef.current = true;
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

  // A rotated phone or a sidebar opening changes the box the graph is fitted
  // to; refit unless somebody has since placed the view themselves.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (!placedRef.current) fitToView();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [fitToView]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (event.button !== 0) return;
      if (event.pointerType === 'touch') {
        touches.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (touches.current.size === 2) {
          // A second finger turns the gesture into a pinch: give up the pan the
          // first one started, and count the tiles as moved so lifting off does
          // not read as a tap on whatever is underneath.
          drag.current = null;
          setPanning(false);
          movedRef.current = true;
          pinchRef.current = distanceBetween(touches.current.values());
          return;
        }
        if (touches.current.size > 2) return;
      } else {
        // A mouse or a pen is never part of a pinch, and its press means no
        // finger is down — so nothing a dropped pointerup left behind survives.
        touches.current.clear();
        pinchRef.current = null;
      }
      drag.current = {
        startX: event.clientX,
        startY: event.clientY,
        ox: transform.x,
        oy: transform.y,
      };
      movedRef.current = false;
      // No pointer capture yet: capturing on pointerdown would retarget the
      // subsequent click away from graph tiles, breaking click-to-edit.
    },
    [transform.x, transform.y],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (touches.current.has(event.pointerId)) {
        touches.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      }
      if (pinchRef.current !== null) {
        const distance = distanceBetween(touches.current.values());
        const ratio = distance / pinchRef.current;
        if (ratio > PINCH_STEP || ratio < 1 / PINCH_STEP) {
          const [a, b] = [...touches.current.values()];
          zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, ratio > 1 ? 1 : -1);
          pinchRef.current = distance;
        }
        return;
      }
      if (!drag.current) return;
      const dx = event.clientX - drag.current.startX;
      const dy = event.clientY - drag.current.startY;
      if (!movedRef.current && Math.hypot(dx, dy) < 4) return;
      if (!movedRef.current) {
        // A real pan started: capture now so dragging outside keeps working.
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      }
      movedRef.current = true;
      placedRef.current = true;
      setPanning(true);
      const { ox, oy } = drag.current;
      setTransform((t) => ({ ...t, x: ox + dx, y: oy + dy }));
    },
    [zoomAt],
  );

  const endPan = useCallback((event: React.PointerEvent) => {
    touches.current.delete(event.pointerId);
    // The finger left over after a pinch does not start panning on its own:
    // that takes a fresh press.
    if (touches.current.size < 2) pinchRef.current = null;
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
