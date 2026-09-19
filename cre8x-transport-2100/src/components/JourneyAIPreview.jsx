import { useEffect, useRef } from "react";
import { ArrowRight, Mic, Sparkles, X } from "lucide-react";

export default function JourneyAIPreview({ open, onClose }) {
  const closeButtonRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    closeButtonRef.current?.focus();
    function handleKeyDown(event) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="assistant-dialog journey-ai-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="journey-ai-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          ref={closeButtonRef}
          className="assistant-close"
          type="button"
          aria-label="Close Journey AI preview"
          onClick={onClose}
        >
          <X size={18} />
        </button>
        <span className="assistant-orb">
          <Sparkles size={28} />
        </span>
        <span className="badge violet">JOURNEY AI · PREVIEW</span>
        <h2 id="journey-ai-title">Journey AI</h2>
        <p>Plan your journey naturally with voice.</p>
        <div className="journey-ai-action">
          <Mic size={19} />
          <span>
            <strong>Voice journey planning</strong>
            <small>Available in the next moveone release.</small>
          </span>
        </div>
        <button className="button primary" type="button" onClick={onClose}>
          Try Journey AI <ArrowRight size={17} />
        </button>
      </section>
    </div>
  );
}
