import { buildRoutes, formatFare, journeyQuery } from "../data/journeys.js";
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
    recommendedRoute: null,
    selectedRoute: null,
    selectedJourney: null,
    accepted: false,
    awaitingStart: false,
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
      conversation.recommendedRoute = route;
      conversation.seenRouteIds = [route.id];
      if (context.accepted) {
        conversation.accepted = true;
        conversation.selectedRoute = route;
        conversation.selectedJourney = conversation.lastResult;
      }
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

function journeyAction(request, conversation) {
  const phrase = request
    .replace(/[.,!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:please|can you|could you)\s+|\s+please$/g, "");
  if (/^(?:yes|yeah|yep|sure|okay|ok)$/.test(phrase))
    return conversation.accepted && conversation.awaitingStart
      ? "start"
      : "confirm";
  if (/^(?:no|no thanks|not yet|not now)$/.test(phrase)) return "wait";
  if (/^(?:let's|let us) go$/.test(phrase))
    return conversation.accepted ? "start" : "accept";
  if (
    /^(?:(?:yes|okay|ok) )?(?:start(?: (?:this|the|my))?(?: (?:journey|trip|route|tracking|navigation|live guidance))?|begin (?:navigation|tracking|guidance|the journey)|guide me|take me there)$/.test(
      phrase,
    )
  )
    return "start";
  if (
    /^(?:(?:yes|okay|ok) )?(?:(?:i'll|i will|i want to) )?(?:take|choose|select|use|go with) (?:this|that)(?: one| route| journey| trip)?$/.test(
      phrase,
    ) ||
    /^(?:this|that)(?: one| route| journey| trip)? (?:is )?(?:fine|good|okay|ok)$/.test(
      phrase,
    ) ||
    /^(?:yes|okay|ok) (?:this|that)(?: one| route| journey| trip)?$/.test(
      phrase,
    )
  )
    return "accept";
  if (/^(?:read|read out|show)(?: me)?(?: the| my)? directions$/.test(phrase))
    return "directions";
  if (/^cancel(?: this| the| my)? (?:journey|trip|route)$/.test(phrase))
    return "cancel";
  if (
    /^(?:i (?:don't|do not) like (?:this|that)(?: one| route| journey)?|(?:show|give) me another one|change(?: this| the| my)? route)$/.test(
      phrase,
    )
  )
    return "another";
}

function selectJourney(conversation, start) {
  const journey = conversation.selectedJourney ?? conversation.lastResult;
  if (!journey || conversation.pendingPlace)
    return withAnswer(
      conversation,
      "Let's find a route first. Where would you like to go?",
    );
  const selected = {
    ...conversation,
    selectedJourney: journey,
    selectedRoute: journey.route,
    accepted: true,
    awaitingStart: !start,
  };
  const turn = withAnswer(
    selected,
    start
      ? "Journey started. I'll guide you along the way."
      : `Great. I've selected this journey to ${journey.to.name}. Would you like me to start live guidance?`,
  );
  if (start) {
    const query = journeyQuery(
      journey.from.name,
      journey.to.name,
      journey.route.id,
      journey.intent.walking,
    );
    turn.navigation = `/tracking?${query}`;
  }
  return turn;
}

/** A pure turn reducer: voice and text use exactly the same context and route engine. */
export function handleJourneyRequest(
  text,
  conversation = createJourneyConversation(),
) {
  const request = normalizeRequest(text);
  const action = journeyAction(request, conversation);
  if (action === "accept" || action === "start")
    return selectJourney(conversation, action === "start");
  if (action === "confirm")
    return withAnswer(
      conversation,
      conversation.lastResult
        ? "You can say “I'll take this one” to select this journey, or “Start tracking” when you're ready."
        : "Where would you like to go? I'll find a route for you.",
    );
  if (action === "wait")
    return withAnswer(
      { ...conversation, awaitingStart: false },
      conversation.accepted
        ? "Your journey is still selected. Say “Start tracking” whenever you're ready."
        : "You can ask for another route or tell me what you'd like to change.",
    );
  if (action === "cancel") {
    return {
      conversation: {
        ...conversation,
        route: null,
        recommendedRoute: null,
        lastResult: null,
        selectedRoute: null,
        selectedJourney: null,
        accepted: false,
        awaitingStart: false,
        seenRouteIds: [],
      },
      result: {
        status: "info",
        message:
          "Journey cancelled. Tell me where you'd like to go when you're ready.",
      },
    };
  }
  if (action === "directions") {
    const journey = conversation.selectedJourney ?? conversation.lastResult;
    return withAnswer(
      conversation,
      journey
        ? `From ${journey.from.name} to ${journey.to.name}: ${journey.route.segments.map((segment) => `${segment.name}, ${segment.minutes} minutes`).join(". ")}.`
        : "Let's find a route first. Where would you like to go?",
    );
  }
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

  const intent = parseJourneyRequest(
    action === "another" ? "Show me another option" : text,
    conversation,
  );
  const nextFastest = /\bnext fastest\b/.test(request);
  const another =
    action === "another" ||
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
      {
        ...conversation,
        selectedJourney: null,
        selectedRoute: null,
        accepted: false,
        awaitingStart: false,
      },
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
    recommendedRoute: null,
    selectedRoute: null,
    selectedJourney: null,
    accepted: false,
    awaitingStart: false,
  };
  if (result.status === "success") {
    updated.lastResult = { ...result, message: undefined, kind: undefined };
    updated.route = result.route;
    updated.recommendedRoute = result.route;
    updated.seenRouteIds = [...new Set([...seenRouteIds, result.route.id])];
    // A factual answer about the same selected route doesn't undo acceptance.
    if (result.route === conversation.selectedRoute && sameConstraints) {
      updated.selectedRoute = conversation.selectedRoute;
      updated.selectedJourney = conversation.selectedJourney;
      updated.accepted = conversation.accepted;
      updated.awaitingStart = conversation.awaitingStart;
    }
  }
  // On unresolved places or impossible constraints, do not answer about a stale trip.
  return { conversation: updated, result };
}
