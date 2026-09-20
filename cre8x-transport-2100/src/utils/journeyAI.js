import { buildRoutes, formatFare } from "../data/journeys.js";
import { comparisonTags, transportModes } from "../data/network.js";
import { findLocation } from "./locationResolver.js";
export { parseJourneyRequest } from "./journeyIntent.js";

/** Filter hard constraints first, then rank the actual generated route options. */
export function recommendJourney(intent, { excludedIds = [], nextAfter } = {}) {
  if (intent.error)
    return {
      status: "error",
      message: intent.error,
      clarification: intent.clarification,
    };
  const from = findLocation(intent.from);
  const to = findLocation(intent.to);
  if (!from || !to || from === to) {
    return {
      status: "error",
      message: "Please choose two different locations in the MoveOne network.",
    };
  }
  const options = buildRoutes(from, to, intent.walking).filter(
    (route) =>
      !excludedIds.includes(route.id) &&
      !route.segments.some(({ mode }) => intent.avoidModes.includes(mode)),
  );
  if (!options.length) {
    return {
      status: "error",
      message:
        "No existing journey matches those transport exclusions. Try allowing another transport mode.",
    };
  }

  const byTime = (a, b) =>
    a.duration - b.duration || a.walk - b.walk || a.cost - b.cost;
  const byWalking = (a, b) => a.walk - b.walk || byTime(a, b);
  let route;
  if (nextAfter) {
    const ordered = [...options].sort(byTime);
    const index = ordered.findIndex(({ id }) => id === nextAfter);
    route = ordered[index + 1];
    if (index < 0 || !route)
      return {
        status: "error",
        message:
          "There isn't a next-fastest option matching your current preferences.",
      };
  }
  if (!route) {
    switch (intent.style) {
      case "fastest":
        route = options.sort(byTime)[0];
        break;
      case "eco":
        route = options.sort((a, b) => a.cost - b.cost || byTime(a, b))[0];
        break;
      case "simplest":
        route = options.sort(
          (a, b) => a.transfers - b.transfers || byTime(a, b),
        )[0];
        break;
      case "comfortable":
        route =
          options.find(({ id }) => id === "comfortable") ||
          options.sort(byWalking)[0];
        break;
      case "healthy":
        route =
          intent.walking !== "low" &&
          options.find(({ id }) => id === "healthy");
        route ||=
          options.find(({ id }) => id === "recommended") ||
          options.sort(byWalking)[0];
        break;
      default:
        route =
          options.find(({ id }) => id === "recommended") ||
          options.sort(byWalking)[0];
    }
  }

  const modes = [...new Set(route.segments.map(({ mode }) => mode))]
    .map((id) => transportModes.find((mode) => mode.id === id))
    .filter(Boolean);
  const currentRoute = intent.compareCost
    ? buildRoutes(from, to, intent.currentWalking).find(
        ({ id }) => id === intent.currentStyle,
      )
    : undefined;
  return { status: "success", intent, from, to, route, modes, currentRoute };
}

export function createJourneyAIResponse(result) {
  if (result.message) return result.message;
  if (result.status !== "success") return result.message;
  const { intent, from, to, route, modes, currentRoute } = result;
  const parts = [
    `I recommend the ${modes.map(({ short }) => short).join(" and ")} journey from ${from.name} to ${to.name}.`,
    `It takes about ${route.duration} minutes, costs ${formatFare(route.cost)}, includes ${route.transfers} transfer${route.transfers === 1 ? "" : "s"} and around ${route.walk} minutes of walking.`,
  ];
  if (intent.style === "fastest")
    parts.push(
      intent.alternative === "next-fastest"
        ? "This is the next route in travel-time order among those matching your preferences."
        : `This has the shortest travel time among the ${intent.alternative ? "remaining " : ""}routes matching your request.`,
    );
  if (intent.style === "eco") {
    parts.push(
      `This has the lowest fare among the ${intent.alternative ? "remaining " : ""}routes matching your request.`,
    );
    if (intent.green)
      parts.push(
        route.id === "eco"
          ? `It is the network's ${comparisonTags.find(({ id }) => id === "eco").label} option.`
          : `The network's Eco option ${intent.alternative ? "was already shown or excluded by your preferences" : "is excluded by your transport preferences"}; emissions data is not available to compare the remaining routes.`,
      );
  }
  if (intent.style === "simplest")
    parts.push(
      `This has the fewest transfers among the ${intent.alternative ? "remaining " : ""}matching routes, with travel time used to break ties.`,
    );
  if (intent.style === "comfortable")
    parts.push(
      route.id === "comfortable"
        ? `This is the network's Comfortable option with ${route.comfort.toLowerCase()} comfort.`
        : "This alternative prioritizes less walking, then travel time.",
    );
  if (intent.style === "healthy" && route.id === "healthy")
    parts.push(
      "This is the network's Healthy choice, with more walking included.",
    );
  if (intent.walking === "low")
    parts.push(
      `Reduced walking is enabled, with ${route.walk} minutes on foot.`,
    );
  if (
    intent.accessibility &&
    route.segments.some(({ status }) => status === "Step-free path")
  ) {
    parts.push(
      "Its walking segments are marked as step-free paths in the demo network.",
    );
  }
  if (intent.avoidModes.length) {
    parts.push(
      `It avoids ${intent.avoidModes.map((id) => transportModes.find((mode) => mode.id === id).short).join(" and ")}.`,
    );
  }
  if (currentRoute)
    parts.push(
      route.cost < currentRoute.cost
        ? `That saves ${formatFare(currentRoute.cost - route.cost)} compared with your current journey.`
        : "There isn't a cheaper option than your current journey under these preferences.",
    );
  return parts.join(" ");
}
