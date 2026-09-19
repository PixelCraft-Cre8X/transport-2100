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

The local catalogue contains 29 places. Newly added: Colombo, Moratuwa, Panadura, Beruwala, Bentota, Ambalangoda, Hikkaduwa, Matara, Hambantota, Rathnapura, Nuwara Eliya, Ella, Badulla, Kurunegala, Anuradhapura, Polonnaruwa, Jaffna, Trincomalee, Batticaloa, Negombo, and Katunayake. The existing Airport entry is now canonically Bandaranaike International Airport. Maharagama, Galle, Colombo Fort, Kandy, Port City, Makumbura, and Kalutara remain available.

Aliases include Fort, Colombo Fort Station, Airport, BIA, Katunayake Airport, Colombo Airport, Ratnapura, Nuwaraeliya, and Trinco. Minor spelling mistakes such as Anuradapura are tolerated conservatively. Ambiguous matches ask for clarification; unknown places never silently reuse the previous destination.

Implementation files:

- `src/data/network.js`: canonical locations and aliases. Added town coordinates use [GeoNames](https://download.geonames.org/export/dump/) (CC BY 4.0), rounded where appropriate. Airport coordinates use [Sri Lanka AIP VCBI AD 2.2](https://www.airport.lk/aasl/AIS/AMDT%20WEB/AIP%20FROM%2019%20NOV%202023/htm/37.htm).
- `src/utils/locationResolver.js`: exact names, aliases, conservative fuzzy matching, and ambiguous results.
- `src/utils/journeyIntent.js`: language parsing and preference updates.
- `src/utils/journeyConversation.js`: modal conversation state, follow-up questions, and alternatives.
- `src/utils/journeyAI.js`: deterministic filtering/ranking and responses using actual generated route objects.
- `src/utils/locationGeocoding.js`: optional, isolated [Mapbox v6](https://docs.mapbox.com/api/search/geocoding/) helper using the public `VITE_MAPBOX_ACCESS_TOKEN`, restricted to Sri Lankan places/localities/districts. It returns an empty result on missing configuration or failure. It is not called by the current planner.
- `src/data/journeys.js`: compatibility for aliases in existing journey URLs, including `to=Airport`; the route generator is unchanged.
- `src/components/JourneyAIPreview.jsx`: connects voice/text submissions to conversation state. Existing permission, greeting, recognition, synthesis, route navigation, and keyboard behavior remain in place.
- `src/pages/Home.jsx`: the airport shortcut uses the canonical name so the destination editor stays consistent.
- `tests/journeyAI.test.mjs`: destination, language, conversation, constraint, geocoding-failure and route/navigation regression tests.

### Checks and manual phrases

```bash
node --test tests/*.test.mjs
npm run build
npm run lint
```

Try these separately by voice or text:

- "I want to go to Rathnapura."
- "I want to go Rathnapura."
- "Rathnapura please."
- "Take me from Colombo to Rathnapura."
- "Give me the fastest way to Matara."
- "I want to visit Nuwara Eliya but I can't walk much."
- "I'm travelling with my grandmother to Kandy."
- "Take me to Jaffna as cheaply as possible."
- "Get me to the airport without an air taxi."
- "Take me to Galle, no bus please."

Keep the modal open and try this sequence:

1. "Take me to Rathnapura."
2. "Fastest."
3. "No air taxi."
4. "Make it cheaper."
5. "How long will it take?"
6. "How much does it cost?"
7. "What about Kandy instead?"
8. "Start from Colombo."
9. "Do you have another option?"
10. "What's the next fastest?"

Also ask "How many transfers?", "How much walking?", "Which transport will I use?", "Is it step free?", and "Why did you choose this?". Questions should retain the selected route. "Is there a cheaper one?" only claims savings when the generated fare is actually lower. "Allow bus and rail" removes those exclusions explicitly.

For clarification, try "I need a journey." followed by "Rathnapura."; "Take me to Atlantis" followed by "Matara"; or "Take me to Colombo Fort or Port City" followed by "Port City". Check View journey and Start tracking retain the recommendation's places, route and walking setting. Deny microphone access to check the text fallback.

### Microphone troubleshooting

Open the app on `http://localhost:5173` during development, or HTTPS when deployed. An HTTP address on another computer (for example, a LAN IP address) does not provide secure microphone access.

If Journey AI reports blocked access in Chrome:

1. Click the site controls beside the address bar, open **Site settings**, and set **Microphone** to **Allow**.
2. On Windows 11, open **Settings > Privacy & security > Microphone**. Enable **Microphone access**, **Let apps access your microphone**, and **Let desktop apps access your microphone**.
3. Open `chrome://settings/content/microphone`, select the correct input device, and check that sites can ask to use it.
4. Reload the app, open Journey AI, allow access if prompted, then tap the microphone after the greeting.

If no device is found, connect or enable a microphone. If the device cannot start, check the input device and close other apps that may be using it. Journey AI preserves the browser's failure category and checks again on reopening or retrying; the website cannot override browser or Windows privacy settings. A speech recognition connection error is separate from microphone access and requires checking the internet connection or the browser's recognition service. Typed requests remain available.

See [Chrome microphone help](https://support.google.com/chrome/answer/2693767) and [Windows microphone permissions](https://support.microsoft.com/en-us/windows/privacy/turn-on-app-permissions-for-your-microphone-in-windows).

### Limits

Language understanding uses local English phrase rules, not an unrestricted language model. Planning currently covers the local catalogue; optional geocoding does not add transport availability. All services, fares, timings and paths are generated for the Sri Lanka 2100 demo, not live transport data. Comfort and Eco use existing route metadata; crowd levels, seat availability, emissions measurements and vehicle accessibility equipment are not inferred. Walking paths marked step-free do not establish accessibility of vehicle boarding. Actual speech recognition and voices depend on the browser; automated browser checks use controlled speech events and a synthetic microphone device.
