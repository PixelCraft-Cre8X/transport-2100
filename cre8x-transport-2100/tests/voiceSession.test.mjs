import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createVoiceSession,
  voiceGreeting,
} from "../src/utils/voiceSession.js";
import { primeSpeechSynthesis } from "../src/utils/speechSynthesis.js";

class Clock {
  now = 0;
  next = 0;
  tasks = new Map();
  microtasks = [];
  queueMicrotask(fn) {
    this.microtasks.push(fn);
  }
  flushMicrotasks() {
    while (this.microtasks.length) this.microtasks.shift()();
  }
  setTimeout(fn, delay = 0) {
    const id = ++this.next;
    this.tasks.set(id, { fn, at: this.now + delay });
    return id;
  }
  clearTimeout(id) {
    this.tasks.delete(id);
  }
  advance(ms = 0) {
    this.flushMicrotasks();
    const target = this.now + ms;
    let count = 0;
    while (true) {
      const next = [...this.tasks.entries()].sort(
        (a, b) => a[1].at - b[1].at,
      )[0];
      if (!next || next[1].at > target) break;
      assert.ok(++count < 100, "no unbounded timer/restart loop");
      this.tasks.delete(next[0]);
      this.now = next[1].at;
      next[1].fn();
      this.flushMicrotasks();
    }
    this.now = target;
  }
}

function harness(overrides = {}) {
  const clock = new Clock();
  const engines = [],
    utterances = [],
    states = [],
    transcripts = [],
    requests = [],
    failures = [];
  let permissionRequests = 0;
  const voiceListeners = new Set();
  const synthesis = {
    speaking: false,
    pending: false,
    voices: overrides.voices ?? [{ lang: "en-US" }],
    getVoices() {
      if (overrides.voicesError) throw new Error("Voice list unavailable");
      return this.voices;
    },
    addEventListener(event, listener) {
      assert.equal(event, "voiceschanged");
      voiceListeners.add(listener);
    },
    removeEventListener(event, listener) {
      assert.equal(event, "voiceschanged");
      voiceListeners.delete(listener);
    },
    voicesChanged() {
      for (const listener of voiceListeners) listener();
    },
    speak(utterance) {
      assert.ok(
        engines.every((engine) => !engine.running),
        "recognition ends before speech starts",
      );
      if (overrides.speechError) throw new Error("Speech unavailable");
      utterances.push(utterance);
      this.pending = true;
      if (overrides.autoSpeechStart !== false) this.start();
    },
    start() {
      this.pending = false;
      this.speaking = true;
      utterances.at(-1).onstart?.();
    },
    cancel() {
      this.speaking = false;
      this.pending = false;
    },
    finish() {
      this.speaking = false;
      this.pending = false;
      utterances.at(-1).onend?.();
    },
  };
  class Recognition {
    running = false;
    autoEnd = true;
    constructor() {
      engines.push(this);
    }
    start() {
      assert.equal(synthesis.speaking, false, "never listen over synthesis");
      assert.ok(
        engines.every((engine) => !engine.running),
        "at most one live recognition",
      );
      if (overrides.startError) throw overrides.startError;
      this.running = true;
    }
    abort() {
      if (this.autoEnd) clock.setTimeout(() => this.end(), 20);
    }
    end() {
      this.running = false;
      this.onend?.();
    }
    result(text, final = true) {
      const result = [{ transcript: text }];
      result.isFinal = final;
      this.onresult?.({ resultIndex: 0, results: [result] });
    }
    error(error) {
      this.onerror?.({ error });
    }
  }
  class Utterance {
    constructor(text) {
      this.text = text;
    }
  }
  const session = createVoiceSession({
    permission: "granted",
    Recognition,
    synthesis,
    Utterance,
    requestMicrophone: async () => {
      permissionRequests++;
      return "granted";
    },
    onState: (state) => states.push(state),
    onTranscript: (text, source) => transcripts.push({ text, source }),
    onRequest: (text, source) => {
      requests.push({ text, source });
      return `Reply to ${text}`;
    },
    onMicrophoneUnavailable: (reason) => failures.push(reason),
    timers: clock,
    ...overrides,
  });
  const open = () => {
    session.open();
    clock.advance();
  };
  const finishSpeech = () => {
    synthesis.finish();
    clock.advance(200);
  };
  return {
    session,
    clock,
    engines,
    utterances,
    synthesis,
    states,
    transcripts,
    requests,
    failures,
    voiceListeners,
    open,
    finishSpeech,
    permissionRequests: () => permissionRequests,
  };
}

test("explicit opening greets, then completes multiple automatic voice turns", () => {
  const h = harness();
  h.clock.advance(1000);
  assert.equal(h.utterances.length, 0);
  assert.equal(h.engines.length, 0);
  h.open();
  assert.equal(h.utterances[0].text, voiceGreeting);
  assert.equal(h.utterances[0].lang, "en-US");
  assert.equal(h.session.getState().greetingRetryAvailable, false);
  assert.equal(h.session.getState().status, "greeting");
  assert.equal(h.engines.length, 0);
  h.finishSpeech();
  for (const text of [
    "I want to go to Rathnapura.",
    "Make it fastest.",
    "Don't use air taxi.",
    "How much will it cost?",
  ]) {
    const engine = h.engines.at(-1);
    assert.equal(engine.continuous, false);
    assert.equal(engine.interimResults, false);
    engine.result(text);
    assert.equal(h.transcripts.at(-1).text, text);
    h.clock.advance(20);
    assert.equal(h.requests.at(-1).text, text);
    assert.equal(h.session.getState().status, "speaking");
    h.finishSpeech();
    assert.equal(h.session.getState().status, "listening");
  }
  assert.equal(h.requests.length, 4);
  assert.equal(h.permissionRequests(), 0);
  h.session.dispose();
});

test("interim, duplicate and stale recognition callbacks cannot submit extra turns", () => {
  const h = harness();
  h.open();
  h.finishSpeech();
  const engine = h.engines.at(-1);
  const lateResult = engine.onresult;
  engine.result("unfinished", false);
  assert.equal(h.requests.length, 0);
  engine.result("Take me to Galle");
  const result = [{ transcript: "duplicate" }];
  result.isFinal = true;
  lateResult({ results: [result] });
  engine.end();
  engine.end();
  h.clock.advance(20);
  assert.equal(h.requests.length, 1);
  assert.equal(h.utterances.length, 2);
  h.session.end();
  lateResult({ results: [result] });
  h.clock.advance(10000);
  assert.equal(h.requests.length, 1);
});

test("three silent turns pause quietly, and explicit resume resets silence", () => {
  const h = harness();
  h.open();
  h.finishSpeech();
  for (let i = 0; i < 3; i++) {
    h.engines.at(-1).error("no-speech");
    h.clock.advance(420);
  }
  assert.equal(h.session.getState().status, "paused");
  assert.match(h.session.getState().notice, /still here/);
  assert.equal(h.utterances.length, 1);
  assert.equal(h.engines.length, 3);
  h.clock.advance(100000);
  assert.equal(h.engines.length, 3);
  h.session.toggle();
  assert.equal(h.engines.length, 4);
  h.engines.at(-1).end();
  h.clock.advance(400);
  assert.equal(h.session.getState().status, "listening");
  h.session.dispose();
});

test("valid speech resets the silence counter; nomatch and empty end are bounded", () => {
  const h = harness();
  h.open();
  h.finishSpeech();
  h.engines.at(-1).end();
  h.clock.advance(400);
  h.engines.at(-1).onnomatch();
  h.clock.advance(420);
  h.engines.at(-1).result("Galle");
  h.clock.advance(20);
  h.finishSpeech();
  for (let i = 0; i < 2; i++) {
    h.engines.at(-1).end();
    h.clock.advance(400);
  }
  assert.equal(h.session.getState().status, "listening");
  h.engines.at(-1).end();
  assert.equal(h.session.getState().status, "paused");
  h.session.dispose();
});

test("rapid pause and resume waits for the previous recognition to disconnect", () => {
  const h = harness();
  h.open();
  h.finishSpeech();
  h.session.toggle();
  assert.equal(h.session.getState().status, "paused");
  h.session.toggle();
  assert.equal(h.engines.length, 1);
  h.clock.advance(20);
  assert.equal(h.engines.length, 2);
  h.session.end();
  h.clock.advance(10000);
  assert.ok(h.engines.every((engine) => !engine.running));
  assert.equal(h.engines.length, 2);
  assert.equal(h.session.getState().conversationActive, false);
});

for (const stage of [
  "greeting",
  "restart",
  "listening",
  "processing",
  "response",
]) {
  test(`end/dispose during ${stage} invalidates pending audio and callbacks`, () => {
    for (const action of ["end", "dispose"]) {
      const h = harness();
      h.open();
      if (stage === "restart") h.synthesis.finish();
      if (["listening", "processing", "response"].includes(stage))
        h.finishSpeech();
      if (["processing", "response"].includes(stage))
        h.engines.at(-1).result("Galle");
      if (stage === "response") h.clock.advance(20);
      const lateEnd = h.utterances.at(-1).onend;
      h.session[action]();
      const starts = h.engines.length,
        speechCount = h.utterances.length;
      lateEnd?.();
      h.clock.advance(10000);
      assert.equal(h.session.getState().conversationActive, false);
      assert.equal(h.engines.length, starts);
      assert.equal(h.utterances.length, speechCount);
      assert.ok(h.engines.every((engine) => !engine.running));
      assert.equal(h.synthesis.speaking, false);
      assert.equal(h.clock.tasks.size, 0);
    }
  });
}

test("typing pauses audio, uses the same request handler, and remains available after End", () => {
  const h = harness();
  h.open();
  h.finishSpeech();
  h.session.beginTyping();
  h.session.submit("make it cheaper", "text");
  h.clock.advance(20);
  assert.deepEqual(h.requests.at(-1), {
    text: "make it cheaper",
    source: "text",
  });
  h.finishSpeech();
  assert.equal(h.session.getState().status, "paused");
  assert.equal(h.engines.length, 1);
  h.session.end();
  const spoken = h.utterances.length;
  h.session.submit("How much does it cost?", "text");
  h.clock.advance();
  assert.equal(h.requests.length, 2);
  assert.equal(h.session.getState().status, "result");
  assert.equal(h.utterances.length, spoken);
  h.session.speak("Read this answer");
  h.finishSpeech();
  assert.equal(
    h.engines.length,
    1,
    "explicit replay does not reactivate an ended session",
  );
});

for (const [error, reason] of [
  ["not-allowed", "denied"],
  ["audio-capture", "not-readable"],
  ["service-not-allowed", undefined],
]) {
  test(`${error} ends automatic listening and keeps text mode usable`, async () => {
    const h = harness();
    h.open();
    h.finishSpeech();
    h.engines.at(-1).error(error);
    h.clock.advance(10000);
    assert.equal(h.session.getState().status, "voice-error");
    assert.equal(h.session.getState().conversationActive, false);
    assert.deepEqual(h.failures, reason ? [reason] : []);
    assert.equal(h.engines.length, 1);
    h.session.submit("Take me to Kandy");
    h.clock.advance();
    assert.equal(h.requests.length, 1);
    await h.session.toggle();
    assert.equal(h.permissionRequests(), reason ? 1 : 0);
    assert.equal(h.engines.length, 2);
    h.session.dispose();
  });
}

for (const error of ["network", "aborted"]) {
  test(`${error} pauses without repeated automatic retries`, () => {
    const h = harness();
    h.open();
    h.finishSpeech();
    h.engines.at(-1).error(error);
    h.clock.advance(100000);
    assert.equal(h.session.getState().status, "paused");
    assert.equal(h.engines.length, 1);
    h.session.toggle();
    assert.equal(h.engines.length, 2);
    h.session.dispose();
  });
}

test("permission resolution after end or close cannot start audio", async () => {
  for (const action of ["end", "dispose"]) {
    let grant;
    const h = harness({
      permission: "denied",
      requestMicrophone: () =>
        new Promise((resolve) => {
          grant = resolve;
        }),
    });
    h.open();
    assert.equal(h.utterances.length, 0);
    const pending = h.session.toggle();
    assert.equal(h.session.getState().status, "requesting-permission");
    h.session[action]();
    const stateCount = h.states.length;
    grant("granted");
    await pending;
    h.clock.advance(10000);
    assert.equal(h.engines.length, 0);
    assert.equal(h.utterances.length, 0);
    assert.equal(h.states.length, stateCount);
  }
});

test("StrictMode-style setup and immediate cleanup cannot greet twice", () => {
  const first = harness();
  first.session.open();
  first.session.dispose();
  first.clock.advance();
  assert.equal(first.utterances.length, 0);
  const next = harness();
  next.open();
  assert.equal(next.utterances.length, 1);
  next.session.dispose();
});

test("speech errors and unavailable synthesis pause instead of starting recognition", () => {
  const h = harness();
  h.open();
  h.utterances[0].onerror({ error: "not-allowed" });
  h.clock.advance(10000);
  assert.equal(h.session.getState().status, "paused");
  assert.equal(h.engines.length, 0);
  const unsupported = harness({ Utterance: undefined });
  unsupported.open();
  assert.equal(unsupported.session.getState().status, "paused");
  assert.equal(unsupported.engines.length, 0);
});

test("unsupported recognition and synchronous start failures stop safely", () => {
  const unsupported = harness({ Recognition: undefined });
  unsupported.open();
  assert.equal(unsupported.session.getState().conversationActive, false);
  assert.equal(unsupported.session.getState().status, "voice-error");
  const failed = harness({
    startError: new DOMException("Denied", "NotAllowedError"),
  });
  failed.open();
  failed.finishSpeech();
  assert.equal(failed.session.getState().conversationActive, false);
  assert.deepEqual(failed.failures, ["denied"]);
  failed.clock.advance(10000);
  assert.equal(failed.engines.length, 1);
});

test("a stalled recognition stop cannot overlap audio or block typed requests", () => {
  const h = harness();
  h.open();
  h.finishSpeech();
  h.engines.at(-1).autoEnd = false;
  h.engines.at(-1).result("Galle");
  h.clock.advance(2100);
  assert.equal(h.session.getState().conversationActive, false);
  assert.equal(h.session.getState().status, "voice-error");
  assert.equal(h.utterances.length, 1);
  h.session.toggle();
  assert.equal(h.engines.length, 1);
  assert.equal(h.session.getState().conversationActive, false);
  h.session.submit("Take me to Kandy");
  h.clock.advance();
  assert.equal(h.requests.length, 2);
  assert.equal(h.session.getState().status, "result");
  h.session.dispose();
});

test("speech priming runs synchronously, muted, and leaves no queued welcome", () => {
  const calls = [];
  class Utterance {
    constructor(text) {
      this.text = text;
    }
  }
  primeSpeechSynthesis({
    Utterance,
    synthesis: {
      speak(speech) {
        assert.equal(speech.volume, 0);
        assert.equal(speech.text.trim(), "");
        calls.push("prime");
      },
      cancel() { calls.push("cancel"); },
    },
  });
  calls.push("permission request");
  assert.deepEqual(calls, ["cancel", "prime", "cancel", "permission request"]);
  assert.doesNotThrow(() => primeSpeechSynthesis({ synthesis: null, Utterance }));
  assert.doesNotThrow(() => primeSpeechSynthesis({
    Utterance,
    synthesis: { cancel() {}, speak() { throw new Error("Blocked"); } },
  }));
});

test("the first greeting waits for voiceschanged and speaks only once", () => {
  const h = harness({ voices: [] });
  h.open();
  assert.equal(h.utterances.length, 0);
  assert.equal(h.engines.length, 0);
  assert.equal(h.voiceListeners.size, 1);
  h.synthesis.voicesChanged();
  h.clock.advance(500);
  assert.equal(h.utterances.length, 0, "an empty event does not end the wait");
  h.synthesis.voices = [{ lang: "en-GB" }];
  h.synthesis.voicesChanged();
  assert.equal(h.utterances.length, 1);
  assert.equal(h.voiceListeners.size, 0);
  h.synthesis.voicesChanged();
  h.clock.advance(5000);
  assert.equal(h.utterances.length, 1);
  assert.equal(h.engines.length, 0, "a long greeting must finish before listening");
  assert.equal(h.session.getState().greetingRetryAvailable, false);
  h.finishSpeech();
  assert.equal(h.engines.length, 1);
  h.session.dispose();
});

test("empty or inaccessible voice lists time out and still use browser speech", () => {
  for (const voicesError of [false, true]) {
    const h = harness({ voices: [], voicesError });
    h.open();
    h.clock.advance(599);
    assert.equal(h.utterances.length, 0);
    h.clock.advance(1);
    assert.equal(h.utterances.length, 1);
    assert.equal(h.utterances[0].lang, "en-US");
    assert.equal(h.utterances[0].voice, undefined, "no named voice is required");
    assert.equal(h.voiceListeners.size, 0);
    h.finishSpeech();
    assert.equal(h.session.getState().status, "listening");
    h.session.dispose();
  }
});

test("ending, closing or typing cancels voice readiness and its late callbacks", () => {
  for (const action of ["end", "dispose", "beginTyping"]) {
    const h = harness({ voices: [] });
    h.open();
    const lateChanged = [...h.voiceListeners][0];
    h.session[action]();
    h.synthesis.voices = [{ lang: "en-US" }];
    lateChanged();
    h.clock.advance(10000);
    assert.equal(h.voiceListeners.size, 0);
    assert.equal(h.clock.tasks.size, 0);
    assert.equal(h.utterances.length, 0);
    assert.equal(h.engines.length, 0);
    assert.equal(h.session.getState().greetingRetryAvailable, false);
    h.session.dispose();
  }
});

test("a silently blocked greeting offers direct speech recovery without early listening", () => {
  const h = harness({ autoSpeechStart: false });
  h.open();
  const first = h.utterances[0];
  const lateStart = first.onstart;
  const lateEnd = first.onend;
  h.clock.advance(1999);
  assert.equal(h.session.getState().greetingRetryAvailable, false);
  h.clock.advance(1);
  assert.equal(h.session.getState().greetingRetryAvailable, true);
  assert.equal(h.session.getState().status, "paused");
  assert.match(h.session.getState().notice, /greeting couldn’t play/);
  assert.equal(h.engines.length, 0);
  assert.equal(h.synthesis.pending, false, "discard the blocked utterance");
  lateStart();
  lateEnd();
  h.clock.advance(200);
  assert.equal(h.engines.length, 0, "stale greeting callbacks cannot start listening");
  h.synthesis.voices = [];
  h.session.retryGreeting();
  assert.equal(h.utterances.length, 2, "retry must speak in the click, before any wait");
  assert.equal(h.utterances[1].text, voiceGreeting);
  assert.equal(h.voiceListeners.size, 0);
  assert.equal(h.session.getState().greetingRetryAvailable, false);
  h.session.retryGreeting();
  assert.equal(h.utterances.length, 2, "repeated clicks cannot duplicate the greeting");
  h.synthesis.start();
  h.clock.advance(5000);
  assert.equal(h.engines.length, 0);
  h.finishSpeech();
  assert.equal(h.engines.length, 1);
  assert.equal(h.session.getState().status, "listening");
  h.session.dispose();
});

test("greeting errors and an end event without start both offer recovery", () => {
  for (const outcome of ["error", "silent-end", "throw"]) {
    const h = harness({ autoSpeechStart: false, speechError: outcome === "throw" });
    h.open();
    if (outcome === "error") h.utterances[0].onerror({ error: "not-allowed" });
    if (outcome === "silent-end") h.synthesis.finish();
    h.clock.advance(5000);
    assert.equal(h.session.getState().greetingRetryAvailable, true);
    assert.equal(h.engines.length, 0);
    h.session.end();
    h.session.retryGreeting();
    assert.equal(h.session.getState().greetingRetryAvailable, false);
    assert.equal(h.engines.length, 0);
    h.session.dispose();
  }
});

test("manual microphone and text controls remain usable after a blocked greeting", () => {
  const mic = harness({ autoSpeechStart: false });
  mic.open();
  mic.clock.advance(2000);
  mic.session.toggle();
  assert.equal(mic.session.getState().status, "listening");
  assert.equal(mic.session.getState().greetingRetryAvailable, false);
  mic.session.dispose();

  const text = harness({ autoSpeechStart: false });
  text.open();
  text.clock.advance(2000);
  text.session.beginTyping();
  text.session.submit("Take me to Kandy", "text");
  text.clock.advance();
  assert.equal(text.requests[0].text, "Take me to Kandy");
  assert.equal(text.session.getState().greetingRetryAvailable, false);
  text.session.dispose();
});

test("microphone denial never attempts an automatic greeting or speech fallback", () => {
  const h = harness({ permission: "denied" });
  h.open();
  h.clock.advance(10000);
  assert.equal(h.utterances.length, 0);
  assert.equal(h.session.getState().greetingRetryAvailable, false);
  h.session.submit("Take me to Kandy");
  h.clock.advance();
  assert.equal(h.requests.length, 1);
  h.session.dispose();
});
