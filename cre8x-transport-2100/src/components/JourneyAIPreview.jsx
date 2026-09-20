import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { LoaderCircle, Mic, Send, Sparkles, Volume2, X } from "lucide-react";
import { journeyQuery, readJourney } from "../data/journeys";
import {
  createJourneyAIResponse,
  getJourneyAIContext,
} from "../utils/journeyAI";
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
import JourneyAIRecommendation from "./JourneyAIRecommendation";

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

const planningExamples = [
  "Take me to Galle",
  "Fastest route to Kandy",
  "Cheapest route to Kalutara",
  "I need less walking",
];
const followUpExamples = [
  "Make it faster",
  "Make it cheaper",
  "No air taxi",
  "How long will it take?",
  "How much does it cost?",
  "Show me another option",
  "Less walking",
  "Fewer transfers",
];
const selectedExamples = [
  "Start tracking",
  "Read directions",
  "Change route",
  "Cancel journey",
];
const trackingExamples = [
  "How long is left?",
  "What is my next stop?",
  "Read directions",
  "Change route",
];

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
  const [messages, setMessages] = useState([]);
  const [result, setResult] = useState(null);
  const [expandedSuggestions, setExpandedSuggestions] = useState(null);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const historyRef = useRef(null);
  const nextMessageId = useRef(0);
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
    accepted: Boolean(currentJourney.selected),
  };
  const journeyAIContext = getJourneyAIContext({
    pathname,
    from: currentJourney.from,
    to: currentJourney.to,
    route: currentJourney.selected,
  });
  const [conversation, setConversation] = useState(() =>
    createJourneyConversation(context),
  );
  const conversationRef = useRef(conversation);
  const recommendation =
    conversation.selectedJourney ?? conversation.lastResult;
  const phase = conversation.accepted
    ? "selected"
    : recommendation
      ? "recommended"
      : "planning";
  const examples =
    journeyAIContext.tracking
      ? trackingExamples
      : journeyAIContext.hasJourney
        ? followUpExamples
        : phase === "selected"
      ? selectedExamples
      : phase === "recommended"
        ? followUpExamples
        : planningExamples;
  const showAllSuggestions = expandedSuggestions === phase;
  const response = result ? createJourneyAIResponse(result) : "";
  const voiceNotice =
    notice ||
    microphoneNotice(permission) ||
    (!Recognition ? recognitionUnavailable : "");

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

  function openJourney() {
    if (!recommendation || busy) return;
    const query = journeyQuery(
      recommendation.from.name,
      recommendation.to.name,
      recommendation.route.id,
      recommendation.intent.walking,
    );
    closeDialog();
    navigate(`/journey?${query}`);
  }

  function openBooking() {
    if (!recommendation || busy) return;
    const query = journeyQuery(
      recommendation.from.name,
      recommendation.to.name,
      recommendation.route.id,
      recommendation.intent.walking,
    );
    closeDialog();
    navigate(`/journey?${query}&booking=1`);
  }

  useEffect(() => {
    const session = createVoiceSession({
      permission: openingPermission,
      Recognition,
      synthesis: window.speechSynthesis,
      Utterance: window.SpeechSynthesisUtterance,
      requestMicrophone: onRequestMicrophone,
      onMicrophoneUnavailable,
      greeting: journeyAIContext.greeting,
      onState: setVoice,
      onTranscript(request, source) {
        const message = {
          id: nextMessageId.current++,
          role: "user",
          text: request,
          source,
        };
        setMessages((previous) => [...previous, message]);
        setText("");
        setResult(null);
      },
      onRequest(request) {
        const turn = handleJourneyRequest(request, conversationRef.current);
        // Update immediately so the next browser callback sees the latest turn.
        conversationRef.current = turn.conversation;
        setConversation(turn.conversation);
        setResult(turn.result);
        const reply = createJourneyAIResponse(turn.result);
        const message = {
          id: nextMessageId.current++,
          role: "assistant",
          text: reply,
        };
        setMessages((previous) => [...previous, message]);
        if (turn.navigation) {
          // Dispose first so queued recognition or speech cannot follow us to Tracking.
          session.dispose();
          onClose();
          navigate(turn.navigation);
        }
        return reply;
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
    journeyAIContext.greeting,
    openingPermission,
    onRequestMicrophone,
    onMicrophoneUnavailable,
    onClose,
    navigate,
  ]);

  useEffect(() => {
    const history = historyRef.current;
    if (history && historyExpanded) history.scrollTop = history.scrollHeight;
  }, [messages, historyExpanded]);

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
        data-conversation={Boolean(messages.length || recommendation)}
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
        <div className="journey-ai-body">
          <div className="journey-ai-voice">
            <p className="journey-ai-prompt">
              {journeyAIContext.tracking
                ? "How can I help on your journey?"
                : journeyAIContext.routeReady || recommendation
                  ? "Your journey is ready."
                  : journeyAIContext.hasJourney || conversation.accepted
                    ? "How can I help with your journey?"
                    : "Where would you like to go?"}
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
              ) : busy ? (
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
          {recommendation && (
            <JourneyAIRecommendation
              journey={recommendation}
              accepted={conversation.accepted}
              busy={busy}
              onView={openJourney}
              onStart={openBooking}
            />
          )}
          <div
            className="journey-ai-examples"
            role="group"
            aria-labelledby="journey-ai-examples-label"
            data-expanded={showAllSuggestions}
          >
            <p id="journey-ai-examples-label">Try saying…</p>
            <div id="journey-ai-suggestions" className="journey-ai-suggestions">
              {examples.map((example, index) => (
                <button
                  // Keep each slot mounted so focus survives changing examples.
                  key={index}
                  className="journey-ai-suggestion"
                  type="button"
                  aria-label={`Ask Journey AI: ${example}`}
                  aria-disabled={busy}
                  onClick={() => {
                    if (!busy) voiceSessionRef.current?.submit(example, "text");
                  }}
                >
                  {example}
                </button>
              ))}
            </div>
            {examples.length > 4 && (
              <button
                className="journey-ai-more"
                type="button"
                aria-expanded={showAllSuggestions}
                aria-controls="journey-ai-suggestions"
                onClick={() =>
                  setExpandedSuggestions(showAllSuggestions ? null : phase)
                }
              >
                {showAllSuggestions ? "Fewer suggestions" : "More suggestions"}
              </button>
            )}
          </div>
          {messages.length > 0 && (
            <section
              className="journey-ai-history"
              aria-labelledby="journey-ai-history-label"
            >
              <div className="journey-ai-history-heading">
                <h3 id="journey-ai-history-label">Conversation</h3>
                <button
                  type="button"
                  className="journey-ai-history-toggle"
                  aria-expanded={historyExpanded}
                  aria-controls="journey-ai-history-messages"
                  onClick={() => setHistoryExpanded((expanded) => !expanded)}
                >
                  {historyExpanded
                    ? "Collapse conversation"
                    : "Expand conversation"}
                </button>
              </div>
              <div
                id="journey-ai-history-messages"
                ref={historyRef}
                className="journey-ai-content"
                hidden={!historyExpanded}
                tabIndex={historyExpanded ? 0 : undefined}
                role="log"
                aria-label="Journey conversation"
                aria-live="polite"
                aria-relevant="additions text"
              >
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={
                      message.role === "user"
                        ? "journey-ai-transcript"
                        : "journey-ai-answer"
                    }
                  >
                    <span>
                      {message.role === "user" ? "You" : "Journey AI"}
                    </span>
                    <p>{message.text}</p>
                  </div>
                ))}
              </div>
              {response && canSpeak && !speaking && (
                <button
                  type="button"
                  className="journey-ai-replay"
                  onClick={() => voiceSessionRef.current?.speak(response)}
                >
                  <Volume2 size={16} aria-hidden="true" /> Hear again
                </button>
              )}
              <p className="journey-ai-network">
                Simulated services and fares for Sri Lanka, 2100.
              </p>
            </section>
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
