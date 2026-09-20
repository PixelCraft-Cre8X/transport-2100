import { useMemo, useState } from "react";
import {
  Accessibility,
  Building2,
  BusFront,
  ChevronDown,
  Leaf,
  LocateFixed,
  MapPin,
  Minus,
  Navigation,
  Plus,
  TrafficCone,
} from "lucide-react";
import { trackingTowns } from "../data/network";
import { buildRouteMap, toPath } from "../utils/routeMap";
import useElementSize from "../utils/useElementSize";
import { useMapGestures, useMapView } from "../utils/useMapView";
import useMediaQuery from "../utils/useMediaQuery";
import DestinationArt from "./DestinationArt";
import Switch from "./Switch";
import { ModeIcon } from "./UI";
import "./RouteMap.css";

const PANEL_WIDTH = 256;

const MODE_LABELS = {
  walk: "Walk",
  bus: "Smart Bus",
  rail: "SkyRail",
  air: "Air Taxi",
};

const LAYERS = [
  { id: "stations", label: "Stations & Stops", icon: MapPin },
  { id: "traffic", label: "Traffic", icon: TrafficCone },
  { id: "vehicles", label: "Live Vehicles", icon: BusFront },
  { id: "access", label: "Accessibility", icon: Accessibility },
  { id: "hubs", label: "Transit Hubs", icon: Building2 },
];

function layout(w, h, overlay) {
  if (overlay) {
    return {
      box: { x0: 0.34 * w, x1: 0.58 * w, y0: 0.11 * h, y1: 0.85 * h },
      blocked: [{ x0: 0, y0: 0, x1: PANEL_WIDTH, y1: h }],
      callout: { width: 176, height: 46, dx: 30 },
    };
  }
  if (w >= 560) {
    return {
      box: { x0: 0.16 * w, x1: 0.5 * w, y0: 0.1 * h, y1: 0.86 * h },
      blocked: [],
      callout: { width: 176, height: 46, dx: 30 },
    };
  }
  return {
    box: { x0: 0.06 * w, x1: 0.5 * w, y0: 0.08 * h, y1: 0.78 * h },
    blocked: [],
    callout: {
      width: Math.round(Math.min(144, w * 0.44)),
      height: 44,
      dx: 24,
      kinds: ["start", "ride", "end"],
    },
  };
}

const shortName = (segment) => segment.name.split(" · ")[0];

function Callout({
  item,
  current,
  minutesToNext,
  from,
  to,
  arrival,
  layers,
  narrow,
}) {
  const { kind, segment, rect } = item;
  let title;
  let sub;
  let tone = "";
  if (kind === "start") {
    title = from.name;
    sub = `Start · ${segment.time}`;
  } else if (kind === "end") {
    title = to.name;
    sub = `Arrive · ${arrival}`;
  } else if (kind === "transfer") {
    title = item.previous.stop;
    sub = `Transfer · ${segment.time}`;
  } else {
    title = shortName(segment);
    tone = current ? "live" : "ok";
    sub = current ? `${minutesToNext} min to next stop` : segment.status;
  }
  return (
    <div
      className={`tk-callout ${kind} ${tone}`}
      style={{
        left: rect.x0,
        top: rect.y0,
        width: rect.x1 - rect.x0,
        minHeight: rect.y1 - rect.y0,
      }}
      hidden={
        (kind === "ride" && !layers.vehicles) ||
        (kind === "transfer" && !layers.stations) ||
        ((kind === "start" || kind === "end") && !layers.hubs)
      }
    >
      <span>
        <strong>{title}</strong>
        <small>{sub}</small>
      </span>
      {kind === "end" && !narrow && (
        <span className="tk-thumb">
          <DestinationArt src={to.image} alt={`${to.name} destination`} />
        </span>
      )}
    </div>
  );
}

export default function TrackingMap({
  from,
  to,
  segments,
  progress,
  currentIndex,
  minutesToNext,
  arrival,
  emissionsSaved,
}) {
  const overlay = useMediaQuery("(min-width: 1320px)");
  const [ref, { w, h }] = useElementSize();
  const [follow, setFollow] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const {
    view,
    zoomBy,
    panBy,
    reset,
    recentre,
    zoomIn,
    zoomOut,
    canZoomIn,
    canZoomOut,
  } = useMapView();
  useMapGestures(ref, { onZoom: zoomBy, onPan: panBy });
  const [layers, setLayers] = useState({
    stations: true,
    traffic: true,
    vehicles: true,
    access: false,
    hubs: true,
  });
  const map = useMemo(() => {
    if (!w || !h) return null;
    return buildRouteMap({
      from,
      to,
      segments,
      w,
      h,
      zoom: view.zoom,
      pan: [view.x, view.y],
      progress,
      follow,
      towns: trackingTowns,
      ...layout(w, h, overlay),
    });
  }, [from, to, segments, w, h, view, progress, follow, overlay]);

  const modes = segments
    .map((s) => s.mode)
    .filter((mode, i, all) => all.indexOf(mode) === i);
  const toggleFollow = () => {
    recentre();
    setFollow((value) => !value);
  };
  const resetView = () => {
    reset();
    setFollow(false);
  };
  const currentMode = segments[currentIndex]?.mode;

  return (
    <section className="tk-map" aria-label="Live route map">
      <div className="tk-stage rm-interactive" ref={ref}>
        {map && (
          <svg
            width={w}
            height={h}
            viewBox={`0 0 ${w} ${h}`}
            role="img"
            aria-label={`Live map of the journey from ${from.name} to ${to.name}`}
          >
            <defs>
              <linearGradient id="tk-land" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#123650" />
                <stop offset="1" stopColor="#0a2238" />
              </linearGradient>
              <pattern
                id="tk-dots"
                width="9"
                height="9"
                patternUnits="userSpaceOnUse"
              >
                <circle
                  cx="1.5"
                  cy="1.5"
                  r="0.8"
                  fill="#4cc9e6"
                  opacity="0.16"
                />
              </pattern>
              <filter
                id="tk-glow"
                filterUnits="userSpaceOnUse"
                x="0"
                y="0"
                width={w}
                height={h}
              >
                <feGaussianBlur stdDeviation="5" />
              </filter>
              <clipPath id="tk-land-clip">
                <path d={map.land} />
              </clipPath>
            </defs>

            <path
              className="rm-coast-glow"
              d={map.land}
              filter="url(#tk-glow)"
            />
            <path d={map.land} fill="url(#tk-land)" />
            <path d={map.land} fill="url(#tk-dots)" />
            <g clipPath="url(#tk-land-clip)">
              {[26, 62, 110].map((width) => (
                <path
                  key={width}
                  className="rm-contour"
                  d={map.land}
                  strokeWidth={width}
                />
              ))}
            </g>
            <path className="rm-coast" d={map.land} />
            {w >= 560 && (
              <text
                className="tk-island-name"
                x={w * 0.85}
                y={h * 0.6}
                textAnchor="middle"
              >
                SRI LANKA
              </text>
            )}

            {layers.stations &&
              map.towns.map((town) => {
                const right = town.side === "right";
                const offset = town.nearNode && !right ? 34 : 12;
                return (
                  <g key={town.name} className="rm-town">
                    <circle cx={town.xy[0]} cy={town.xy[1]} r="2.5" />
                    <text
                      x={town.xy[0] + (right ? offset : -offset)}
                      y={town.xy[1] + 4}
                      textAnchor={right ? "start" : "end"}
                    >
                      {town.name}
                    </text>
                  </g>
                );
              })}

            {layers.traffic && <path className="tk-traffic" d={map.line} />}
            {map.parts.map((part, i) => (
              <g key={`${part.mode}-${i}`} className={`tk-leg ${part.mode}`}>
                <path
                  className="glow"
                  d={toPath(part.points)}
                  filter="url(#tk-glow)"
                />
                <path className="line" d={toPath(part.points)} />
              </g>
            ))}

            {layers.stations &&
              map.callouts
                .filter((c) => c.kind === "transfer")
                .map((c) => (
                  <g
                    key={`transfer-${c.segment.start}`}
                    className="tk-transfer"
                  >
                    <circle cx={c.xy[0]} cy={c.xy[1]} r="14" />
                    <circle className="dot" cx={c.xy[0]} cy={c.xy[1]} r="5" />
                  </g>
                ))}

            {layers.hubs && (
              <>
                <g className="tk-start">
                  <circle
                    className="halo"
                    cx={map.start[0]}
                    cy={map.start[1]}
                    r="15"
                  />
                  <circle
                    className="dot"
                    cx={map.start[0]}
                    cy={map.start[1]}
                    r="7"
                  />
                </g>
                <MapPin
                  className="tk-end-pin"
                  size={32}
                  x={map.end[0] - 16}
                  y={map.end[1] - 31}
                  fill="#f43f5e"
                  strokeWidth={1.6}
                />
              </>
            )}

            {layers.access &&
              [map.start, map.end].map((xy, i) => (
                <g key={i} className="tk-access">
                  <circle cx={xy[0] - 22} cy={xy[1] - 22} r="11" />
                  <Accessibility size={14} x={xy[0] - 29} y={xy[1] - 29} />
                </g>
              ))}

            {layers.vehicles &&
              map.nodes.map((node) => {
                const isCurrent = node.start === segments[currentIndex]?.start;
                return (
                  <g
                    key={`node-${node.start}`}
                    className={`tk-node ${node.mode} ${isCurrent ? "current" : ""}`}
                  >
                    {isCurrent && (
                      <circle
                        className="halo"
                        cx={node.mid[0]}
                        cy={node.mid[1]}
                        r="31"
                      />
                    )}
                    <circle
                      className="disc"
                      cx={node.mid[0]}
                      cy={node.mid[1]}
                      r="20"
                    />
                    <ModeIcon
                      mode={node.mode}
                      size={20}
                      x={node.mid[0] - 10}
                      y={node.mid[1] - 10}
                    />
                  </g>
                );
              })}

            {layers.vehicles && map.vehicle && (
              <g className={`tk-vehicle ${currentMode || ""}`}>
                <circle
                  className="pulse"
                  cx={map.vehicle[0]}
                  cy={map.vehicle[1]}
                  r="9"
                />
                <circle
                  className="core"
                  cx={map.vehicle[0]}
                  cy={map.vehicle[1]}
                  r="6"
                />
              </g>
            )}
          </svg>
        )}

        {map &&
          map.callouts.map((item) => (
            <Callout
              key={`${item.kind}-${item.segment.start}`}
              item={item}
              current={item.segment.start === segments[currentIndex]?.start}
              minutesToNext={minutesToNext}
              from={from}
              to={to}
              arrival={arrival}
              layers={layers}
              narrow={w < 560}
            />
          ))}

        <div className="tk-zoom" role="group" aria-label="Map controls">
          <button
            type="button"
            aria-label="Zoom in"
            disabled={!canZoomIn}
            onClick={zoomIn}
          >
            <Plus size={18} />
          </button>
          <button
            type="button"
            aria-label="Zoom out"
            disabled={!canZoomOut}
            onClick={zoomOut}
          >
            <Minus size={18} />
          </button>
          <button
            type="button"
            aria-label="Follow vehicle"
            aria-pressed={follow}
            onClick={toggleFollow}
          >
            <Navigation size={18} />
          </button>
        </div>

        <button type="button" className="tk-recentre" onClick={resetView}>
          <LocateFixed size={18} /> Re-centre
        </button>
      </div>

      <div className="tk-panels">
        <div className="tk-side-card">
          <h2>Your Journey</h2>
          <ul className="tk-legend">
            {modes.map((mode) => (
              <li key={mode} className={mode}>
                <span className="tk-legend-icon">
                  <ModeIcon mode={mode} size={16} />
                </span>
                <i aria-hidden="true" />
                {MODE_LABELS[mode] || mode}
              </li>
            ))}
          </ul>
        </div>
        <div className="tk-side-card tk-layers-card">
          {overlay ? (
            <h2>Map Layers</h2>
          ) : (
            <button
              type="button"
              className="tk-layers-toggle"
              aria-expanded={layersOpen}
              aria-controls="tk-layers-list"
              onClick={() => setLayersOpen((open) => !open)}
            >
              <span>Map Layers</span>
              <ChevronDown size={18} />
            </button>
          )}
          {(overlay || layersOpen) && (
            <ul className="tk-layers" id="tk-layers-list">
              {LAYERS.map(({ id, label, icon: Icon }) => (
                <li key={id}>
                  <span className="tk-layer-icon">
                    <Icon size={15} />
                  </span>
                  <span id={`tk-layer-${id}`}>{label}</span>
                  <Switch
                    small
                    checked={layers[id]}
                    labelledBy={`tk-layer-${id}`}
                    onChange={(on) =>
                      setLayers((current) => ({ ...current, [id]: on }))
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="tk-side-card tk-green">
          <span className="tk-green-icon">
            <Leaf size={30} />
          </span>
          <div>
            <strong>Greener travel</strong>
            <span>~ {emissionsSaved}% lower emissions</span>
            <small>compared to car travel.</small>
          </div>
        </div>
      </div>
    </section>
  );
}
