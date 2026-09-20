# moveone

moveone is a frontend-only React + Vite concept for Cre8X 3.0 – The Oracle Challenge. It presents a connected Sri Lankan transportation ecosystem across three responsive screens:

- **Discover** (`/`) — futuristic hero, journey planner, mobility modes, Journey AI preview, and network pulse.
- **Your journey** (`/journey`) — six route styles, route comparison, route timeline, Smart Road intelligence, and accessibility badges.
- **Live tracking** (`/tracking`) — simulated route map, live progress card, transfer timeline, alerts, and network intelligence.

## Run locally

```bash
npm install
npm run dev
```

The production check is `npm run build`; linting is `npm run lint`.

To preview on a phone, connect it to the same Wi-Fi as the computer and open the **Network** URL printed by Vite. The development server listens on port `5173` on the network; keep its terminal running. If that port is already in use, stop the earlier server before running `npm run dev` again. Mobile microphone testing requires trusted HTTPS; the local HTTP network URL supports layout and typed-request testing.

## Assets and map setup

Hero artwork is loaded from the existing PNG assets in `src/assets/`. To replace it later, add `src/assets/images/hero-colombo-2100-desktop.jpg` and `src/assets/images/hero-colombo-2100-mobile.jpg`; `src/pages/Home.jsx` contains the replacement comments and fallback behavior.

The map surface is deliberately useful without credentials: it renders a polished simulated map and route overlays. To connect Mapbox later, create a `.env` file with:

```bash
VITE_MAPBOX_ACCESS_TOKEN=your_token_here
```

`src/components/MapPanel.jsx` is the integration point for a Mapbox instance and route layers. Current location, fares, vehicle positions, and network statuses are realistic dummy data for concept review.

## Structure

- `src/data/` — locations, modes, route options, map geometry, alerts, and journey calculations.
- `src/components/` — layout, planner, route timeline, map, and reusable UI pieces.
- `src/pages/` — Home, Journey, and Tracking screens.

## Journey AI conversations

The existing voice interface accepts spoken requests automatically and also supports typed requests. Conversation memory lasts while the modal is open; reopening it starts from the current Journey/Tracking selection or the default origin, Maharagama. Destination and origin changes retain walking preferences and transport exclusions.

After opening Journey AI and allowing the microphone, the assistant says “ Hi,I’m Journey AI. Where would you like to go?” and automatically listens when the greeting ends. Each final spoken request is processed and answered, then listening resumes after the answer finishes. Recognition uses one non-continuous turn at a time and is fully disconnected before speech synthesis starts.

Tap the microphone to pause or resume. Three consecutive silent or unrecognized turns pause quietly after two retries; valid speech resets the counter. Network errors pause for a manual retry, while permission/device/service failures stop automatic listening and show recovery instructions. **End conversation** stops voice without closing the dialog; typing still works, and **Hear again** explicitly reads an answer without restarting an ended session. Selecting the text field pauses listening so voice cannot interrupt typing; tap the microphone to return to hands-free use. Closing or navigating away cancels audio, pending work and restarts.

The microphone grant is held only in memory for the current app session and is reused on reopening. Recognition permission/capture errors invalidate it. Browser settings still control actual permission; no permission is stored in localStorage and there is no wake-word or background listening.

Journey AI plans trips between the eight destinations with dedicated photos: Maharagama, Galle, Colombo Fort, Kandy, Bandaranaike International Airport, Port City, Makumbura, and Kalutara. Its available destinations are derived from the `image` fields in `src/data/network.js`. The wider 29-place catalogue remains available to the existing map and journey features. Journey AI asks for an available starting point or destination when a request or existing page selection uses a place outside its current list.

Journey AI accepts aliases including Fort, Colombo Fort Station, Airport, BIA, Katunayake Airport, and Colombo Airport. Minor spelling mistakes such as Makumbra and Kaluthara are tolerated conservatively. Names, aliases, and spelling corrections for places without photos do not create Journey AI routes. Ambiguous matches ask for clarification; unavailable or unknown places never silently reuse the previous destination.

Implementation files:

- `src/data/network.js`: canonical locations and aliases. Added town coordinates use [GeoNames](https://download.geonames.org/export/dump/) (CC BY 4.0), rounded where appropriate. Airport coordinates use [Sri Lanka AIP VCBI AD 2.2](https://www.airport.lk/aasl/AIS/AMDT%20WEB/AIP%20FROM%2019%20NOV%202023/htm/37.htm).
- `src/utils/locationResolver.js`: exact names, aliases, conservative fuzzy matching, and ambiguous results.
- `src/utils/journeyDestinations.js`: the photo-based Journey AI destination list and availability responses; the wider location resolver remains shared with the rest of the app.
- `src/utils/journeyIntent.js`: language parsing and preference updates.
- `src/utils/journeyConversation.js`: modal conversation state, follow-up questions, and alternatives.
- `src/utils/journeyAI.js`: deterministic filtering/ranking and responses using actual generated route objects.
- `src/utils/locationGeocoding.js`: optional, isolated [Mapbox v6](https://docs.mapbox.com/api/search/geocoding/) helper using the public `VITE_MAPBOX_ACCESS_TOKEN`, restricted to Sri Lankan places/localities/districts. It returns an empty result on missing configuration or failure. It is not called by the current planner.
- `src/data/journeys.js`: compatibility for aliases in existing journey URLs, including `to=Airport`; the route generator is unchanged.
- `src/components/JourneyAIPreview.jsx`: connects voice/text submissions to conversation state. Existing permission, greeting, recognition, synthesis, route navigation, and keyboard behavior remain in place.
- `src/utils/voiceSession.js`: voice lifecycle, audio exclusion, bounded silence retries, pause/resume/end, and cleanup; contains no journey parsing or ranking.
- `src/utils/speechSynthesis.js`: synchronous Safari speech priming, cancellable voice readiness, and development-only audio diagnostics.
- `src/pages/Home.jsx`: the airport shortcut uses the canonical name so the destination editor stays consistent.
- `tests/journeyAI.test.mjs`: destination, language, conversation, constraint, geocoding-failure and route/navigation regression tests.
- `tests/voiceSession.test.mjs`: controlled audio events and timers covering automatic turns, duplicate callbacks, silence, errors, typing, cancellation and cleanup.

### Checks and manual phrases

```bash
node --test tests/*.test.mjs
npm run build
npm run lint
```

Try these separately by voice or text:

- "I want to go to Galle."
- "I want to go Galle."
- "Galle please."
- "Take me from Colombo Fort to Galle."
- "Give me the fastest way to Kalutara."
- "I want to visit Port City but I can't walk much."
- "I'm travelling with my grandmother to Kandy."
- "Take me to Makumbura as cheaply as possible."
- "Get me to the airport without an air taxi."
- "Take me to Galle, no bus please."

Keep the modal open and try this sequence:

1. "Take me to Galle."
2. "Fastest."
3. "No air taxi."
4. "Make it cheaper."
5. "How long will it take?"
6. "How much does it cost?"
7. "What about Kandy instead?"
8. "Start from Colombo Fort."
9. "Do you have another option?"
10. "What's the next fastest?"

Also ask "How many transfers?", "How much walking?", "Which transport will I use?", "Is it step free?", and "Why did you choose this?". Questions should retain the selected route. "Is there a cheaper one?" only claims savings when the generated fare is actually lower. "Allow bus and rail" removes those exclusions explicitly.

For clarification, try "I need a journey." followed by "Galle."; "Take me to Atlantis" followed by "Kalutara"; or "Take me to Colombo Fort or Port City" followed by "Port City". Check View journey and Start tracking retain the recommendation's places, route and walking setting. Deny microphone access to check the text fallback.

For the hands-free check, open Journey AI and allow access, wait for the greeting to finish, then say “I want to go to Galle.”, “Make it fastest.”, “Don't use air taxi.” and “How much will it cost?” after each reply. The destination must stay Galle and the cost must match the current route. Do not press the microphone between turns. Wait for three silent turns, confirm it pauses, tap once to resume, then end and close the conversation. Verify no audio restarts. Reopen to check grant reuse; test voice followed by typed “make it cheaper” to check shared context.

### Microphone troubleshooting

#### Safari first-open speech

Journey AI primes speech synthesis synchronously in the opening click, before microphone permission is requested. A muted placeholder is immediately cancelled, so it does not duplicate the greeting. The temporary permission stream still stops every track before the dialog opens; recognition owns the conversation microphone.

The automatic greeting checks `getVoices()` and, if needed, waits for `voiceschanged` for up to 600 ms. It still attempts browser-selected English speech when no voice list appears. Initial startup uses a cancellable microtask instead of a zero-delay timer, preserving React StrictMode cleanup. Recognition begins only after the greeting reports both `onstart` and `onend`, followed by the existing 200 ms audio gap.

If the greeting errors, ends without starting, or does not start within two seconds of `speak()`, the session pauses with a non-blocking **Tap to hear Journey AI** button. That button speaks directly in its click handler, then resumes listening after the greeting ends. The microphone and typed input remain usable. Closing, ending, typing or starting another request cancels pending voice readiness and greeting checks. The button is absent when automatic speech succeeds.

Development builds log concise `[JourneyAI]` events for the opening gesture and activation, permission resolution, priming, voice count, greeting attempt, utterance start/end/error, and recognition start. These diagnostics contain no passenger requests and are omitted from production builds.

Device verification requires a real first permission flow on the HTTPS deployment: reset the site's microphone permission (or use a fresh origin), reload, open Journey AI, and allow access. Confirm one audible greeting, then listening and a spoken request. Close and reopen to confirm that the session grant is reused and the greeting still plays. Also check denial with typed input, a previously granted permission, and the recovery button if playback is blocked. Repeat normal voice turns on Chrome/Android and desktop Chrome/Edge. Automated tests simulate browser events; they do not verify audible iPhone playback.

This workaround follows [WebKit's user-gesture restriction for speech](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/Modules/speech/SpeechSynthesis.cpp) and the [`voiceschanged` lifecycle](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis/voiceschanged_event).

#### Browser permission settings

Open the app on `http://localhost:5173` during development, or HTTPS when deployed. An HTTP address on another computer (for example, a LAN IP address) does not provide secure microphone access.

If Journey AI reports blocked access in Chrome:

1. Click the site controls beside the address bar, open **Site settings**, and set **Microphone** to **Allow**.
2. On Windows 11, open **Settings > Privacy & security > Microphone**. Enable **Microphone access**, **Let apps access your microphone**, and **Let desktop apps access your microphone**.
3. Open `chrome://settings/content/microphone`, select the correct input device, and check that sites can ask to use it.
4. Reload the app, open Journey AI and allow access if prompted. Listening starts automatically after the greeting; tap the microphone only to resume from a paused state.

If no device is found, connect or enable a microphone. If the device cannot start, check the input device and close other apps that may be using it. Journey AI preserves the browser's failure category and requests access again when retrying a microphone failure; successful access is reused on reopening. The website cannot override browser or Windows privacy settings. A speech recognition connection error is separate from microphone access and requires checking the internet connection or the browser's recognition service. Typed requests remain available.

Hands-free recognition still requires localhost or trusted HTTPS, microphone permission, and a browser supporting the Web Speech API. Some browsers may require another explicit tap or block automatic speech/recognition; the interface then pauses or falls back to text. Chrome commonly uses an online recognition service, so network availability matters. See [SpeechRecognition browser limitations](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition).

See [Chrome microphone help](https://support.google.com/chrome/answer/2693767) and [Windows microphone permissions](https://support.microsoft.com/en-us/windows/privacy/turn-on-app-permissions-for-your-microphone-in-windows).

### Limits

Language understanding uses local English phrase rules, not an unrestricted language model. Journey AI planning currently covers the eight destinations with dedicated photos; optional geocoding does not add transport availability. All services, fares, timings and paths are generated for the Sri Lanka 2100 demo, not live transport data. Comfort and Eco use existing route metadata; crowd levels, seat availability, emissions measurements and vehicle accessibility equipment are not inferred. Walking paths marked step-free do not establish accessibility of vehicle boarding. Actual speech recognition and voices depend on the browser; automated checks simulate speech and microphone events. Verify actual audio on a supported device.
