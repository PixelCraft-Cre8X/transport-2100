import assert from "node:assert/strict";
import { test } from "node:test";
import {
  microphoneNotice,
  requestMicrophoneAccess,
} from "../src/utils/microphone.js";

test("requests audio immediately and releases every permission-check track", async () => {
  let requested = false;
  const stopped = [];
  const pending = requestMicrophoneAccess({
    isSecureContext: true,
    mediaDevices: {
      getUserMedia(constraints) {
        requested = true;
        assert.deepEqual(constraints, { audio: true });
        return Promise.resolve({
          getTracks: () => [
            { stop: () => stopped.push("first") },
            { stop: () => stopped.push("second") },
          ],
        });
      },
    },
  });
  assert.equal(requested, true, "keep the request inside the user gesture");
  assert.equal(await pending, "granted");
  assert.deepEqual(stopped, ["first", "second"]);
  assert.equal(microphoneNotice("granted"), "");
});

test("reports permission, device, policy and unknown failures with recovery advice", async () => {
  for (const [name, expected, advice] of [
    ["NotAllowedError", "denied", /Microphone to Allow/],
    ["NotFoundError", "not-found", /Connect or enable/],
    ["NotReadableError", "not-readable", /close other apps/],
    ["AbortError", "not-readable", /retry/],
    ["SecurityError", "blocked", /own tab/],
    ["UnexpectedError", "unavailable", /retry/],
  ]) {
    const status = await requestMicrophoneAccess({
      isSecureContext: true,
      mediaDevices: {
        getUserMedia: () => Promise.reject(new DOMException("Failed", name)),
      },
    });
    assert.equal(status, expected, name);
    assert.match(microphoneNotice(status), advice, name);
  }
});

test("a synchronous browser rejection preserves its cause", async () => {
  assert.equal(
    await requestMicrophoneAccess({
      isSecureContext: true,
      mediaDevices: {
        getUserMedia() {
          throw new DOMException("Denied", "NotAllowedError");
        },
      },
    }),
    "denied",
  );
});

test("insecure pages and unsupported browsers explain the required change", async () => {
  let requested = false;
  const insecure = await requestMicrophoneAccess({
    isSecureContext: false,
    mediaDevices: {
      getUserMedia() {
        requested = true;
      },
    },
  });
  assert.equal(requested, false);
  assert.equal(insecure, "insecure-context");
  assert.match(microphoneNotice(insecure), /localhost or HTTPS/);
  const unsupported = await requestMicrophoneAccess({
    isSecureContext: true,
    mediaDevices: {},
  });
  assert.equal(unsupported, "unsupported");
  assert.match(microphoneNotice(unsupported), /browser/);
});

test("retry recovers after permission changes and detects a disconnected device", async () => {
  let attempt = 0;
  let stopped = 0;
  const options = {
    isSecureContext: true,
    mediaDevices: {
      async getUserMedia() {
        attempt += 1;
        if (attempt === 1) throw new DOMException("Denied", "NotAllowedError");
        if (attempt === 3) throw new DOMException("Unplugged", "NotFoundError");
        return { getTracks: () => [{ stop: () => stopped++ }] };
      },
    },
  };
  assert.equal(await requestMicrophoneAccess(options), "denied");
  assert.equal(await requestMicrophoneAccess(options), "granted");
  assert.equal(stopped, 1);
  assert.equal(await requestMicrophoneAccess(options), "not-found");
  assert.equal(attempt, 3);
});
