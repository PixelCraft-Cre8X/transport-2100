import { buildRoutes, formatFare } from "../data/journeys.js";
import { comparisonTags, locations, transportModes } from "../data/network.js";

const normalize = (text) =>
  String(text ?? "")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[‐‑–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
const escapePattern = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const locationPattern = locations
  .map(({ name }) => escapePattern(normalize(name)))
  .sort((a, b) => b.length - a.length)
  .join("|");
const findLocation = (value) =>
  locations.find(
    ({ name }) => normalize(name) === normalize(value?.name ?? value),
  );

const lowWalkingPattern =
  /\b(wheelchair|accessible|accessibility|step[- ]free|less walking|minimum walking|minimi[sz]e walking|difficulty walking|elderly|grandmother|grandfather|senior|walk less|no walking)\b/;
const stylePatterns = [
  [
    "fastest",
    /\b(fastest|quickest|faster|as fast as possible|shortest time)\b/,
  ],
  [
    "eco",
    /\b(cheapest|cheaper|cheap|budget|lowest fare|save money|green|greenest|eco|environment(?:ally)? friendly)\b/,
  ],
  [
    "simplest",
    /\b(simple|simplest|direct|few(?:er)? transfers|no transfers?|easy connections?)\b/,
  ],
  [
    "comfortable",
    /\b(comfortable|comfort|quiet|relax|elderly|grandmother|grandfather|senior)\b/,
  ],
  ["healthy", /\b(healthy|walking|exercise|walk more)\b/],
];
const modePatterns = {
  air: "air taxis|air taxi|air transport|air travel|air",
  bus: "smart buses|smart bus|buses|bus",
  rail: "skyrail|sky rail|trains|train|rail",
};
const modePattern = `(?:${Object.values(modePatterns).join("|")})\\b`;
const avoidancePattern = new RegExp(
  `\\b(?:avoid(?:ing)?|without|no|exclude|don't use|don't take|don't want|do not use|do not take|do not want|not using)\\s+(?:(?:any|the|an?|using|use|taking|take)\\s+)*${modePattern}(?:\\s*(?:,\\s*(?:and|or|nor)?|and|or|nor|/)\\s*(?:(?:no|avoid|the|any|an?)\\s+)*${modePattern})*`,
  "g",
);

/** Parse language only. Route generation and ranking stay independent of this parser. */
export function parseJourneyRequest(text, currentJourneyContext = {}) {
  const request = normalize(text);
  const contextFrom = findLocation(currentJourneyContext.from);
  const contextTo = findLocation(currentJourneyContext.to);
  const mentions = [
    ...request.matchAll(new RegExp(`\\b(${locationPattern})\\b`, "g")),
  ].map((match) => ({ location: findLocation(match[0]), index: match.index }));
  let explicitFrom;
  let explicitTo;
  let invalidOrigin = false;
  let invalidDestination = false;

  // Match directional clauses separately so an unknown explicit place never silently
  // falls back to the current trip. Skip infinitives such as "to save money".
  for (const match of request.matchAll(/\b(from|to|towards?)\s+(?:the\s+)?/g)) {
    const rest = request.slice(match.index + match[0].length);
    if (
      match[1] !== "from" &&
      /^(?:find|get|travel|go|take|use|avoid|save|minimi[sz]e|walk|relax|plan|visit)\b/.test(
        rest,
      )
    )
      continue;
    const place = rest.match(new RegExp(`^(${locationPattern})\\b`));
    if (match[1] === "from") {
      explicitFrom = place ? findLocation(place[0]) : undefined;
      invalidOrigin ||= !place;
    } else {
      explicitTo = place ? findLocation(place[0]) : undefined;
      invalidDestination ||= !place;
    }
  }

  const unassigned = mentions.filter(
    ({ location }) => location !== explicitFrom && location !== explicitTo,
  );
  const destinationIndex = mentions.find(
    ({ location }) => location === explicitTo,
  )?.index;
  const impliedOrigin = unassigned.find(
    ({ index }) => index < destinationIndex,
  )?.location;
  const from =
    explicitFrom ||
    impliedOrigin ||
    (!explicitTo && unassigned.length > 1
      ? unassigned[0].location
      : contextFrom) ||
    locations[0];
  const to = explicitTo || unassigned.at(-1)?.location || contextTo;
  const walking = lowWalkingPattern.test(request) ? "low" : "include";
  const style =
    stylePatterns.find(
      ([id, pattern]) =>
        !(id === "healthy" && walking === "low") && pattern.test(request),
    )?.[0] || "recommended";
  const avoidedText = [...request.matchAll(avoidancePattern)]
    .map(([match]) => match)
    .join(" ");
  const avoidModes = Object.entries(modePatterns)
    .filter(([, pattern]) =>
      new RegExp(`\\b(?:${pattern})\\b`).test(avoidedText),
    )
    .map(([id]) => id);

  let error;
  if (!request) error = "Please type or speak a journey request.";
  else if (invalidOrigin)
    error =
      "I couldn't identify your starting point. Please choose a location in the MoveOne network.";
  else if (invalidDestination || !to)
    error =
      "I couldn't identify a destination. Try saying 'Take me to Colombo Fort.' Please use a destination in the MoveOne network.";
  else if (from === to)
    error = "Choose a destination different from your starting point.";

  return {
    from: from.name,
    to: to?.name,
    style,
    walking,
    avoidModes,
    green: /\b(green|greenest|eco|environment(?:ally)? friendly)\b/.test(
      request,
    ),
    accessibility:
      /\b(wheelchair|accessible|accessibility|step[- ]free)\b/.test(request),
    compareCost:
      /\bcheaper\b/.test(request) && from === contextFrom && to === contextTo,
    currentStyle:
      currentJourneyContext.style ?? currentJourneyContext.selected?.id,
    currentWalking: currentJourneyContext.walking === "low" ? "low" : "include",
    error,
  };
}

/** Filter hard constraints first, then rank the actual generated route options. */
export function recommendJourney(intent) {
  if (intent.error) return { status: "error", message: intent.error };
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
        intent.walking !== "low" && options.find(({ id }) => id === "healthy");
      route ||=
        options.find(({ id }) => id === "recommended") ||
        options.sort(byWalking)[0];
      break;
    default:
      route =
        options.find(({ id }) => id === "recommended") ||
        options.sort(byWalking)[0];
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
  if (result.status !== "success") return result.message;
  const { intent, from, to, route, modes, currentRoute } = result;
  const parts = [
    `I recommend the ${modes.map(({ short }) => short).join(" and ")} journey from ${from.name} to ${to.name}.`,
    `It takes about ${route.duration} minutes, costs ${formatFare(route.cost)}, includes ${route.transfers} transfer${route.transfers === 1 ? "" : "s"} and around ${route.walk} minutes of walking.`,
  ];
  if (intent.style === "fastest")
    parts.push(
      "This has the shortest travel time among the routes matching your request.",
    );
  if (intent.style === "eco") {
    parts.push(
      "This has the lowest fare among the routes matching your request.",
    );
    if (intent.green)
      parts.push(
        route.id === "eco"
          ? `It is the network's ${comparisonTags.find(({ id }) => id === "eco").label} option.`
          : "The network's Eco option is excluded by your transport preferences; emissions data is not available to compare the remaining routes.",
      );
  }
  if (intent.style === "simplest")
    parts.push(
      "This has the fewest transfers, with travel time used to break ties.",
    );
  if (intent.style === "comfortable")
    parts.push(
      route.id === "comfortable"
        ? `This is the network's Comfortable option with ${route.comfort.toLowerCase()} comfort.`
        : "The Comfortable option is excluded; this alternative prioritizes less walking, then travel time.",
    );
  if (intent.style === "healthy" && route.id === "healthy")
    parts.push(
      "This is the network's Healthy choice, with more walking included.",
    );
  if (intent.walking === "low")
    parts.push("This option is suitable for reduced walking.");
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
