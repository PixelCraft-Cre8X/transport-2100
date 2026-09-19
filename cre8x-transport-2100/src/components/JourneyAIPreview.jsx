import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Footprints,
  Mic,
  Send,
  Sparkles,
  Square,
  Volume2,
  X,
} from "lucide-react";
import { formatFare, journeyQuery, readJourney } from "../data/journeys";
import { locations } from "../data/network";
import {
  createJourneyAIResponse,
  parseJourneyRequest,
  recommendJourney,
} from "../utils/journeyAI";
import { ModeIcon } from "./UI";

const speechErrors = {
  "not-allowed":
    "Microphone permission was denied. Allow access in your browser or type your request.",
  "service-not-allowed":
    "Voice recognition is unavailable. You can still type your request.",
  "audio-capture":
    "No microphone is available. Check your microphone or type your request.",
  "no-speech":
    "I didn't hear anything. Try the microphone again or type your request.",
  network:
    "Voice recognition couldn't connect. Try again or type your request.",
  aborted: "Listening stopped. You can still type your request.",
};

function releaseRecognition(ref) {
  const recognition = ref.current;
  ref.current = null;
  if (!recognition) return;
  recognition.onstart = null;
  recognition.onresult = null;
  recognition.onerror = null;
  recognition.onend = null;
  recognition.onnomatch = null;
  try {
    recognition.abort();
  } catch {
    // Some browsers throw if the recognition service has already stopped.
  }
}

// Keep Layout's existing open/close contract; each opening gets a fresh session.
export default function JourneyAIPreview({ open, onClose }) {
  return open ? <JourneyAIDialog onClose={onClose} /> : null;
}

function JourneyAIDialog({ onClose }) {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const dialogRef = useRef(null);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);
  const utteranceRef = useRef(null);
  const processingRef = useRef(null);
  const [text, setText] = useState("");
  const [status, setStatus] = useState("idle");
  const [notice, setNotice] = useState(
    "Tell me where you'd like to go and what matters to you.",
  );
  const [result, setResult] = useState(null);
  const [speaking, setSpeaking] = useState(false);
  const Recognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  const canSpeak = Boolean(
    window.speechSynthesis && window.SpeechSynthesisUtterance,
  );
  const params = new URLSearchParams(search);
  const currentJourney =
    pathname === "/journey" || pathname === "/tracking"
      ? readJourney(params)
      : {};
  const context = {
    from: params.get("from") ?? currentJourney.from?.name,
    to: params.get("to") ?? currentJourney.to?.name,
    style: params.get("style") ?? currentJourney.selected?.id,
    walking: params.get("walking") ?? currentJourney.walking,
  };
  const response = result ? createJourneyAIResponse(result) : "";
  const route = result?.status === "success" ? result.route : null;

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    inputRef.current?.focus();
    const backdrop = dialogRef.current.parentElement;
    const siblings = [...backdrop.parentElement.children]
      .filter((element) => element !== backdrop)
      .map((element) => [element, element.inert]);
    siblings.forEach(([element]) => {
      element.inert = true;
    });

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
      if (event.key !== "Tab") return;
      const controls = [
        ...dialogRef.current.querySelectorAll(
          'button:not(:disabled), input:not(:disabled), summary, [tabindex="0"]',
        ),
      ];
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      siblings.forEach(([element, wasInert]) => {
        element.inert = wasInert;
      });
      window.clearTimeout(processingRef.current);
      releaseRecognition(recognitionRef);
      if (utteranceRef.current) {
        utteranceRef.current.onend = null;
        utteranceRef.current.onerror = null;
      }
      window.speechSynthesis?.cancel();
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [onClose]);

  function stopSpeaking() {
    if (utteranceRef.current) {
      utteranceRef.current.onend = null;
      utteranceRef.current.onerror = null;
      utteranceRef.current = null;
      window.speechSynthesis?.cancel();
    }
    setSpeaking(false);
  }

  function editRequest(value) {
    window.clearTimeout(processingRef.current);
    releaseRecognition(recognitionRef);
    stopSpeaking();
    setText(value);
    setResult(null);
    setStatus("idle");
    setNotice("Edit your request, then press Enter or Send.");
  }

  function submit(event) {
    event.preventDefault();
    if (!text.trim() || status === "processing") return;
    releaseRecognition(recognitionRef);
    stopSpeaking();
    setResult(null);
    setStatus("processing");
    setNotice("Finding the best journey…");
    // Let React render the status before calculating locally, with no artificial delay.
    processingRef.current = window.setTimeout(() => {
      const recommendation = recommendJourney(
        parseJourneyRequest(text, context),
      );
      setResult(recommendation);
      setStatus(recommendation.status);
      setNotice("");
    }, 0);
  }

  function toggleListening() {
    if (!Recognition) return;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
        setNotice("Finishing listening…");
      } catch {
        releaseRecognition(recognitionRef);
        setStatus("idle");
        setNotice("Listening stopped. You can edit or type your request.");
      }
      return;
    }
    stopSpeaking();
    setResult(null);
    setStatus("listening");
    setNotice("Starting microphone…");
    let receivedTranscript = false;
    let failed = false;
    try {
      const recognition = new Recognition();
      recognitionRef.current = recognition;
      recognition.lang = "en-US";
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.onstart = () =>
        setNotice("Listening… Speak your journey request.");
      recognition.onresult = (event) => {
        const transcript = event.results[0]?.[0]?.transcript?.trim();
        if (!transcript) return;
        receivedTranscript = true;
        setText(transcript);
        setNotice(
          "I heard you. Edit the text if needed, then press Enter or Send.",
        );
        inputRef.current?.focus();
      };
      recognition.onerror = (event) => {
        failed = true;
        releaseRecognition(recognitionRef);
        setStatus("error");
        setNotice(
          speechErrors[event.error] ||
            "Voice recognition couldn't start. Try again or type your request.",
        );
        inputRef.current?.focus();
      };
      recognition.onnomatch = () => {
        failed = true;
        setStatus("error");
        setNotice(
          "I couldn't understand that. Try again or type your request.",
        );
      };
      recognition.onend = () => {
        releaseRecognition(recognitionRef);
        if (!failed) {
          setStatus("idle");
          if (!receivedTranscript) setNotice(speechErrors["no-speech"]);
        }
      };
      recognition.start();
    } catch {
      releaseRecognition(recognitionRef);
      setStatus("error");
      setNotice(
        "Voice recognition couldn't start. Check microphone access or type your request.",
      );
    }
  }

  function toggleSpeaking() {
    if (speaking) {
      stopSpeaking();
      return;
    }
    if (!canSpeak || !route) return;
    releaseRecognition(recognitionRef);
    try {
      window.speechSynthesis.cancel();
      const utterance = new window.SpeechSynthesisUtterance(response);
      utterance.lang = "en-US";
      utteranceRef.current = utterance;
      utterance.onend = () => {
        utteranceRef.current = null;
        setSpeaking(false);
      };
      utterance.onerror = () => {
        utteranceRef.current = null;
        setSpeaking(false);
        setNotice(
          "The recommendation couldn't be read aloud. You can read it below.",
        );
      };
      setSpeaking(true);
      setNotice("");
      window.speechSynthesis.speak(utterance);
    } catch {
      stopSpeaking();
      setNotice(
        "Speech playback is unavailable. You can read the recommendation below.",
      );
    }
  }

  function openJourney(path) {
    const query = journeyQuery(
      result.from.name,
      result.to.name,
      route.id,
      result.intent.walking,
    );
    onClose();
    navigate(`${path}?${query}`);
  }

  return (
    <div className="modal-backdrop journey-ai-backdrop" onClick={onClose}>
      <section
        ref={dialogRef}
        className="assistant-dialog journey-ai-dialog glass-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="journey-ai-title"
        aria-describedby="journey-ai-description"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          className="assistant-close"
          type="button"
          aria-label="Close Journey AI"
          onClick={onClose}
        >
          <X size={18} aria-hidden="true" />
        </button>
        <div className="journey-ai-heading">
          <span className="assistant-orb" aria-hidden="true">
            <Sparkles size={25} />
          </span>
          <div>
            <span className="badge violet">YOUR JOURNEY ASSISTANT</span>
            <h2 id="journey-ai-title">Journey AI</h2>
          </div>
        </div>
        <p id="journey-ai-description">
          Speak or type to find your way with MoveOne.
        </p>
        {context.from && context.to && (
          <p className="journey-ai-context">
            Current journey: {context.from} → {context.to}
          </p>
        )}
        <form
          className="journey-ai-form"
          onSubmit={submit}
          aria-busy={status === "processing"}
        >
          <label htmlFor="journey-ai-request">Your journey request</label>
          <input
            ref={inputRef}
            id="journey-ai-request"
            value={text}
            onChange={(event) => editRequest(event.target.value)}
            placeholder="Ask me to plan your journey…"
            autoComplete="off"
            aria-describedby="journey-ai-input-help"
          />
          <div className="journey-ai-input-actions">
            <button
              className={`button secondary journey-ai-mic ${status === "listening" ? "is-listening" : ""}`}
              type="button"
              aria-label={
                status === "listening"
                  ? "Stop listening"
                  : "Speak your journey request"
              }
              aria-pressed={status === "listening"}
              disabled={!Recognition || status === "processing"}
              onClick={toggleListening}
            >
              <Mic size={17} aria-hidden="true" />{" "}
              {status === "listening" ? "Listening…" : "Speak"}
            </button>
            <button
              className="button primary"
              type="submit"
              aria-label="Send journey request"
              disabled={!text.trim() || status === "processing"}
            >
              Send <Send size={17} aria-hidden="true" />
            </button>
          </div>
          <p id="journey-ai-input-help" className="journey-ai-help">
            {Recognition
              ? "Try “Fastest to Colombo Fort, but don't use air taxis.” You can edit voice input before sending."
              : "Voice recognition is not supported in this browser. You can still type your request."}
          </p>
        </form>
        <div
          className={`journey-ai-response ${status === "error" ? "has-error" : ""}`}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {notice && <p>{notice}</p>}
          {response && <p>{response}</p>}
        </div>
        {route && (
          <>
            <article
              className="route-option glass-card journey-ai-recommendation"
              aria-label="Recommended journey"
            >
              <div className="option-top">
                <span className={`option-icon ${route.id}`}>
                  <ModeIcon mode={route.icon} />
                </span>
                <span>
                  <strong>{route.label}</strong>
                  <small>
                    {result.from.name} → {result.to.name}
                  </small>
                </span>
              </div>
              <div className="option-metrics">
                <strong>
                  {route.duration}
                  <small> min</small>
                </strong>
                <span>{formatFare(route.cost)}</span>
                <span>
                  <Footprints size={14} aria-hidden="true" /> {route.walk} min
                  walk
                </span>
                <span>
                  {route.transfers} transfer{route.transfers === 1 ? "" : "s"}
                </span>
              </div>
              <div className="journey-ai-modes">
                {result.modes.map(({ id, short }) => (
                  <span key={id}>
                    <ModeIcon mode={id} size={16} /> {short}
                  </span>
                ))}
              </div>
            </article>
            {canSpeak && (
              <button
                className="button secondary journey-ai-speaker"
                type="button"
                aria-pressed={speaking}
                onClick={toggleSpeaking}
              >
                {speaking ? (
                  <Square size={16} aria-hidden="true" />
                ) : (
                  <Volume2 size={16} aria-hidden="true" />
                )}
                {speaking ? "Stop reading" : "Hear recommendation"}
              </button>
            )}
            <div className="journey-ai-navigation">
              <button
                className="button primary"
                type="button"
                onClick={() => openJourney("/journey")}
              >
                View journey <ArrowRight size={17} aria-hidden="true" />
              </button>
              <button
                className="button secondary"
                type="button"
                onClick={() => openJourney("/tracking")}
              >
                Start tracking
              </button>
            </div>
            <p className="journey-ai-help">
              Simulated services and fares for Sri Lanka, 2100.
            </p>
          </>
        )}
        <details className="journey-ai-locations">
          <summary>Explore available destinations</summary>
          <p>{locations.map(({ name }) => name).join(" · ")}</p>
        </details>
      </section>
    </div>
  );
}
