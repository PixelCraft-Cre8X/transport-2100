import { locations } from "../data/network.js";
import { resolveLocation } from "./locationResolver.js";

// Journey AI uses the same destinations that have dedicated destination images.
export const journeyDestinations = locations.filter(({ image }) =>
  Boolean(image),
);

export function unavailableJourneyDestination(role = "to") {
  const place = role === "from" ? "starting point" : "destination";
  return `That ${place} isn't available in Journey AI yet. You can choose ${journeyDestinations.map(({ name }) => name).join(", ")}. Which ${place} would you like?`;
}

export function resolveJourneyDestination(text) {
  const result = resolveLocation(text);
  if (
    (result.location && !journeyDestinations.includes(result.location)) ||
    result.candidates?.some((place) => !journeyDestinations.includes(place))
  ) {
    // Don't replace an unavailable place with a different supported location.
    return { status: "unsupported", query: text };
  }
  return result;
}
