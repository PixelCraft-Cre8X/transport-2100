import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Layers, Minus, Navigation, Plus } from "lucide-react";
import { mapTowns } from "../data/network";
import { buildRouteMap, toPath } from "../utils/routeMap";
import useElementSize from "../utils/useElementSize";
import { ModeIcon } from "./UI";
import "./RouteMap.css";

const ZOOM_LEVELS = [0.7, 0.85, 1, 1.3, 1.7, 2.2];
const DEFAULT_ZOOM = 2;

function layout(w, h) {
  const narrow = w < 640;
  return {
    box: narrow
      ? { x0: 0.1 * w, x1: 0.66 * w, y0: 96, y1: h - 68 }
      : { x0: 0.36 * w, x1: 0.74 * w, y0: 0.24 * h, y1: 0.86 * h },
    // Room taken by the stats card, which place names must not slip under.
    blocked: [narrow ? { x0: 0, y0: 0, x1: w, y1: 78 } : { x0: 0, y0: 0, x1: 340, y1: 100 }],
  };
}

export default function JourneyMap({ from, to, segments, fullMapHref, children }) {
  const [ref, { w, h }] = useElementSize();
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM);
  const [showLabels, setShowLabels] = useState(true);
  const zoom = ZOOM_LEVELS[zoomIndex];
  const map = useMemo(
    () =>
      w && h
        ? buildRouteMap({ from, to, segments, w, h, zoom, towns: mapTowns, ...layout(w, h) })
        : null,
    [from, to, segments, w, h, zoom],
  );
  const steps = (delta) =>
    setZoomIndex((i) => Math.min(ZOOM_LEVELS.length - 1, Math.max(0, i + delta)));

  return (
    <div className="jm-map">
      <div className="jm-map-canvas" ref={ref}>
        {map && (
          <svg
            width={w}
            height={h}
            viewBox={`0 0 ${w} ${h}`}
            role="img"
            aria-label={`Route map from ${from.name} to ${to.name}`}
          >
            <defs>
              <linearGradient
                id="jm-route-gradient"
                gradientUnits="userSpaceOnUse"
                x1={map.start[0]}
                y1={map.start[1]}
                x2={map.end[0]}
                y2={map.end[1] + 0.01}
              >
                <stop offset="0" stopColor="#5eead4" />
                <stop offset="0.55" stopColor="#22d3ee" />
                <stop offset="1" stopColor="#818cf8" />
              </linearGradient>
              <linearGradient id="jm-land" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#123650" />
                <stop offset="1" stopColor="#0a2238" />
              </linearGradient>
              <pattern id="jm-dots" width="9" height="9" patternUnits="userSpaceOnUse">
                <circle cx="1.5" cy="1.5" r="0.8" fill="#4cc9e6" opacity="0.16" />
              </pattern>
              <filter
                id="jm-glow"
                filterUnits="userSpaceOnUse"
                x="0"
                y="0"
                width={w}
                height={h}
              >
                <feGaussianBlur stdDeviation="5" />
              </filter>
            </defs>

            <clipPath id="jm-land-clip">
              <path d={map.land} />
            </clipPath>
            <path className="rm-coast-glow" d={map.land} filter="url(#jm-glow)" />
            <path d={map.land} fill="url(#jm-land)" />
            <path d={map.land} fill="url(#jm-dots)" />
            <g clipPath="url(#jm-land-clip)">
              {[26, 62, 110].map((width) => (
                <path key={width} className="rm-contour" d={map.land} strokeWidth={width} />
              ))}
            </g>
            <path className="rm-coast" d={map.land} />

            {showLabels &&
              map.towns.map((town) => (
                <g key={town.name} className="rm-town">
                  <circle cx={town.xy[0]} cy={town.xy[1]} r="2.5" />
                  <text
                    x={town.xy[0] - (town.nearNode ? 34 : 12)}
                    y={town.xy[1] + 4}
                    textAnchor="end"
                  >
                    {town.name}
                  </text>
                </g>
              ))}

            <path className="jm-line-glow" d={map.line} filter="url(#jm-glow)" />
            {map.parts.map((part, i) => (
              <path
                key={`${part.mode}-${i}`}
                className={`jm-line ${part.mode}`}
                d={toPath(part.points)}
                stroke={part.mode === "walk" ? undefined : "url(#jm-route-gradient)"}
              />
            ))}

            {map.nodes.map((node, i) => (
              <g key={`${node.mode}-${i}`} className="jm-node">
                <circle className="halo" cx={node.mid[0]} cy={node.mid[1]} r="27" />
                <circle className="disc" cx={node.mid[0]} cy={node.mid[1]} r="19" />
                <ModeIcon
                  mode={node.mode}
                  size={20}
                  x={node.mid[0] - 10}
                  y={node.mid[1] - 10}
                />
              </g>
            ))}

            <g className="jm-endpoint start">
              <circle className="halo" cx={map.start[0]} cy={map.start[1]} r="14" />
              <circle className="dot" cx={map.start[0]} cy={map.start[1]} r="6" />
              <text x={map.start[0] + 22} y={map.start[1] + 5}>
                {from.name}
              </text>
            </g>
            <g className="jm-endpoint end">
              <circle className="halo" cx={map.end[0]} cy={map.end[1]} r="19" />
              <circle className="dot" cx={map.end[0]} cy={map.end[1]} r="7" />
              <text x={map.end[0] + 28} y={map.end[1] + 5}>
                {to.name}
              </text>
            </g>
          </svg>
        )}
      </div>

      {children}

      <div className="jm-controls" role="group" aria-label="Map controls">
        <button
          type="button"
          aria-label={showLabels ? "Hide place names" : "Show place names"}
          aria-pressed={showLabels}
          onClick={() => setShowLabels((v) => !v)}
        >
          <Layers size={17} />
        </button>
        <button
          type="button"
          aria-label="Zoom in"
          disabled={zoomIndex === ZOOM_LEVELS.length - 1}
          onClick={() => steps(1)}
        >
          <Plus size={17} />
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          disabled={zoomIndex === 0}
          onClick={() => steps(-1)}
        >
          <Minus size={17} />
        </button>
        <button
          type="button"
          aria-label="Reset map view"
          onClick={() => setZoomIndex(DEFAULT_ZOOM)}
        >
          <Navigation size={17} />
        </button>
      </div>

      <Link to={fullMapHref} className="jm-full-map">
        View full map <ArrowUpRight size={16} />
      </Link>
    </div>
  );
}
