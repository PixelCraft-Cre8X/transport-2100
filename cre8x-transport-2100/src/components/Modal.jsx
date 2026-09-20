import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import "./BookingModal.css";

/**
 * Shared dialog shell: portal, backdrop click and Escape to close, page scroll
 * lock, focus moved in on open and returned on close, and Tab kept inside.
 */
export default function Modal({
  onClose,
  labelledBy,
  className = "",
  dialogRef,
  children,
}) {
  const ownRef = useRef(null);
  const ref = dialogRef ?? ownRef;
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const previous = document.activeElement;
    // Freeze the page behind the popup. `overflow: hidden` alone doesn't stop
    // iOS Safari scrolling it, so the page is pinned in place and put back at
    // the same scroll position afterwards.
    const body = document.body;
    const saved = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      paddingRight: body.style.paddingRight,
    };
    const scrollY = window.scrollY;
    // Losing the scrollbar would widen the page and make it jump sideways.
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
    ref.current?.focus({ preventScroll: true });
    const onKey = (event) => {
      if (event.key === "Escape") closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      Object.assign(body.style, saved);
      window.scrollTo(0, scrollY);
      previous?.focus?.({ preventScroll: true });
    };
  }, [ref]);

  const trapTab = (event) => {
    if (event.key !== "Tab") return;
    const focusable = [
      ...ref.current.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ].filter((el) => el.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div
      className="bk-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        className={`bk-dialog glass-modal ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        ref={ref}
        onKeyDown={trapTab}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
