export function voiceDebug(event, details = "") {
  if (import.meta.env?.DEV) console.debug("[JourneyAI]", event, details);
}

export function primeSpeechSynthesis({
  synthesis = globalThis.speechSynthesis,
  Utterance = globalThis.SpeechSynthesisUtterance,
} = {}) {
  if (!synthesis || !Utterance) return;
  try {
    // WebKit unlocks speech inside a user gesture, before the permission await.
    // A muted placeholder primes the engine without a second audible greeting.
    synthesis.cancel();
    const silent = new Utterance(" ");
    silent.volume = 0;
    synthesis.speak(silent);
    synthesis.cancel();
    voiceDebug("speech synthesis primed");
  } catch {
    // Permission and text entry must still work if synthesis is unavailable.
    voiceDebug("speech priming unavailable");
  }
}

// Calls onReady immediately when possible; otherwise waits only briefly.
// The returned cleanup prevents a late voiceschanged event from reviving audio.
export function ensureSpeechVoicesReady(
  synthesis,
  onReady,
  { timers = globalThis, timeoutMs = 600 } = {},
) {
  const read = () => {
    try {
      return synthesis?.getVoices?.() ?? [];
    } catch {
      return [];
    }
  };
  const voices = read();
  if (voices.length || !synthesis?.getVoices) {
    voiceDebug("voices count", voices.length);
    onReady(voices);
    return () => {};
  }

  let finished = false;
  let timeout;
  function cleanup() {
    finished = true;
    timers.clearTimeout(timeout);
    synthesis.removeEventListener?.("voiceschanged", changed);
  }
  function finish(available) {
    if (finished) return;
    cleanup();
    voiceDebug("voices count", available.length);
    onReady(available);
  }
  function changed() {
    const available = read();
    if (available.length) finish(available);
  }
  synthesis.addEventListener?.("voiceschanged", changed);
  timeout = timers.setTimeout(() => finish(read()), timeoutMs);
  changed();
  return cleanup;
}
