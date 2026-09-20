import { buildRoutes, formatFare } from "../data/journeys.js";
import { locations, transportModes } from "../data/network.js";
import { parseJourneyRequest } from "./journeyIntent.js";
import { createJourneyAIResponse, recommendJourney } from "./journeyAI.js";
import {
  findLocation,
  findLocationMentions,
  normalizeRequest,
} from "./locationResolver.js";

/** Modal-local memory, optionally seeded from the actual Journey/Tracking selection. */
export function createJourneyConversation(context = {}) {
  const from = findLocation(context.from) ?? locations[0];
  const to = findLocation(context.to);
  const conversation = {
    from: from.name,
    to: to?.name,
    style: context.style ?? context.selected?.id ?? "recommended",
    walking: context.walking === "low" ? "low" : "include",
    avoidModes: [...(context.avoidModes ?? [])],
    seenRouteIds: [],
  };
  if (to && to !== from) {
    const route = buildRoutes(from, to, conversation.walking).find(
      ({ id }) => id === conversation.style,
    );
    if (
      route &&
      !route.segments.some(({ mode }) => conversation.avoidModes.includes(mode))
    ) {
      conversation.lastResult = {
        status: "success",
        from,
        to,
        route,
        selectionSource: "journey",
        intent: { ...conversation },
        modes: [...new Set(route.segments.map(({ mode }) => mode))]
          .map((id) => transportModes.find((mode) => mode.id === id))
          .filter(Boolean),
      };
      conversation.route = route;
      conversation.seenRouteIds = [route.id];
    }
  }
  return conversation;
}

function questionKind(request) {
  // Destination changes take precedence over questions about the previous trip.
  if (
    findLocationMentions(request).length ||
    /\b(?:from|to|reach|visit)\s+/.test(request)
  )
    return;
  if (/\bhow (?:much|far).*walk|\bwalking time\b/.test(request))
    return "walking";
  if (/\bhow many (?:transfers?|changes?)\b/.test(request)) return "transfers";
  if (
    /\bhow long\b|\bhow much time\b|\btravel time\b|\bduration\b/.test(request)
  )
    return "duration";
  if (/\b(?:how much|what.*(?:cost|fare|price))\b/.test(request)) return "cost";
  if (/\b(?:which|what).*\b(?:transport|modes?|vehicles?)\b/.test(request))
    return "modes";
  if (/^(?:is|are|will).*\b(?:step free|accessible|wheelchair)\b/.test(request))
    return "accessibility";
  if (/^why\b/.test(request)) return "reason";
  if (
    /^(?:is|are|does|will|can).*\b(?:crowded|crowding|seats?|lifts?|ramps?|equipment|quiet)\b/.test(
      request,
    )
  )
    return "facilities";
}

function answerQuestion(kind, result) {
  const { route, modes } = result;
  switch (kind) {
    case "duration":
      return `This journey takes about ${route.duration} minutes, including ${route.walk} minutes of walking.`;
    case "cost":
      return `This journey costs ${formatFare(route.cost)} in the demo network.`;
    case "transfers":
      return `This journey has ${route.transfers} transfer${route.transfers === 1 ? "" : "s"}.`;
    case "walking":
      return `There are about ${route.walk} minutes of walking in this journey.`;
    case "modes":
      return `You'll use ${modes.map(({ short }) => short).join(" and ")}, with walking connections.`;
    case "accessibility": {
      const walks = route.segments.filter(({ mode }) => mode === "walk");
      return walks.length &&
        walks.every(({ status }) => status === "Step-free path")
        ? "The walking segments are marked as step-free paths in the demo network. Vehicle boarding accessibility and equipment are not specified."
        : "Step-free access is not confirmed by this route's data.";
    }
    case "facilities":
      return "The route data doesn't confirm crowd levels, available seats, or onboard accessibility equipment.";
    default:
      if (result.selectionSource === "journey")
        return `This is the ${route.label} option selected on your current journey. It takes about ${route.duration} minutes, costs ${formatFare(route.cost)}, and has ${route.transfers} transfer${route.transfers === 1 ? "" : "s"}.`;
      return createJourneyAIResponse({ ...result, message: undefined });
  }
}

function withAnswer(conversation, message) {
  const result = conversation.lastResult
    ? { ...conversation.lastResult, kind: "answer", message }
    : { status: "error", message };
  return { conversation, result };
}

/** A pure turn reducer: voice and text use exactly the same context and route engine. */
export function handleJourneyRequest(
  text,
  conversation = createJourneyConversation(),
) {
  const request = normalizeRequest(text);
  const question = questionKind(request);
  if (question) {
    if (conversation.pendingPlace)
      return withAnswer(
        conversation,
        conversation.pendingPlace.role === "from"
          ? "What starting point should I use?"
          : "Where would you like to go?",
      );
    return withAnswer(
      conversation,
      conversation.lastResult
        ? answerQuestion(question, conversation.lastResult)
        : "Of course. Where would you like to go?",
    );
  }

  const intent = parseJourneyRequest(text, conversation);
  const nextFastest = /\bnext fastest\b/.test(request);
  const another =
    /\b(?:another|different|alternative) (?:option|route|journey)\b|\ban alternative\b/.test(
      request,
    );
  const sameTrip =
    intent.from === conversation.from &&
    intent.to === conversation.to &&
    intent.walking === conversation.walking;
  const sameConstraints =
    sameTrip && intent.avoidModes.join() === conversation.avoidModes.join();
  const previous = sameTrip ? conversation.lastResult : null;
  const seenRouteIds = sameConstraints ? conversation.seenRouteIds : [];
  const ranking = {};
  if (previous && !intent.error) {
    if (nextFastest) {
      intent.style = "fastest";
      intent.alternative = "next-fastest";
      ranking.nextAfter = previous.route.id;
    } else if (another) {
      intent.alternative = "another";
      ranking.excludedIds = seenRouteIds;
    }
  }

  let result = recommendJourney(intent, ranking);
  if (
    result.status === "error" &&
    previous &&
    (nextFastest || another) &&
    !intent.error &&
    sameConstraints
  )
    return withAnswer(
      conversation,
      nextFastest
        ? result.message
        : "I've shown all the options matching your current preferences. You can change your preferences to explore more.",
    );

  // A cheaper follow-up cannot replace the current route with an equally priced
  // or dearer one and claim a saving. Keep the selected route if it still fits.
  if (
    result.status === "success" &&
    intent.compareCost &&
    previous &&
    sameConstraints &&
    result.route.cost >= previous.route.cost
  )
    result = {
      ...previous,
      intent,
      currentRoute: previous.route,
      kind: "answer",
      message: `There isn't a cheaper option matching your preferences. Your current journey costs ${formatFare(previous.route.cost)}.`,
    };

  const updated = {
    from: intent.from,
    to: intent.to,
    style: intent.style,
    walking: intent.walking,
    avoidModes: intent.avoidModes,
    green: intent.green,
    accessibility: intent.accessibility,
    pendingPlace: intent.clarification,
    seenRouteIds,
  };
  if (result.status === "success") {
    updated.lastResult = { ...result, message: undefined, kind: undefined };
    updated.route = result.route;
    updated.seenRouteIds = [...new Set([...seenRouteIds, result.route.id])];
  }
  // On unresolved places or impossible constraints, do not answer about a stale trip.
  return { conversation: updated, result };
}
