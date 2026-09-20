import {
  journeyDestinations,
  resolveJourneyDestination,
  unavailableJourneyDestination,
} from "./journeyDestinations.js";
import { findLocation, normalizeRequest } from "./locationResolver.js";

const lowWalkingPattern =
  /\b(wheelchair|wheel chair|accessible|accessibility|step free|barrier free|less walking|minimum walking|minimi[sz]e walking|difficulty walking|hard to walk|can't walk (?:far|much)|cannot walk (?:far|much)|leg problem|elderly|grandmother|grandfather|senior|older person|older adult|walk less|no walking|travell?ing with (?:a child|children|kids|luggage))\b/;
const greenPattern =
  /\b(green|greenest|eco|environment(?:ally)? friendly|better for the environment|low emissions?|sustainable)\b/;
const stylePatterns = [
  [
    "fastest",
    /\b(fast|fastest|quick|quickest|quickly|faster|as fast as possible|shortest time|hurry|i'm late|i am late|get there soon|soonest|least time)\b/,
  ],
  [
    "eco",
    /\b(cheapest|cheaper|cheap|cheaply|budget|lowest fare|low fare|lowest price|save (?:some )?money|low cost|lower cost|lower fare|less expensive|affordable|don't spend much|do not spend much)\b/,
  ],
  ["eco", greenPattern],
  [
    "simplest",
    /\b(simple|simplest|direct|straight there|few(?:er)? transfers?|no transfers?|easy connections?|easy route|easiest|least changes|few(?:er)? changes|no changing|don't want to change|do not want to change|easy to follow)\b/,
  ],
  [
    "comfortable",
    /\b(comfortable|comfort|quiet|relax|relaxing|relaxed|peaceful|easy on me|less crowded|easy journey|smooth journey|elderly|grandmother|grandfather|senior|older person|older adult)\b/,
  ],
  [
    "healthy",
    /\b(healthy|walking|exercise|walk more|more walking|active route)\b/,
  ],
];
const modePatterns = {
  air: "air taxis|air taxi|air transport|air travel|air|flying|fly",
  bus: "smart buses|smart bus|buses|bus",
  rail: "skyrail|sky rail|trains|train|rail",
};
const modePattern = `(?:${Object.values(modePatterns).join("|")})\\b`;
const avoidancePattern = new RegExp(
  `\\b(?:avoid(?:ing)?|without|no|exclude|don't (?:use|take|want|like)|do not (?:use|take|want|like)|not using|afraid of)\\s+(?:(?:any|the|an?|using|use|taking|take)\\s+)*${modePattern}(?:\\s*(?:,\\s*(?:and|or|nor)?|and|or|nor|/)\\s*(?:(?:no|avoid|the|any|an?)\\s+)*${modePattern})*`,
  "g",
);
const allowancePattern = new RegExp(
  `\\b(?:allow|okay with|ok with)\\s+(?:(?:the|an?)\\s+)?${modePattern}(?:\\s*(?:,\\s*(?:and|or)?|and|or)\\s*(?:(?:the|an?)\\s+)?${modePattern})*`,
  "g",
);

const clausePattern =
  /\b(from|(?:i am|i'm|we are|we're)\s+(?:in|at)|starting (?:in|at)|(?:take|bring)\s+me(?:\s+to)?|go(?:\s+to)?|reach|visit|(?:route|journey|trip)\s+(?:for|to)|what about|to|towards?|into|as far as)\s+(?:the\s+)?/g;
const originPattern =
  /^(?:from|(?:i am|i'm|we are|we're)\s+(?:in|at)|starting)/;
const infinitivePattern =
  /^(?:find|get|travel|go|take|use|avoid|save|minimi[sz]e|walk|relax|plan|visit|show|bring|help|please|change|follow)\b/;
const referencePattern = /^(?:there|it|that|this)\b/;

function placePhrase(text) {
  return text
    .split(
      /[,.;!?]|\s+(?:but|and|from|to|towards?|please|instead|with|without|no|avoid|on|using|by|as|cheap(?:est|er|ly)?|quick(?:est|ly)?|fast(?:est|er)?|in a hurry)\b/,
    )[0]
    .trim();
}

/** Language interpretation only; canonical names and preferences feed the route engine. */
export function parseJourneyRequest(text, context = {}) {
  const request = normalizeRequest(text);
  const contextFrom = findLocation(context.from);
  const contextTo = findLocation(context.to);
  let from =
    context.pendingPlace?.role === "from"
      ? contextFrom
      : (contextFrom ?? journeyDestinations[0]);
  let to = contextTo;
  let clarification;
  let assignedFrom = false;
  let assignedTo = false;
  const clauses = [];

  function assign(phrase, role) {
    const resolved = resolveJourneyDestination(phrase);
    if (role === "from") assignedFrom = true;
    else assignedTo = true;
    if (resolved.status === "resolved") {
      if (role === "from") from = resolved.location;
      else to = resolved.location;
    } else {
      if (role === "from") from = undefined;
      else to = undefined;
      clarification ??= { role, ...resolved };
    }
  }

  for (const match of request.matchAll(clausePattern)) {
    const rest = request.slice(match.index + match[0].length);
    const role = originPattern.test(match[1]) ? "from" : "to";
    if (
      role === "to" &&
      (infinitivePattern.test(rest) ||
        referencePattern.test(rest) ||
        /^from\b/.test(rest))
    )
      continue;
    const phrase = placePhrase(rest);
    if (!phrase) continue;
    clauses.push({ role, index: match.index });
    assign(phrase, role);
  }

  // "Maharagama to Kandy" also supplies an origin without saying "from".
  const firstDestination = clauses.find(({ role }) => role === "to");
  if (!assignedFrom && firstDestination) {
    const prefix = resolveJourneyDestination(
      request.slice(0, firstDestination.index).trim(),
    );
    if (prefix.status === "resolved") {
      from = prefix.location;
      assignedFrom = true;
    } else if (prefix.status === "unsupported") {
      assign(prefix.query, "from");
    }
  }

  const walking = lowWalkingPattern.test(request)
    ? "low"
    : /\b(?:walk more|more walking|include walking)\b/.test(request)
      ? "include"
      : context.walking === "low"
        ? "low"
        : "include";
  const requestedStyle = stylePatterns.find(
    ([id, pattern]) =>
      !(id === "healthy" && walking === "low") && pattern.test(request),
  )?.[0];
  const style =
    requestedStyle ?? context.style ?? context.selected?.id ?? "recommended";
  const avoidedText = [...request.matchAll(avoidancePattern)]
    .map(([match]) => match)
    .join(" ");
  const exclusions = Object.entries(modePatterns)
    .filter(([, pattern]) =>
      new RegExp(`\\b(?:${pattern})\\b`).test(avoidedText),
    )
    .map(([id]) => id);
  if (/\b(?:don't fly|do not fly)\b/.test(request)) exclusions.push("air");
  const allowedText = [...request.matchAll(allowancePattern)]
    .map(([match]) => match)
    .join(" ");
  const avoidModes = [
    ...new Set([...(context.avoidModes ?? []), ...exclusions]),
  ].filter(
    (id) => !new RegExp(`\\b(?:${modePatterns[id]})\\b`).test(allowedText),
  );

  if (!clauses.length) {
    const bare = placePhrase(request.replace(/^(?:please|actually)\s+/, ""));
    const resolved = resolveJourneyDestination(bare);
    if (resolved.status !== "unknown")
      assign(bare, context.pendingPlace?.role ?? "to");
    else if (
      !requestedStyle &&
      !lowWalkingPattern.test(request) &&
      !exclusions.length &&
      !/\b(?:allow|okay with|ok with|hello|hi|journey|route|trip|help|there|option)\b/.test(
        request,
      )
    )
      assign(bare, context.pendingPlace?.role ?? "to");
  }

  if (
    context.pendingPlace &&
    !(context.pendingPlace.role === "from" ? assignedFrom : assignedTo)
  )
    clarification ??= context.pendingPlace;

  // Existing page context must obey the same availability rules as new requests.
  if (from && !journeyDestinations.includes(from)) {
    clarification ??= { role: "from", status: "unsupported" };
    from = undefined;
  }
  if (to && !journeyDestinations.includes(to)) {
    clarification ??= { role: "to", status: "unsupported" };
    to = undefined;
  }

  let error;
  if (
    !request ||
    clarification?.status === "missing" ||
    (!to && !clarification)
  ) {
    error = "Of course. Where would you like to go?";
    clarification = { role: "to", status: "missing" };
  } else if (clarification?.status === "unsupported") {
    error = unavailableJourneyDestination(clarification.role);
  } else if (clarification?.status === "ambiguous") {
    error = `Did you mean ${clarification.candidates.map(({ name }) => name).join(" or ")}?`;
  } else if (clarification) {
    error =
      clarification.role === "from"
        ? "I couldn't find that place. Could you say your starting point again?"
        : "I couldn't find that place. Could you say the destination again?";
  } else if (from === to) {
    error =
      "You're already starting there. Where would you like to go instead?";
    clarification = { role: "to", status: "missing" };
  }

  return {
    from: from?.name,
    to: to?.name,
    style,
    walking,
    avoidModes,
    green: requestedStyle ? greenPattern.test(request) : Boolean(context.green),
    accessibility:
      /\b(wheelchair|wheel chair|accessible|accessibility|step free|barrier free)\b/.test(
        request,
      ) || Boolean(context.accessibility),
    compareCost:
      /\b(cheaper|less expensive|lower cost|lower fare)\b/.test(request) &&
      from === contextFrom &&
      to === contextTo,
    currentStyle: context.route?.id ?? context.selected?.id ?? context.style,
    currentWalking: context.walking === "low" ? "low" : "include",
    clarification,
    error,
  };
}
