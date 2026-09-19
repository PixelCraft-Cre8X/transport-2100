import { coastalCorridor, comparisonTags, locations } from "./network";
import { findLocation } from "../utils/locationResolver.js";

export function readJourney(params) {
  const from = findLocation(params.get("from")) || locations[0];
  const destination = findLocation(params.get("to"));
  const to =
    destination && destination !== from
      ? destination
      : locations.find((l) => l.name !== from.name);
  const walking = params.get("walking") === "low" ? "low" : "include";
  const options = buildRoutes(from, to, walking);
  const selected =
    options.find((o) => o.id === params.get("style")) || options[0];
  return { from, to, walking, options, selected };
}
export function journeyQuery(
  from,
  to,
  style = "recommended",
  walking = "include",
) {
  return new URLSearchParams({ from, to, style, walking }).toString();
}
export function buildRoutes(from, to, walking) {
  const distance = Math.hypot(
    (from.coordinates[0] - to.coordinates[0]) * 110,
    (from.coordinates[1] - to.coordinates[1]) * 111,
  );
  const scale = Math.max(0.25, distance / 96);
  return comparisonTags
    .filter((t) => walking !== "low" || t.id !== "healthy")
    .map((template) => {
      const walk = walking === "low" ? 2 : template.walk;
      const duration = Math.max(
        walk + 6,
        Math.round((template.minutes - template.walk) * scale) + walk,
      );
      const rideTime = duration - walk;
      const rides = template.modes.filter((m) => m !== "walk");
      const segments = template.modes.map((mode, index) => {
        const first = index === 0;
        const last = index === template.modes.length - 1;
        const minutes =
          mode === "walk"
            ? first
              ? Math.ceil(walk / 2)
              : Math.floor(walk / 2)
            : rides.length === 1
              ? rideTime
              : mode === "bus"
                ? Math.max(2, Math.round(rideTime * 0.22))
                : rideTime - Math.max(2, Math.round(rideTime * 0.22));
        const name =
          mode === "walk"
            ? first
              ? `Walk to ${from.name} mobility hub`
              : `Arrive in ${to.name}`
            : mode === "bus"
              ? "Smart Bus · Connector B12"
              : mode === "air"
                ? "Air Taxi · Horizon A01"
                : `SkyRail · ${template.id === "simplest" ? "Direct" : "Express"} S01`;
        return {
          mode,
          name,
          minutes,
          stop: last
            ? to.name
            : first
              ? `${from.name} mobility hub`
              : mode === "bus"
                ? `${from.name} SkyRail interchange`
                : `${to.name} mobility hub`,
          status: mode === "walk" ? "Step-free path" : "On time",
        };
      });
      return {
        ...template,
        walk,
        duration,
        cost: Math.round((template.cost * scale) / 10) * 10,
        transfers: rides.length - 1,
        segments,
      };
    });
}
// Illustrative geography for the 2100 network; replace with routing API geometry later.
export function mapRoutePoints(from, to, segments) {
  let elapsed = 0;
  const total = segments.reduce((sum, s) => sum + s.minutes, 0);
  const interpolate = (t) =>
    from.coordinates.map((v, i) => v + (to.coordinates[i] - v) * t);
  return segments.map((segment) => {
    const start = elapsed / total;
    elapsed += segment.minutes;
    const end = elapsed / total;
    return {
      ...segment,
      coordinates: [
        interpolate(start),
        interpolate((start + end) / 2),
        interpolate(end),
      ],
    };
  });
}
export const formatFare = (cost) => `LKR ${cost.toLocaleString("en-US")}`;
const DEPARTURE_MINUTES = 9 * 60;
// Wall-clock time (HH:MM) `minutes` after the 09:00 demo departure.
export function clockTime(minutes = 0) {
  const total = DEPARTURE_MINUTES + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
export const arrivalTime = clockTime;
// Segments annotated with the minute offset (from departure) at which each begins.
export function withStartTimes(segments) {
  let elapsed = 0;
  return segments.map((segment) => {
    const start = elapsed;
    elapsed += segment.minutes;
    return { ...segment, start, time: clockTime(start) };
  });
}
// Illustrative path for the journey map: rides between two south-west coast
// hubs follow the coastal corridor, everything else is a direct line.
export function routeWaypoints(from, to, { direct = false } = {}) {
  const ends = [from.coordinates, to.coordinates];
  const nearCorridor = ends.every(([lon, lat]) => lon < 80.3 && lat < 7.3);
  if (direct || !nearCorridor) return ends;
  const [fromLat, toLat] = [from.coordinates[1], to.coordinates[1]];
  const direction = Math.sign(toLat - fromLat);
  const between = coastalCorridor
    .filter(({ coordinates: [, lat] }) => {
      const clearOfEnds =
        Math.abs(lat - fromLat) > 0.06 && Math.abs(lat - toLat) > 0.06;
      return clearOfEnds && (lat - fromLat) * (toLat - lat) > 0;
    })
    .sort((a, b) => direction * (a.coordinates[1] - b.coordinates[1]));
  return [from.coordinates, ...between.map((t) => t.coordinates), to.coordinates];
}
