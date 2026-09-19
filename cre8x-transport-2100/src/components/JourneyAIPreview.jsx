import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Accessibility,
  ArrowRight,
  Footprints,
  LoaderCircle,
  Mic,
  Send,
  Sparkles,
  Volume2,
  X,
} from "lucide-react";
import { formatFare, journeyQuery, readJourney } from "../data/journeys";
import { createJourneyAIResponse } from "../utils/journeyAI";
import { microphoneFailure, microphoneNotice } from "../utils/microphone";
import {
  createJourneyConversation,
  handleJourneyRequest,
} from "../utils/journeyConversation";
import { ModeIcon } from "./UI";

const greeting =
  "Hi, where would you like to go? Tell me how I can help plan your journey.";
const recognitionUnavailable =
  "Voice recognition is not supported in this browser. You can still type your request.";
const speechErrors = {
  "not-allowed": microphoneNotice("denied"),
  "service-not-allowed":
    "Your browser blocked the speech recognition service. Try a browser with voice support, such as Chrome, or type your request below.",
  "audio-capture": microphoneNotice("not-readable"),
  "no-speech":
    "I didn't hear anything. Tap the microphone to try again, or type below.",
  network:
    "Voice recognition couldn't connect to its service. Check your internet connection, then retry or type your request.",
  aborted: "Listening stopped. Tap to speak again or type below.",
};
const statusLabels = {
  idle: "Tap to speak",
  "requesting-permission": "Requesting microphone permission…",
  greeting: "Journey AI is speaking…",
  listening: "Listening…",
  processing: "Finding your best journey…",
  result: "Tap to speak",
  speaking: "Journey AI is speaking…",
  "voice-error": "Tap to try again",
};

function releaseRecognition(ref) {
  const recognition = ref.current;
  ref.current = null;
  if (!recognition) return;
  recognition.onstart = recognition.onresult = recognition.onerror = null;
  recognition.onend = recognition.onnomatch = null;
  try {
    recognition.abort();
  } catch {
    // Some browsers throw if the recognition service has already stopped.
  }
}

function releaseSpeech(ref) {
  if (!ref.current) return;
  ref.current.onend = ref.current.onerror = null;
  ref.current = null;
  window.speechSynthesis?.cancel();
}

export default function JourneyAIPreview({ open, ...props }) {
  return open ? <JourneyAIDialog {...props} /> : null;
}

function JourneyAIDialog({
  permission,
  onRequestMicrophone,
  onMicrophoneUnavailable,
  onClose,
  returnFocusRef,
}) {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const Recognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  const canSpeak = Boolean(
    window.speechSynthesis && window.SpeechSynthesisUtterance,
  );
  const [openingPermission] = useState(permission);
  const [status, setStatus] = useState(
    permission === "granted" ? "greeting" : "voice-error",
  );
  const [text, setText] = useState("");
  const [lastRequest, setLastRequest] = useState(null);
  const [result, setResult] = useState(null);
  const [notice, setNotice] = useState("");
  const dialogRef = useRef(null);
  const microphoneRef = useRef(null);
  const closeButtonRef = useRef(null);
  const recognitionRef = useRef(null);
  const utteranceRef = useRef(null);
  const startupRef = useRef(null);
  const processingRef = useRef(null);
  const activityRef = useRef(0);
  const manualStopRef = useRef(false);
  const speaking = status === "greeting" || status === "speaking";
  const busy = status === "processing" || status === "requesting-permission";
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
  const [conversation, setConversation] = useState(() =>
    createJourneyConversation(context),
  );
  const route = result?.status === "success" ? result.route : null;
  const response = result ? createJourneyAIResponse(result) : "";
  const answer =
    route && result.kind !== "answer"
      ? response.slice(0, response.indexOf(".") + 1)
      : response;
  const voiceNotice =
    notice ||
    microphoneNotice(permission) ||
    (!Recognition ? recognitionUnavailable : "");
  const stepFree = route?.segments
    .filter(({ mode }) => mode === "walk")
    .every(({ status }) => status === "Step-free path");

  function cancelActivity() {
    activityRef.current += 1;
    window.clearTimeout(startupRef.current);
    window.clearTimeout(processingRef.current);
    releaseRecognition(recognitionRef);
    releaseSpeech(utteranceRef);
  }

  function speakMessage(message, kind = "speaking", onFinished) {
    releaseRecognition(recognitionRef);
    releaseSpeech(utteranceRef);
    if (!canSpeak) {
      if (onFinished) onFinished();
      else setStatus("result");
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const utterance = new window.SpeechSynthesisUtterance(message);
      utterance.lang = "en-US";
      utteranceRef.current = utterance;
      utterance.onend = () => {
        if (utteranceRef.current !== utterance) return;
        utteranceRef.current = null;
        setStatus("idle");
        // Let the speech engine finish its end event before opening the microphone.
        if (onFinished) startupRef.current = window.setTimeout(onFinished, 0);
      };
      utterance.onerror = () => {
        if (utteranceRef.current !== utterance) return;
        utteranceRef.current = null;
        setStatus("voice-error");
        setNotice(
          "Spoken playback is unavailable. Tap the microphone or type below.",
        );
      };
      setStatus(kind);
      window.speechSynthesis.speak(utterance);
    } catch {
      releaseSpeech(utteranceRef);
      setStatus("voice-error");
      setNotice(
        "Spoken playback is unavailable. Tap the microphone or type below.",
      );
    }
  }

  function findJourney(request, source) {
    cancelActivity();
    setLastRequest({ text: request, source });
    setText("");
    setResult(null);
    setNotice("");
    setStatus("processing");
    // Calculate from the existing network after React renders the processing state.
    processingRef.current = window.setTimeout(() => {
      const turn = handleJourneyRequest(request, conversation);
      const recommendation = turn.result;
      setConversation(turn.conversation);
      setResult(recommendation);
      setStatus("result");
      speakMessage(createJourneyAIResponse(recommendation));
    }, 0);
  }

  function startListening() {
    if (!Recognition) {
      setStatus("voice-error");
      setNotice(recognitionUnavailable);
      return;
    }
    // Never listen over a greeting, recommendation, or other active spoken audio.
    if (window.speechSynthesis?.speaking) {
      setStatus("voice-error");
      setNotice(
        "Audio is still playing. Wait until it finishes, then tap to speak.",
      );
      return;
    }
    cancelActivity();
    setStatus("listening");
    setNotice("");
    setLastRequest(null);
    setResult(null);
    setText("");
    manualStopRef.current = false;
    let transcript = "";
    try {
      const recognition = new Recognition();
      recognitionRef.current = recognition;
      recognition.lang = "en-US";
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.onresult = (event) => {
        if (recognitionRef.current !== recognition) return;
        const recognized = event.results[event.resultIndex ?? 0];
        if (
          recognized?.isFinal === false ||
          !recognized?.[0]?.transcript?.trim()
        )
          return;
        transcript = recognized[0].transcript.trim();
        setLastRequest({ text: transcript, source: "voice" });
      };
      recognition.onerror = (event) => {
        if (recognitionRef.current !== recognition) return;
        releaseRecognition(recognitionRef);
        setStatus("voice-error");
        setNotice(
          speechErrors[event.error] ||
            "Voice recognition is unavailable. Try again or type below.",
        );
        if (event.error === "not-allowed") onMicrophoneUnavailable("denied");
        if (event.error === "audio-capture")
          onMicrophoneUnavailable("not-readable");
      };
      recognition.onnomatch = () => {
        if (recognitionRef.current !== recognition) return;
        releaseRecognition(recognitionRef);
        setStatus("voice-error");
        setNotice(
          "I couldn't understand that. Try speaking again or type below.",
        );
      };
      recognition.onend = () => {
        if (recognitionRef.current !== recognition) return;
        releaseRecognition(recognitionRef);
        if (transcript) findJourney(transcript, "voice");
        else {
          setStatus("idle");
          if (!manualStopRef.current) setNotice(speechErrors["no-speech"]);
        }
      };
      recognition.start();
    } catch (error) {
      releaseRecognition(recognitionRef);
      setStatus("voice-error");
      const failure = microphoneFailure(error);
      if (failure !== "unavailable") {
        onMicrophoneUnavailable(failure);
        setNotice(microphoneNotice(failure));
      } else {
        setNotice("Voice recognition couldn't start. Try again or type below.");
      }
    }
  }

  async function handleMicrophone() {
    if (busy) return;
    if (speaking) {
      cancelActivity();
      setStatus("idle");
      return;
    }
    if (recognitionRef.current) {
      manualStopRef.current = true;
      try {
        recognitionRef.current.stop();
      } catch {
        releaseRecognition(recognitionRef);
        setStatus("idle");
      }
      return;
    }
    if (permission !== "granted") {
      const activity = ++activityRef.current;
      setStatus("requesting-permission");
      setNotice("");
      const nextPermission = await onRequestMicrophone();
      if (activity !== activityRef.current) return;
      if (nextPermission !== "granted") {
        setStatus("voice-error");
        setNotice(microphoneNotice(nextPermission));
        return;
      }
    }
    startListening();
  }

  function editRequest(value) {
    cancelActivity();
    setText(value);
    setStatus("idle");
    setNotice("");
  }

  function submit(event) {
    event.preventDefault();
    if (text.trim()) findJourney(text.trim(), "text");
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

  const greetOnOpen = useEffectEvent(() => {
    speakMessage(greeting, "greeting");
  });

  useEffect(() => {
    if (openingPermission !== "granted") return;
    // Each explicit opening greets once, including under development StrictMode.
    startupRef.current = window.setTimeout(() => greetOnOpen(), 0);
    return () => window.clearTimeout(startupRef.current);
  }, [openingPermission]);

  useEffect(() => {
    const previousFocus = returnFocusRef.current ?? document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Keep the full dialog visible; typing should only start when chosen.
    const focusTarget =
      microphoneRef.current && !microphoneRef.current.disabled
        ? microphoneRef.current
        : closeButtonRef.current;
    focusTarget?.focus({ preventScroll: true });
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
      ].filter((element) => element.getClientRects().length);
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
      activityRef.current += 1;
      window.clearTimeout(startupRef.current);
      window.clearTimeout(processingRef.current);
      releaseRecognition(recognitionRef);
      releaseSpeech(utteranceRef);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      siblings.forEach(([element, wasInert]) => {
        element.inert = wasInert;
      });
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [onClose, returnFocusRef]);

  return (
    <div className="modal-backdrop journey-ai-backdrop" onClick={onClose}>
      <section
        ref={dialogRef}
        className="journey-ai-dialog glass-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="journey-ai-title"
        data-state={status}
        data-conversation={Boolean(lastRequest || result)}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="journey-ai-heading">
          <span className="assistant-orb" aria-hidden="true">
            <Sparkles size={21} />
          </span>
          <div>
            <span className="eyebrow">YOUR JOURNEY ASSISTANT</span>
            <h2 id="journey-ai-title">Journey AI</h2>
          </div>
          <button
            ref={closeButtonRef}
            className="journey-ai-close icon-button"
            type="button"
            aria-label="Close Journey AI"
            onClick={onClose}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        {conversation.from && conversation.to && (
          <p className="journey-ai-context">
            <span>Current journey</span> {conversation.from} → {conversation.to}
          </p>
        )}
        <div className="journey-ai-voice">
          <p className="journey-ai-prompt">
            {route ? "Your journey is ready." : "Where would you like to go?"}
          </p>
          <button
            ref={microphoneRef}
            className="journey-ai-mic"
            type="button"
            data-state={status}
            disabled={(!Recognition && !speaking) || busy}
            aria-label={
              speaking
                ? "Stop Journey AI speaking"
                : status === "listening"
                  ? "Stop listening"
                  : "Speak your journey request"
            }
            aria-pressed={status === "listening"}
            aria-describedby="journey-ai-voice-status"
            onClick={handleMicrophone}
          >
            {speaking ? (
              <span className="journey-ai-waveform" aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
                <i />
              </span>
            ) : status === "processing" ||
              status === "requesting-permission" ? (
              <LoaderCircle size={33} aria-hidden="true" />
            ) : (
              <Mic size={36} strokeWidth={1.6} aria-hidden="true" />
            )}
          </button>
          <p
            id="journey-ai-voice-status"
            className="journey-ai-voice-status"
            role="status"
            aria-live="polite"
          >
            {!Recognition && !speaking
              ? "Type your request below"
              : statusLabels[status]}
          </p>
          {voiceNotice && (
            <p className="journey-ai-notice" role="status">
              {voiceNotice}
            </p>
          )}
        </div>
        <div
          className="journey-ai-content"
          tabIndex={lastRequest || result ? 0 : undefined}
          aria-label="Journey conversation"
        >
          {lastRequest && (
            <div className="journey-ai-transcript">
              <span>
                {lastRequest.source === "voice" ? "You said" : "You asked"}
              </span>
              <p>“{lastRequest.text}”</p>
            </div>
          )}
          {result && (
            <div className="journey-ai-answer" role="status" aria-live="polite">
              <span>Journey AI</span>
              <p>{answer}</p>
            </div>
          )}
          {route && (
            <article
              className="journey-ai-recommendation glass-card"
              aria-label="Recommended journey"
            >
              <div className="journey-ai-route-label">
                <ModeIcon mode={route.icon} size={17} />
                <strong>{route.label}</strong>
              </div>
              <div className="journey-ai-modes">
                {result.modes.map(({ id, short }, index) => (
                  <span key={id}>
                    {index > 0 && <ArrowRight size={13} aria-hidden="true" />}
                    <ModeIcon mode={id} size={18} />
                    {short}
                  </span>
                ))}
              </div>
              <dl className="journey-ai-metrics">
                <div>
                  <dt>Travel time</dt>
                  <dd>
                    {route.duration}
                    <small> min</small>
                  </dd>
                </div>
                <div>
                  <dt>Fare</dt>
                  <dd>{formatFare(route.cost)}</dd>
                </div>
                <div>
                  <dt>Transfers</dt>
                  <dd>{route.transfers}</dd>
                </div>
                <div>
                  <dt>Walking</dt>
                  <dd>
                    {route.walk}
                    <small> min</small>
                  </dd>
                </div>
              </dl>
              <div className="journey-ai-accessibility">
                {route.walk <= 4 && (
                  <span>
                    <Footprints size={13} aria-hidden="true" />
                    Low walking
                  </span>
                )}
                {stepFree && (
                  <span>
                    <Accessibility size={14} aria-hidden="true" />
                    Step-free paths
                  </span>
                )}
              </div>
              <div className="journey-ai-navigation">
                <button
                  className="button primary"
                  type="button"
                  onClick={() => openJourney("/journey")}
                >
                  View journey <ArrowRight size={16} aria-hidden="true" />
                </button>
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => openJourney("/tracking")}
                >
                  Start tracking
                </button>
              </div>
            </article>
          )}
          {result && (
            <div className="journey-ai-result-tools">
              {route && (
                <details>
                  <summary>Recommendation details</summary>
                  <p>{response}</p>
                  <small>
                    Simulated services and fares for Sri Lanka, 2100.
                  </small>
                </details>
              )}
              {canSpeak && !speaking && (
                <button
                  type="button"
                  className="journey-ai-replay"
                  onClick={() => {
                    cancelActivity();
                    setNotice("");
                    speakMessage(response);
                  }}
                >
                  <Volume2 size={16} aria-hidden="true" />
                  Hear again
                </button>
              )}
            </div>
          )}
        </div>
        <footer className="journey-ai-composer">
          <div className="journey-ai-divider">
            <span>or type instead</span>
          </div>
          <form className="journey-ai-form" onSubmit={submit}>
            <label className="journey-ai-sr-only" htmlFor="journey-ai-request">
              Type a journey request
            </label>
            <input
              id="journey-ai-request"
              value={text}
              autoComplete="off"
              onChange={(event) => editRequest(event.target.value)}
              placeholder="Ask Journey AI…"
            />
            <button
              type="submit"
              className="journey-ai-send"
              aria-label="Send journey request"
              disabled={!text.trim()}
            >
              <Send size={19} aria-hidden="true" />
            </button>
          </form>
        </footer>
      </section>
    </div>
  );
}
