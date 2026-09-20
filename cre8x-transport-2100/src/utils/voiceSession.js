import { microphoneFailure, microphoneNotice } from "./microphone.js";

export const voiceGreeting = " Hi, I’m Journey AI. Where would you like to go?";
export const recognitionUnavailable =
  "Voice recognition is not supported in this browser. You can still type your request.";

export function initialVoiceState(permission) {
  return {
    conversationActive: false,
    status: permission === "granted" ? "idle" : "voice-error",
    notice: microphoneNotice(permission),
  };
}

// Owns browser audio and timers only. Journey interpretation stays in onRequest.
export function createVoiceSession({
  permission,
  Recognition,
  synthesis,
  Utterance,
  requestMicrophone,
  onState,
  onTranscript,
  onRequest,
  onMicrophoneUnavailable,
  timers = globalThis,
}) {
  let state = initialVoiceState(permission);
  let active = false;
  let paused = false;
  let disposed = false;
  let revision = 0;
  let silenceCount = 0;
  let recognition = null;
  let utterance = null;
  let workTimer = null;
  let drainTimer = null;
  let pendingAction = null;
  const stopFailure =
    "The microphone did not stop correctly. Close Journey AI and try again, or type below.";

  function emit(status, notice = "") {
    if (disposed) return;
    state = { conversationActive: active, status, notice };
    onState(state);
  }

  function later(action, delay = 0) {
    timers.clearTimeout(workTimer);
    const version = revision;
    workTimer = timers.setTimeout(() => {
      workTimer = null;
      if (!disposed && revision === version) action();
    }, delay);
  }

  function finishRecognition(turn) {
    if (recognition !== turn) return;
    recognition = null;
    timers.clearTimeout(drainTimer);
    drainTimer = null;
    const engine = turn.engine;
    engine.onresult = engine.onerror = engine.onnomatch = engine.onend = null;
    if (disposed) return;
    const next = pendingAction;
    pendingAction = null;
    if (next?.version === revision) next.action();
    else if (!turn.cancelled && turn.version === revision) quietRetry();
  }

  function stopRecognition() {
    const turn = recognition;
    if (!turn || turn.cancelled) return;
    turn.cancelled = true;
    turn.engine.onresult = turn.engine.onerror = turn.engine.onnomatch = null;
    // Wait for disconnection before starting speech or another recognition turn.
    drainTimer = timers.setTimeout(() => {
      turn.timedOut = true;
      fail(stopFailure);
    }, 2000);
    try {
      turn.engine.abort();
    } catch {
      // An already stopped engine may throw instead of emitting another end event.
      finishRecognition(turn);
    }
  }

  function cancelWork() {
    revision += 1;
    timers.clearTimeout(workTimer);
    workTimer = null;
    pendingAction = null;
    stopRecognition();
    if (utterance) {
      utterance.onend = utterance.onerror = null;
      utterance = null;
      synthesis?.cancel();
    }
  }

  function whenRecognitionStops(action) {
    if (disposed) return;
    if (recognition?.timedOut) {
      fail(stopFailure);
      return;
    }
    if (!recognition) action();
    else {
      pendingAction = { version: revision, action };
      stopRecognition();
    }
  }

  function fail(message, microphoneReason) {
    if (disposed) return;
    active = false;
    paused = false;
    cancelWork();
    if (microphoneReason) {
      permission = microphoneReason;
      onMicrophoneUnavailable(microphoneReason);
    }
    emit("voice-error", message);
  }

  function pause(message = "Tap the microphone to continue.") {
    if (disposed) return;
    paused = active;
    cancelWork();
    emit(active ? "paused" : "idle", message);
  }

  function quietRetry() {
    if (!active || paused || disposed) return;
    silenceCount += 1;
    if (silenceCount >= 3) {
      pause("I’m still here. Tap the microphone to continue.");
      return;
    }
    emit("listening");
    later(listen, 400);
  }

  function handleRecognitionError(error) {
    switch (error) {
      case "no-speech":
        whenRecognitionStops(quietRetry);
        break;
      case "not-allowed":
        fail(microphoneNotice("denied"), "denied");
        break;
      case "audio-capture":
        fail(microphoneNotice("not-readable"), "not-readable");
        break;
      case "service-not-allowed":
        fail(
          "Your browser blocked the speech recognition service. Try a browser with voice support, such as Chrome, or type below.",
        );
        break;
      case "network":
        pause(
          "Voice recognition couldn’t connect. Check your internet connection, then tap the microphone to resume or type below.",
        );
        break;
      case "aborted":
        pause("Listening stopped. Tap the microphone to resume or type below.");
        break;
      default:
        fail(
          "Voice recognition is unavailable. Tap the microphone to retry or type below.",
        );
    }
  }

  function listen() {
    if (
      !active ||
      paused ||
      disposed ||
      utterance ||
      state.status === "processing"
    )
      return;
    if (!Recognition) {
      fail(recognitionUnavailable);
      return;
    }
    if (synthesis?.speaking || synthesis?.pending) {
      pause("Audio is still playing. Tap the microphone after it finishes.");
      return;
    }
    whenRecognitionStops(() => {
      if (!active || paused || disposed) return;
      if (synthesis?.speaking || synthesis?.pending) {
        pause("Audio is still playing. Tap the microphone after it finishes.");
        return;
      }
      let turn;
      try {
        const engine = new Recognition();
        turn = { engine, version: revision, cancelled: false };
        recognition = turn;
        engine.lang = "en-US";
        engine.continuous = false;
        engine.interimResults = false;
        engine.onresult = (event) => {
          if (
            disposed ||
            recognition !== turn ||
            turn.cancelled ||
            turn.version !== revision
          )
            return;
          for (
            let index = event.resultIndex ?? 0;
            index < event.results.length;
            index++
          ) {
            const result = event.results[index];
            const text = result?.[0]?.transcript?.trim();
            if (result?.isFinal !== false && text) {
              silenceCount = 0;
              submit(text, "voice");
              return;
            }
          }
        };
        engine.onerror = (event) => {
          if (
            recognition === turn &&
            !turn.cancelled &&
            turn.version === revision
          )
            handleRecognitionError(event.error);
        };
        engine.onnomatch = () => {
          if (
            recognition === turn &&
            !turn.cancelled &&
            turn.version === revision
          )
            whenRecognitionStops(quietRetry);
        };
        engine.onend = () => finishRecognition(turn);
        emit("listening");
        engine.start();
      } catch (error) {
        if (turn) {
          turn.cancelled = true;
          finishRecognition(turn);
        }
        const reason = microphoneFailure(error);
        fail(
          reason === "unavailable"
            ? "Voice recognition couldn’t start. Tap the microphone to retry or type below."
            : microphoneNotice(reason),
          reason === "unavailable" ? undefined : reason,
        );
      }
    });
  }

  function speak(message, kind = "speaking") {
    if (disposed) return;
    cancelWork();
    whenRecognitionStops(() => {
      if (!synthesis || !Utterance) {
        pause(
          "Spoken playback is unavailable. Tap the microphone or type below.",
        );
        return;
      }
      try {
        synthesis.cancel();
        const speech = new Utterance(message);
        const version = revision;
        speech.lang = "en-US";
        utterance = speech;
        speech.onend = () => {
          if (disposed || utterance !== speech || version !== revision) return;
          utterance = null;
          speech.onend = speech.onerror = null;
          emit(paused ? "paused" : active ? "idle" : "result");
          // Restart only after speech ends, with a short gap for the audio device.
          if (active && !paused) later(listen, 200);
        };
        speech.onerror = () => {
          if (utterance === speech && version === revision)
            pause(
              "Spoken playback is unavailable. Tap the microphone or type below.",
            );
        };
        emit(kind);
        synthesis.speak(speech);
      } catch {
        pause(
          "Spoken playback is unavailable. Tap the microphone or type below.",
        );
      }
    });
  }

  function submit(request, source = "text") {
    if (disposed || !request.trim()) return;
    cancelWork();
    onTranscript(request.trim(), source);
    emit("processing");
    later(() => {
      try {
        const response = onRequest(request.trim(), source);
        if (active) speak(response);
        else emit("result");
      } catch {
        fail(
          "I couldn’t process that request. Please try again or type below.",
        );
      }
    });
  }

  async function start({ greet = false } = {}) {
    if (
      disposed ||
      state.status === "requesting-permission" ||
      state.status === "processing"
    )
      return;
    cancelWork();
    active = true;
    paused = false;
    silenceCount = 0;
    if (!Recognition) {
      fail(recognitionUnavailable);
      return;
    }
    if (permission !== "granted") {
      const version = revision;
      emit("requesting-permission");
      let nextPermission;
      try {
        nextPermission = await requestMicrophone();
      } catch (error) {
        nextPermission = microphoneFailure(error);
      }
      if (disposed || revision !== version) return;
      permission = nextPermission;
      if (permission !== "granted") {
        fail(microphoneNotice(permission), permission);
        return;
      }
    }
    if (greet) speak(voiceGreeting, "greeting");
    else {
      emit("idle");
      listen();
    }
  }

  return {
    getState: () => ({ ...state }),
    open() {
      if (!disposed && permission === "granted")
        later(() => start({ greet: true }));
    },
    toggle() {
      if ((active && !paused) || utterance) pause();
      else return start();
    },
    beginTyping() {
      pause("");
    },
    submit,
    speak,
    end() {
      if (disposed) return;
      active = false;
      paused = false;
      cancelWork();
      emit("idle", "Voice conversation ended. You can still type below.");
    },
    dispose() {
      disposed = true;
      active = false;
      state = { ...state, conversationActive: false, status: "idle" };
      cancelWork();
      timers.clearTimeout(drainTimer);
      if (recognition) {
        recognition.engine.onend = null;
        recognition = null;
      }
    },
  };
}
