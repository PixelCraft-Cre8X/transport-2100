import { routeWaypoints } from "../data/journeys";
import { islandOutline } from "../data/network";

const LON_SCALE = Math.cos((6.5 * Math.PI) / 180);
const SAMPLES_PER_SPAN = 12;
const CHAR_WIDTH = 7.2;

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

export const toPath = (points, close = false) =>
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

const overlaps = (a, b) =>
  a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

/**
 * Lays an illustrated route out in pixel space.
 *
 * `segments` need `start` and `minutes`. `box` is the pixel area the route
 * should be fitted into. `blocked` rects keep place names clear of overlays.
 * With `callout` ({ width, height, dx }) it also returns label anchors for the
 * start, each ride, each transfer and the destination. `progress` (0..1) adds a
 * vehicle on the path, and `follow` keeps the view centred on it. `zoom` and
 * `pan` (pixels) come from the map's zoom/drag state.
 */
export function buildRouteMap({
  from,
  to,
  segments,
  w,
  h,
  box,
  zoom = 1,
  pan = [0, 0],
  progress = null,
  follow = false,
  towns = [],
  blocked = [],
  callout = null,
}) {
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
  const scale = Math.min(
    (box.y1 - box.y0) / latSpan,
    (box.x1 - box.x0) / (lonSpan * LON_SCALE),
    1500,
  );
  const lonC = (Math.max(...lons) + Math.min(...lons)) / 2;
  const latC = (Math.max(...lats) + Math.min(...lats)) / 2;
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  const base = ([lon, lat]) => [
    cx + (lon - lonC) * LON_SCALE * scale,
    cy - (lat - latC) * scale,
  ];

  const path0 = smooth(geo.map(base));
  const lengths = measure(path0);
  const vehicle0 = progress == null ? null : pointAt(path0, lengths, progress);
  const focus = follow && vehicle0 ? vehicle0 : [w / 2, h / 2];
  const view = ([x, y]) => [
    w / 2 + (x - focus[0]) * zoom + pan[0],
    h / 2 + (y - focus[1]) * zoom + pan[1],
  ];
  const project = (coordinates) => view(base(coordinates));

  const path = path0.map(view);
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

  let callouts = [];
  if (callout) {
    const { width, height, dx, kinds } = callout;
    const at = ([x, y], extra = 0) => ({
      x0: x + dx,
      y0: y - (height + extra) / 2,
      x1: x + dx + width,
      y1: y + (height + extra) / 2,
    });
    const items = [
      { kind: "start", segment: parts[0], xy: start },
      ...nodes.map((part) => ({ kind: "ride", segment: part, xy: part.mid })),
      ...parts.flatMap((part, i) =>
        i > 0 && part.mode !== "walk" && parts[i - 1].mode !== "walk"
          ? [{ kind: "transfer", segment: part, previous: parts[i - 1], xy: part.points[0] }]
          : [],
      ),
      { kind: "end", segment: parts[parts.length - 1], xy: end },
    ]
      .filter((c) => !kinds || kinds.includes(c.kind))
      .map((c) => ({ ...c, rect: at(c.xy, c.kind === "end" ? 12 : 0) }))
      .sort((a, b) => a.xy[1] - b.xy[1]);
    // Nudge labels down so neighbouring cards never sit on top of each other.
    items.forEach((c, i) => {
      items.slice(0, i).forEach((p) => {
        if (overlaps(c.rect, { ...p.rect, y0: p.rect.y0 - 6, y1: p.rect.y1 + 6 })) {
          const shift = p.rect.y1 + 6 - c.rect.y0;
          c.rect = { ...c.rect, y0: c.rect.y0 + shift, y1: c.rect.y1 + shift };
        }
      });
    });
    callouts = items;
  }

  const anchors = [start, end, ...nodes.map((n) => n.mid)];
  const reserved = [...blocked, ...callouts.map((c) => c.rect)];
  const labelled = towns
    .filter((t) => t.name !== from.name && t.name !== to.name)
    .map((t) => {
      const xy = project(t.coordinates);
      return {
        ...t,
        xy,
        nearNode: nodes.some((n) => Math.hypot(n.mid[0] - xy[0], n.mid[1] - xy[1]) < 60),
      };
    })
    .filter(
      ({ xy: [x, y] }) =>
        x > 24 &&
        x < w - 24 &&
        y > 22 &&
        y < h - 30 &&
        anchors.every((a) => Math.hypot(a[0] - x, a[1] - y) > 30),
    )
    .filter((t) => {
      const width = (t.nearNode && t.side !== "right" ? 34 : 12) + t.name.length * CHAR_WIDTH;
      const rect =
        t.side === "right"
          ? { x0: t.xy[0], y0: t.xy[1] - 10, x1: t.xy[0] + width, y1: t.xy[1] + 8 }
          : { x0: t.xy[0] - width, y0: t.xy[1] - 10, x1: t.xy[0], y1: t.xy[1] + 8 };
      return rect.x0 > 6 && rect.x1 < w - 6 && !reserved.some((r) => overlaps(rect, r));
    })
    .sort((a, b) => a.xy[1] - b.xy[1])
    .filter(
      (t, i, all) =>
        !all
          .slice(0, i)
          .some(
            (o) =>
              Math.abs(o.xy[1] - t.xy[1]) < 24 && Math.abs(o.xy[0] - t.xy[0]) < 110,
          ),
    );

  return {
    land: toPath(islandOutline.map(project), true),
    line: toPath(path),
    parts,
    nodes,
    callouts,
    towns: labelled,
    start,
    end,
    vehicle: vehicle0 && view(vehicle0),
  };
}
