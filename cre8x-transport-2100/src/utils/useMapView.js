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
  const recentre = useCallback(() => setView((v) => ({ ...v, x: 0, y: 0 })), []);

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

/** Mouse-wheel zoom and drag-to-pan on `ref`'s element. Touch is left to native scrolling. */
export function useMapGestures(ref, { onZoom, onPan }) {
  const latest = useRef({ onZoom, onPan });
  useEffect(() => {
    latest.current = { onZoom, onPan };
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let drag = null;

    const down = (e) => {
      if (e.button !== 0 || e.pointerType === "touch" || e.target.closest("button, a")) return;
      drag = { x: e.clientX, y: e.clientY };
      el.setPointerCapture(e.pointerId);
      el.classList.add("is-dragging");
    };
    const move = (e) => {
      if (!drag) return;
      latest.current.onPan(e.clientX - drag.x, e.clientY - drag.y);
      drag = { x: e.clientX, y: e.clientY };
    };
    const up = (e) => {
      if (!drag) return;
      drag = null;
      el.releasePointerCapture?.(e.pointerId);
      el.classList.remove("is-dragging");
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
