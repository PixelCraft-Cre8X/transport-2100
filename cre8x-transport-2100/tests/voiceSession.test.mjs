import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createVoiceSession,
  voiceGreeting,
} from "../src/utils/voiceSession.js";

class Clock {
  now = 0;
  next = 0;
  tasks = new Map();
  setTimeout(fn, delay = 0) {
    const id = ++this.next;
    this.tasks.set(id, { fn, at: this.now + delay });
    return id;
  }
  clearTimeout(id) {
    this.tasks.delete(id);
  }
  advance(ms = 0) {
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
  const synthesis = {
    speaking: false,
    pending: false,
    speak(utterance) {
      assert.ok(
        engines.every((engine) => !engine.running),
        "recognition ends before speech starts",
      );
      this.speaking = true;
      utterances.push(utterance);
    },
    cancel() {
      this.speaking = false;
    },
    finish() {
      this.speaking = false;
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
