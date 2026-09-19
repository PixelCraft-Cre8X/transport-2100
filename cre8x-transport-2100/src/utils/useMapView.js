import { useCallback, useEffect, useRef, useState } from "react";

const MIN_ZOOM = 0.6;
const MAX_ZOOM = 4;
const STEP = 1.35;
const clamp = (value) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));

/**
 * Zoom and pan state for an illustrated map. `x` and `y` are a pixel offset
 * from the centred view; zooming about a point keeps that point under the cursor.
 */
export function useMapView() {
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });

  // (cx, cy) is the zoom origin in pixels from the centre of the map.
  const zoomBy = useCallback((factor, cx = 0, cy = 0) => {
    setView((v) => {
      const zoom = clamp(v.zoom * factor);
      const k = zoom / v.zoom;
      return { zoom, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
    });
  }, []);
  const panBy = useCallback(
    (dx, dy) => setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy })),
    [],
  );
  const reset = useCallback(() => setView({ zoom: 1, x: 0, y: 0 }), []);
  const recentre = useCallback(
    () => setView((v) => ({ ...v, x: 0, y: 0 })),
    [],
  );

  return {
    view,
    zoomBy,
    panBy,
    reset,
    recentre,
    zoomIn: () => zoomBy(STEP),
    zoomOut: () => zoomBy(1 / STEP),
    canZoomIn: view.zoom < MAX_ZOOM - 0.001,
    canZoomOut: view.zoom > MIN_ZOOM + 0.001,
  };
}

/**
 * Mouse-wheel zoom, drag-to-pan and two-finger pinch on `ref`'s element. The
 * element should use `touch-action: pan-y` so a vertical swipe still scrolls the page.
 */
export function useMapGestures(ref, { onZoom, onPan }) {
  const latest = useRef({ onZoom, onPan });
  useEffect(() => {
    latest.current = { onZoom, onPan };
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const pointers = new Map();
    const centre = () => {
      const rect = el.getBoundingClientRect();
      return [rect.left + rect.width / 2, rect.top + rect.height / 2];
    };
    // Distance between and midpoint of the first two active pointers.
    const pinch = () => {
      const [a, b] = [...pointers.values()];
      return {
        gap: Math.hypot(a.x - b.x, a.y - b.y),
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
      };
    };

    const down = (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (e.target.closest("button, a")) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      el.setPointerCapture(e.pointerId);
      el.classList.add("is-dragging");
    };
    const move = (e) => {
      const last = pointers.get(e.pointerId);
      if (!last) return;
      if (pointers.size === 2) {
        const before = pinch();
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const after = pinch();
        const [cx, cy] = centre();
        latest.current.onPan(after.x - before.x, after.y - before.y);
        if (before.gap > 0)
          latest.current.onZoom(
            after.gap / before.gap,
            after.x - cx,
            after.y - cy,
          );
      } else {
        latest.current.onPan(e.clientX - last.x, e.clientY - last.y);
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
    };
    const up = (e) => {
      if (!pointers.delete(e.pointerId)) return;
      el.releasePointerCapture?.(e.pointerId);
      if (!pointers.size) el.classList.remove("is-dragging");
    };
    const wheel = (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const delta = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      latest.current.onZoom(
        Math.exp(-delta * 0.0015),
        e.clientX - rect.left - rect.width / 2,
        e.clientY - rect.top - rect.height / 2,
      );
    };

    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("wheel", wheel);
    };
  }, [ref]);
}
