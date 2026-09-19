import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Layers, Minus, Navigation, Plus } from "lucide-react";
import { routeWaypoints } from "../data/journeys";
import { islandOutline, mapTowns } from "../data/network";
import { ModeIcon } from "./UI";

const ZOOM_LEVELS = [0.7, 0.85, 1, 1.3, 1.7, 2.2];
const DEFAULT_ZOOM = 2;
const LON_SCALE = Math.cos((6.5 * Math.PI) / 180);
const SAMPLES_PER_SPAN = 12;

function useElementSize() {
  const ref = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const observer = new ResizeObserver(() =>
      setSize({ w: el.clientWidth, h: el.clientHeight }),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, size];
}

// Uniform Catmull-Rom spline through `points`, sampled into a dense polyline.
function smooth(points) {
  if (points.length < 3) return points;
  const out = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    for (let s = 0; s < SAMPLES_PER_SPAN; s += 1) {
      const t = s / SAMPLES_PER_SPAN;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push(
        [0, 1].map(
          (k) =>
            0.5 *
            (2 * p1[k] +
              (p2[k] - p0[k]) * t +
              (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 +
              (3 * p1[k] - p0[k] - 3 * p2[k] + p3[k]) * t3),
        ),
      );
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

const toPath = (points, close = false) =>
  `${points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("")}${close ? "Z" : ""}`;

function measure(points) {
  const lengths = [0];
  for (let i = 1; i < points.length; i += 1) {
    lengths.push(
      lengths[i - 1] +
        Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]),
    );
  }
  return lengths;
}

function pointAt(points, lengths, fraction) {
  const target = fraction * lengths[lengths.length - 1];
  let i = 1;
  while (i < lengths.length - 1 && lengths[i] < target) i += 1;
  const span = lengths[i] - lengths[i - 1] || 1;
  const t = (target - lengths[i - 1]) / span;
  return [
    points[i - 1][0] + (points[i][0] - points[i - 1][0]) * t,
    points[i - 1][1] + (points[i][1] - points[i - 1][1]) * t,
  ];
}

function slice(points, lengths, from, to) {
  const inner = points.filter((_, i) => {
    const f = lengths[i] / lengths[lengths.length - 1];
    return f > from && f < to;
  });
  return [pointAt(points, lengths, from), ...inner, pointAt(points, lengths, to)];
}

function buildGeometry({ from, to, segments, w, h, zoom }) {
  const direct = segments.some((s) => s.mode === "air");
  let geo = routeWaypoints(from, to, { direct });
  if (direct) {
    // Air taxis fly a gentle arc rather than following the coast.
    const [a, b] = geo;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const bulge = dy < 0 ? 0.12 : -0.12;
    geo = [a, [(a[0] + b[0]) / 2 - dy * bulge, (a[1] + b[1]) / 2 + dx * bulge], b];
  }

  const lons = geo.map((p) => p[0]);
  const lats = geo.map((p) => p[1]);
  const lonSpan = Math.max(Math.max(...lons) - Math.min(...lons), 1e-4);
  const latSpan = Math.max(Math.max(...lats) - Math.min(...lats), 1e-4);
  const narrow = w < 640;
  const box = narrow
    ? { x0: 0.1 * w, x1: 0.66 * w, y0: 96, y1: h - 68 }
    : { x0: 0.36 * w, x1: 0.74 * w, y0: 0.24 * h, y1: 0.86 * h };
  // Room taken by the stats card, which place names must not slip under.
  const overlay = narrow ? { x: w, y: 78 } : { x: 340, y: 100 };
  const scale = Math.min(
    (box.y1 - box.y0) / latSpan,
    (box.x1 - box.x0) / (lonSpan * LON_SCALE),
    1500,
  );
  const lonC = (Math.max(...lons) + Math.min(...lons)) / 2;
  const latC = (Math.max(...lats) + Math.min(...lats)) / 2;
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  const project = ([lon, lat]) => [
    w / 2 + (cx + (lon - lonC) * LON_SCALE * scale - w / 2) * zoom,
    h / 2 + (cy - (lat - latC) * scale - h / 2) * zoom,
  ];

  const path = smooth(geo.map(project));
  const lengths = measure(path);
  const total = segments.reduce((sum, s) => sum + s.minutes, 0);
  const parts = segments.map((segment) => ({
    ...segment,
    points: slice(
      path,
      lengths,
      segment.start / total,
      (segment.start + segment.minutes) / total,
    ),
    mid: pointAt(path, lengths, (segment.start + segment.minutes / 2) / total),
  }));

  const start = path[0];
  const end = path[path.length - 1];
  const nodes = parts.filter((p) => p.mode !== "walk");
  const anchors = [start, end, ...nodes.map((n) => n.mid)];
  const towns = mapTowns
    .filter((t) => t.name !== from.name && t.name !== to.name)
    .map((t) => ({ ...t, xy: project(t.coordinates) }))
    .filter(
      ({ xy: [x, y] }) =>
        x > 24 &&
        x < w - 24 &&
        y > 22 &&
        y < h - 30 &&
        !(x - 92 < overlay.x && y < overlay.y) &&
        anchors.every((a) => Math.hypot(a[0] - x, a[1] - y) > 30),
    )
    .sort((a, b) => a.xy[1] - b.xy[1])
    .filter(
      (t, i, all) =>
        !all
          .slice(0, i)
          .some(
            (o) =>
              Math.abs(o.xy[1] - t.xy[1]) < 24 && Math.abs(o.xy[0] - t.xy[0]) < 110,
          ),
    )
    .map((t) => ({
      ...t,
      nearNode: nodes.some((n) => Math.hypot(n.mid[0] - t.xy[0], n.mid[1] - t.xy[1]) < 60),
    }));

  return {
    land: toPath(islandOutline.map(project), true),
    line: toPath(path),
    parts,
    nodes,
    towns,
    start,
    end,
  };
}

export default function JourneyMap({ from, to, segments, fullMapHref, children }) {
  const [ref, { w, h }] = useElementSize();
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM);
  const [showLabels, setShowLabels] = useState(true);
  const zoom = ZOOM_LEVELS[zoomIndex];
  const map = useMemo(
    () => (w && h ? buildGeometry({ from, to, segments, w, h, zoom }) : null),
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
            <path className="jm-coast-glow" d={map.land} filter="url(#jm-glow)" />
            <path d={map.land} fill="url(#jm-land)" />
            <path d={map.land} fill="url(#jm-dots)" />
            <g clipPath="url(#jm-land-clip)">
              {[26, 62, 110].map((width) => (
                <path key={width} className="jm-contour" d={map.land} strokeWidth={width} />
              ))}
            </g>
            <path className="jm-coast" d={map.land} />

            {showLabels &&
              map.towns.map((town) => (
                <g key={town.name} className="jm-town">
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
