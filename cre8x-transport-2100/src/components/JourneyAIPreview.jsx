import { useEffect, useRef, useState } from "react";
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
import { microphoneNotice } from "../utils/microphone";
import {
  createVoiceSession,
  initialVoiceState,
  recognitionUnavailable,
} from "../utils/voiceSession";
import {
  createJourneyConversation,
  handleJourneyRequest,
} from "../utils/journeyConversation";
import { ModeIcon } from "./UI";

const statusLabels = {
  idle: "Tap to start conversation",
  "requesting-permission": "Requesting microphone permission…",
  greeting: "Journey AI is speaking…",
  listening: "Listening…",
  processing: "Finding your best journey…",
  result: "Tap to start conversation",
  speaking: "Journey AI is speaking…",
  paused: "Conversation paused",
  "voice-error": "Voice unavailable — you can type below",
};

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
  const [voice, setVoice] = useState(() => initialVoiceState(permission));
  const { status, notice, conversationActive } = voice;
  const [text, setText] = useState("");
  const [lastRequest, setLastRequest] = useState(null);
  const [result, setResult] = useState(null);
  const dialogRef = useRef(null);
  const microphoneRef = useRef(null);
  const closeButtonRef = useRef(null);
  const voiceSessionRef = useRef(null);
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
  const conversationRef = useRef(conversation);
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

  function handleMicrophone() {
    voiceSessionRef.current?.toggle();
  }

  function editRequest(value) {
    voiceSessionRef.current?.beginTyping();
    setText(value);
  }

  function submit(event) {
    event.preventDefault();
    if (text.trim()) voiceSessionRef.current?.submit(text.trim(), "text");
  }

  function closeDialog() {
    voiceSessionRef.current?.dispose();
    onClose();
  }

  function openJourney(path) {
    const query = journeyQuery(
      result.from.name,
      result.to.name,
      route.id,
      result.intent.walking,
    );
    closeDialog();
    navigate(`${path}?${query}`);
  }

  useEffect(() => {
    const session = createVoiceSession({
      permission: openingPermission,
      Recognition,
      synthesis: window.speechSynthesis,
      Utterance: window.SpeechSynthesisUtterance,
      requestMicrophone: onRequestMicrophone,
      onMicrophoneUnavailable,
      onState: setVoice,
      onTranscript(request, source) {
        setLastRequest({ text: request, source });
        setText("");
        setResult(null);
      },
      onRequest(request) {
        const turn = handleJourneyRequest(request, conversationRef.current);
        // Update immediately so the next browser callback sees the latest turn.
        conversationRef.current = turn.conversation;
        setConversation(turn.conversation);
        setResult(turn.result);
        return createJourneyAIResponse(turn.result);
      },
    });
    voiceSessionRef.current = session;
    session.open();
    return () => {
      session.dispose();
      if (voiceSessionRef.current === session) voiceSessionRef.current = null;
    };
  }, [
    Recognition,
    openingPermission,
    onRequestMicrophone,
    onMicrophoneUnavailable,
  ]);

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
        voiceSessionRef.current?.dispose();
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
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      siblings.forEach(([element, wasInert]) => {
        element.inert = wasInert;
      });
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [onClose, returnFocusRef]);

  return (
    <div className="modal-backdrop journey-ai-backdrop" onClick={closeDialog}>
      <section
        ref={dialogRef}
        className="journey-ai-dialog glass-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="journey-ai-title"
        data-state={status}
        data-conversation={Boolean(lastRequest || result)}
        data-voice-active={conversationActive}
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
            onClick={closeDialog}
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
              speaking || (conversationActive && status !== "paused")
                ? "Pause voice conversation"
                : status === "paused"
                  ? "Resume voice conversation"
                  : "Start voice conversation"
            }
            aria-pressed={conversationActive && status !== "paused"}
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
          <button
            className="journey-ai-end"
            type="button"
            disabled={!conversationActive && !speaking && !busy}
            onClick={() => voiceSessionRef.current?.end()}
          >
            End conversation
          </button>
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
                  onClick={() => voiceSessionRef.current?.speak(response)}
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
              onFocus={() => voiceSessionRef.current?.beginTyping()}
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
