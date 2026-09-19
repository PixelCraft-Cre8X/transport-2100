import { comparisonTags, locations } from "./network";

export function readJourney(params) {
  const from =
    locations.find((l) => l.name === params.get("from")) || locations[0];
  const to =
    locations.find(
      (l) => l.name === params.get("to") && l.name !== from.name,
    ) || locations.find((l) => l.name !== from.name);
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
export function arrivalTime(minutes) {
  const total = 9 * 60 + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
