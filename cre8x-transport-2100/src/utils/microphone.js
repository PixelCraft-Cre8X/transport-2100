const notices = {
  denied:
    "Microphone access was blocked. Open the site settings beside the address bar, set Microphone to Allow, then retry. If it is already allowed, check your computer's microphone privacy settings.",
  "not-found":
    "No microphone was found. Connect or enable a microphone, select it in your browser's microphone settings, then retry.",
  "not-readable":
    "Your microphone could not start. Check the selected input device and your computer's microphone permissions, close other apps using the microphone, then retry.",
  "insecure-context":
    "Microphone access needs a secure page. Open this app on localhost or HTTPS, then try again.",
  unsupported:
    "This browser cannot request microphone access. Try a current browser with voice support, such as Chrome, or type your request below.",
  blocked:
    "Microphone access is disabled for this page. Open the app directly in its own tab and check your browser's site permissions.",
  unavailable:
    "The microphone could not be opened. Check your browser's microphone settings and retry, or type your request below.",
};

export function microphoneNotice(status) {
  return notices[status] || "";
}

export function microphoneFailure(error) {
  switch (error?.name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return "denied";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "not-found";
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return "not-readable";
    case "SecurityError":
      return "blocked";
    default:
      return "unavailable";
  }
}

export async function requestMicrophoneAccess({
  isSecureContext = globalThis.isSecureContext,
  mediaDevices = globalThis.navigator?.mediaDevices,
} = {}) {
  if (isSecureContext === false) return "insecure-context";
  if (!mediaDevices?.getUserMedia) return "unsupported";

  try {
    // Start the permission request in the click handler, before the first await.
    const stream = await mediaDevices.getUserMedia({ audio: true });
    // Recognition opens its own stream; release this permission check's tracks.
    stream.getTracks().forEach((track) => track.stop());
    return "granted";
  } catch (error) {
    return microphoneFailure(error);
  }
}
