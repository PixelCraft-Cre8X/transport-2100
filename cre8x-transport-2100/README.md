# LANKA / 2100

LANKA / 2100 is a frontend-only React + Vite concept for Cre8X 3.0 – The Oracle Challenge. It presents a connected Sri Lankan transportation ecosystem across three responsive screens:

- **Discover** (`/`) — futuristic hero, journey planner, mobility modes, Journey AI preview, and network pulse.
- **Your journey** (`/journey`) — six route styles, route comparison, route timeline, Smart Road intelligence, and accessibility badges.
- **Live tracking** (`/tracking`) — simulated route map, live progress card, transfer timeline, alerts, and network intelligence.

## Run locally

```bash
npm install
npm run dev
```

The production check is `npm run build`; linting is `npm run lint`.

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
