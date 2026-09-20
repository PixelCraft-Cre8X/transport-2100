// Run with: node --test tests/journeyAI.test.mjs
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  cacheDir: "node_modules/.vite-journey-ai-tests",
  server: { middlewareMode: true, hmr: false },
});
after(() => server.close());
const {
  parseJourneyRequest: parse,
  recommendJourney: recommend,
  createJourneyAIResponse: respond,
  getJourneyAIContext: getAIContext,
} = await server.ssrLoadModule("/src/utils/journeyAI.js");
const { buildRoutes, journeyQuery, readJourney, formatFare } =
  await server.ssrLoadModule("/src/data/journeys.js");
const { locations, comparisonTags } = await server.ssrLoadModule(
  "/src/data/network.js",
);
const plan = (text, context) => recommend(parse(text, context));
const { resolveLocation, findLocation, findLocationMentions } =
  await server.ssrLoadModule("/src/utils/locationResolver.js");
const { journeyDestinations } = await server.ssrLoadModule(
  "/src/utils/journeyDestinations.js",
);
const { createJourneyConversation: start, handleJourneyRequest: turn } =
  await server.ssrLoadModule("/src/utils/journeyConversation.js");
const { geocodeSriLankanPlace: geocode } = await server.ssrLoadModule(
  "/src/utils/locationGeocoding.js",
);
const context = {
  from: "Maharagama",
  to: "Galle",
  style: "recommended",
  walking: "include",
};

test("Journey AI greeting follows the current journey context", () => {
  const from = findLocation("Maharagama");
  const to = findLocation("Galle");
  const route = buildRoutes(from, to, "include")[0];

  assert.equal(
    getAIContext({ pathname: "/", from: null, to: null, route: null }).greeting,
    " Hi, I’m Journey AI. Where would you like to go?",
  );
  assert.match(
    getAIContext({ pathname: "/journey", from, to, route: null }).greeting,
    /journey from Maharagama to Galle/,
  );
  assert.match(
    getAIContext({ pathname: "/journey", from, to, route }).greeting,
    /route to Galle is ready/,
  );
  assert.match(
    getAIContext({ pathname: "/tracking", from, to, route }).greeting,
    /current journey to Galle/,
  );
});

function conversationTurns(phrases, conversation = start()) {
  let response;
  for (const phrase of phrases) {
    response = turn(phrase, conversation);
    conversation = response.conversation;
  }
  return response;
}

test("acceptance remembers the exact recommendation and asks before starting", () => {
  const recommended = turn("Take me to Galle.");
  for (const phrase of [
    "I'll take this one.",
    "I’ll take that one.",
    "I will take this route",
    "Choose this route",
    "Select this",
    "Use this journey",
    "This one is fine",
    "That route is fine",
    "Let's go",
    "Okay, use this",
    "Yes, this one",
    "Please select this route",
  ]) {
    const accepted = turn(phrase, recommended.conversation);
    assert.equal(accepted.conversation.accepted, true, phrase);
    assert.equal(
      accepted.conversation.selectedRoute,
      recommended.result.route,
      phrase,
    );
    assert.equal(
      accepted.conversation.selectedJourney,
      recommended.conversation.lastResult,
    );
    assert.equal(accepted.navigation, undefined, phrase);
    assert.match(respond(accepted.result), /selected this journey to Galle/);
    assert.match(
      respond(accepted.result),
      /Would you like me to start live guidance/,
    );
  }
});

test("acceptance followed by a start phrase opens booking for the exact journey", () => {
  const accepted = conversationTurns([
    "Take me from Colombo Fort to Galle with less walking, without air taxi.",
    "I'll take this one.",
  ]);
  for (const phrase of [
    "Yes.",
    "Yes, start",
    "Start",
    "Start the journey",
    "Let's go",
    "Start tracking",
    "Guide me",
    "Begin navigation",
    "Take me there",
  ]) {
    const started = turn(phrase, accepted.conversation);
    const url = new URL(started.navigation, "https://moveone.test");
    assert.equal(url.pathname, "/journey", phrase);
    assert.equal(url.searchParams.get("booking"), "1", phrase);
    const reopened = readJourney(url.searchParams);
    assert.equal(reopened.from.name, "Colombo Fort", phrase);
    assert.equal(reopened.to.name, "Galle", phrase);
    assert.equal(reopened.walking, "low", phrase);
    assert.deepEqual(
      reopened.selected,
      accepted.conversation.selectedRoute,
      phrase,
    );
    assert.deepEqual(started.conversation.avoidModes, ["air"]);
    assert.equal(started.conversation.awaitingStart, false);
  }
});

test("view journey opens the current recommendation in My Journey", () => {
  const recommended = turn("Take me to Galle");
  for (const phrase of [
    "View journey",
    "Show my journey",
    "View my journey page",
    "Open the My Journey tab",
    "Go to my journey",
  ]) {
    const viewed = turn(phrase, recommended.conversation);
    const url = new URL(viewed.navigation, "https://moveone.test");
    assert.equal(url.pathname, "/journey", phrase);
    assert.equal(url.searchParams.get("booking"), null, phrase);
    assert.deepEqual(
      readJourney(url.searchParams).selected,
      recommended.result.route,
      phrase,
    );
  }
});

test("cheaper follow-up is the journey selected and opened in Tracking", () => {
  const recommended = turn("Take me to Galle.");
  const cheaper = turn("Make it cheaper.", recommended.conversation);
  assert.ok(cheaper.result.route.cost < recommended.result.route.cost);
  const started = conversationTurns(
    ["I'll take that one.", "Start tracking."],
    cheaper.conversation,
  );
  const url = new URL(started.navigation, "https://moveone.test");
  assert.deepEqual(
    readJourney(url.searchParams).selected,
    cheaper.result.route,
  );
  assert.equal(url.searchParams.get("style"), cheaper.result.route.id);
});

test("explicit start can accept and launch the current recommendation in one turn", () => {
  const recommended = turn("Fastest to Kandy without air taxi");
  for (const phrase of ["Start this journey", "Start trip", "Start tracking"]) {
    const started = turn(phrase, recommended.conversation);
    assert.equal(started.conversation.accepted, true);
    const url = new URL(started.navigation, "https://moveone.test");
    assert.deepEqual(
      readJourney(url.searchParams).selected,
      recommended.result.route,
    );
    assert.equal(url.searchParams.get("style"), recommended.result.route.id);
  }
});

test("bare agreement never starts an unaccepted or cancelled journey", () => {
  const recommended = turn("Take me to Kandy");
  assert.equal(turn("Yes", recommended.conversation).navigation, undefined);
  const cancelled = conversationTurns(
    ["Select this", "Cancel journey"],
    recommended.conversation,
  );
  assert.equal(cancelled.conversation.accepted, false);
  assert.equal(cancelled.conversation.selectedRoute, null);
  assert.equal(cancelled.conversation.recommendedRoute, null);
  for (const phrase of ["Yes", "Start tracking", "I'll take this one"]) {
    assert.equal(turn(phrase).navigation, undefined, phrase);
    assert.equal(
      turn(phrase, cancelled.conversation).navigation,
      undefined,
      phrase,
    );
  }
  const waiting = conversationTurns(
    ["Select this", "Not yet"],
    recommended.conversation,
  );
  assert.equal(waiting.conversation.accepted, true);
  assert.equal(turn("Yes", waiting.conversation).navigation, undefined);
  assert.ok(turn("Start tracking", waiting.conversation).navigation);
});

test("rejection and another option keep the destination and choose different valid routes", () => {
  let response = turn("Take me to Kandy without air taxi");
  const routeIds = new Set([response.result.route.id]);
  for (const phrase of ["I don't like this one.", "Show me another option."]) {
    response = turn(phrase, response.conversation);
    assert.equal(response.result.status, "success");
    assert.equal(response.conversation.to, "Kandy");
    assert.ok(!routeIds.has(response.result.route.id), phrase);
    assert.ok(
      response.result.route.segments.every(({ mode }) => mode !== "air"),
    );
    routeIds.add(response.result.route.id);
  }
  for (const phrase of [
    "Show me another one",
    "Another route",
    "Give me another option",
    "Change route",
  ]) {
    const original = turn("Take me to Kandy");
    const alternative = turn(phrase, original.conversation);
    assert.equal(alternative.conversation.to, "Kandy");
    assert.notEqual(
      alternative.result.route.id,
      original.result.route.id,
      phrase,
    );
  }
});

test("questions retain selection, while new route requests clear the previous acceptance", () => {
  const accepted = conversationTurns(["Take me to Kandy", "Select this"]);
  for (const phrase of ["How long will it take?", "Read directions"]) {
    const answer = turn(phrase, accepted.conversation);
    assert.equal(
      answer.conversation.selectedRoute,
      accepted.conversation.selectedRoute,
    );
    assert.equal(answer.conversation.accepted, true);
    assert.ok(respond(answer.result).includes("minutes"));
    assert.equal(answer.navigation, undefined);
  }
  for (const phrase of [
    "Something cheaper",
    "Something faster",
    "Less walking",
    "Change route",
    "Take me to Galle",
    "Take me to Atlantis",
  ]) {
    const changed = turn(phrase, accepted.conversation);
    assert.equal(changed.conversation.accepted, false, phrase);
    assert.equal(changed.conversation.selectedJourney, null, phrase);
    assert.equal(
      turn("Yes", changed.conversation).navigation,
      undefined,
      phrase,
    );
  }
  assert.equal(
    turn("Don't start the journey", accepted.conversation).navigation,
    undefined,
  );
  const newOrigin = turn("Yes, start from Colombo Fort", accepted.conversation);
  assert.equal(newOrigin.navigation, undefined);
  assert.equal(newOrigin.conversation.from, "Colombo Fort");
});

test("rejecting an accepted route cannot leave a pending start when alternatives run out", () => {
  let response = turn("Take me to Kandy without air taxi");
  for (let count = 0; count < 10; count++) {
    response = turn("Show me another option", response.conversation);
    if (response.result.kind === "answer") break;
  }
  assert.match(response.result.message, /shown all the options/);
  response = turn("Select this", response.conversation);
  assert.equal(response.conversation.accepted, true);
  response = turn("I don't like this one", response.conversation);
  assert.equal(response.conversation.accepted, false);
  assert.equal(response.conversation.selectedJourney, null);
  assert.equal(turn("Yes", response.conversation).navigation, undefined);
  assert.equal(response.conversation.to, "Kandy");
});

test("opening on an existing selected Journey preserves its route and walking preference", () => {
  const seeded = start({
    ...context,
    style: "comfortable",
    walking: "low",
    accepted: true,
  });
  assert.equal(seeded.accepted, true);
  assert.equal(seeded.selectedRoute, seeded.route);
  const started = turn("Start tracking", seeded);
  const url = new URL(started.navigation, "https://moveone.test");
  assert.equal(url.searchParams.get("style"), "comfortable");
  assert.equal(url.searchParams.get("walking"), "low");
  assert.deepEqual(
    readJourney(url.searchParams).selected,
    seeded.selectedRoute,
  );
});

test("all supplied preference phrases map to their existing style", () => {
  const phrases = {
    fastest: ["fastest", "quickest", "as fast as possible", "shortest time"],
    eco: [
      "cheapest",
      "cheaper",
      "cheap",
      "budget",
      "lowest fare",
      "save money",
      "green",
      "greenest",
      "eco",
      "environment friendly",
      "environmentally friendly",
    ],
    simplest: [
      "simple",
      "simplest",
      "direct",
      "few transfers",
      "fewer transfers",
      "no transfer",
      "easy connection",
    ],
    comfortable: [
      "comfortable",
      "comfort",
      "quiet",
      "relax",
      "elderly",
      "grandmother",
      "grandfather",
      "senior",
    ],
    healthy: ["healthy", "walking", "exercise", "walk more"],
  };
  for (const [style, terms] of Object.entries(phrases)) {
    for (const term of terms)
      assert.equal(parse(`${term} to Kandy`).style, style, term);
  }
  assert.equal(parse("Take me to Kandy").style, "recommended");
});

test("locations use case-insensitive whole names, with explicit directions in either order", () => {
  for (const text of [
    "from kAnDy to COLOMBO FORT",
    "to Colombo Fort from Kandy",
  ]) {
    const intent = parse(text);
    assert.equal(intent.from, "Kandy");
    assert.equal(intent.to, "Colombo Fort");
    assert.equal(intent.error, undefined);
  }
  assert.equal(parse("Take me to Port   City").to, "Port City");
  assert.equal(
    parse("Maharagama to Kandy", { from: "Galle" }).from,
    "Maharagama",
  );
  assert.ok(parse("Take me to Kandyland").error);
});

test("destination-only and contextual requests retain the appropriate trip", () => {
  assert.equal(parse("Take me to Colombo Fort").from, "Maharagama");
  assert.equal(
    parse("Take me to Colombo Fort", { from: "Kandy" }).from,
    "Kandy",
  );
  for (const text of [
    "Find me a cheaper option",
    "Give me the fastest option",
    "I am travelling with my grandmother. Give me an easy route with less walking.",
  ]) {
    const intent = parse(text, context);
    assert.equal(intent.from, context.from);
    assert.equal(intent.to, context.to);
    assert.equal(intent.error, undefined);
  }
  assert.equal(parse("I want to save money", context).style, "eco");
});

test("missing, unsupported and identical places require clarification, even with context", () => {
  for (const text of [
    "hello",
    "Find me a cheaper option",
    "from Maharagama",
    "from Maharagama to Maharagama",
    "Take me to Atlantis",
  ]) {
    assert.equal(plan(text).status, "error", text);
  }
  for (const text of [
    "from Atlantis to Kandy",
    "Take me to Atlantis",
    "from Kandy to Atlantis",
  ]) {
    assert.equal(plan(text, context).status, "error", text);
  }
  assert.equal(plan("   ", context).status, "error");
});

test("reduced walking and accessibility never accidentally select Healthy", () => {
  const terms = [
    "wheelchair",
    "accessible",
    "accessibility",
    "step-free",
    "less walking",
    "minimum walking",
    "minimize walking",
    "difficulty walking",
    "elderly",
    "grandmother",
    "grandfather",
    "senior",
  ];
  for (const term of terms) {
    const result = plan(`${term} to Kandy`);
    assert.equal(result.intent.walking, "low", term);
    assert.notEqual(result.route.id, "healthy", term);
    assert.equal(result.route.walk, 2, term);
  }
  const wheelchair = plan(
    "I need a wheelchair-friendly route to Kandy with less walking.",
  );
  assert.match(respond(wheelchair), /step-free paths/);
  assert.doesNotMatch(
    respond(wheelchair),
    /wheelchair equipment|seat availability|crowd/i,
  );
  assert.equal(plan("walk more to Kandy").route.id, "healthy");
});

test("avoidance handles articles, plural modes, curly apostrophes and joined exclusions", () => {
  for (const phrase of [
    "avoid air taxi",
    "don't use air taxi",
    "don't use air taxis",
    "don’t use an air taxi",
    "no air transport",
    "without air travel",
  ]) {
    assert.deepEqual(
      parse(`fastest to Colombo Fort but ${phrase}`).avoidModes,
      ["air"],
      phrase,
    );
  }
  assert.deepEqual(parse("to Galle, avoid bus").avoidModes, ["bus"]);
  assert.deepEqual(parse("to Galle, avoid SkyRail").avoidModes, ["rail"]);
  assert.deepEqual(parse("to Galle, no train").avoidModes, ["rail"]);
  assert.deepEqual(parse("to Galle, avoid air taxi and bus").avoidModes, [
    "air",
    "bus",
  ]);
  assert.deepEqual(
    parse("to Galle, avoid air taxi, bus, and rail").avoidModes,
    ["air", "bus", "rail"],
  );
  assert.deepEqual(
    parse("to Galle, don't use an air taxi or a bus").avoidModes,
    ["air", "bus"],
  );
  assert.deepEqual(parse("to Galle, avoid bus but use SkyRail").avoidModes, [
    "bus",
  ]);
  assert.deepEqual(parse("to Galle on SkyRail").avoidModes, []);
});

test("fastest without air uses the shortest actual valid duration", () => {
  const result = plan(
    "Find me the fastest route from Maharagama to Colombo Fort but don't use air taxis.",
  );
  const valid = buildRoutes(result.from, result.to, "include").filter(
    (route) => !route.segments.some(({ mode }) => mode === "air"),
  );
  assert.equal(
    result.route.duration,
    Math.min(...valid.map(({ duration }) => duration)),
  );
  assert.notEqual(result.route.id, "fastest");
  assert.ok(result.route.segments.every(({ mode }) => mode !== "air"));
});

test("lowest fare, fewest transfers and style fallbacks use generated data", () => {
  const cheap = plan("What is the cheapest way to Galle?");
  assert.equal(
    cheap.route.cost,
    Math.min(
      ...buildRoutes(cheap.from, cheap.to, "include").map(({ cost }) => cost),
    ),
  );
  const simple = plan("simplest to Galle, avoid air taxi");
  assert.equal(simple.route.transfers, 0);
  assert.equal(simple.route.id, "simplest");
  assert.equal(plan("comfortable to Galle").route.id, "comfortable");
  assert.equal(
    plan("comfortable to Galle, avoid bus and air taxi").route.id,
    "simplest",
  );
  assert.equal(plan("healthy to Galle, avoid rail").route.id, "fastest");
  assert.equal(plan("to Galle").route.id, "recommended");
  assert.equal(plan("to Galle, avoid bus and air taxi").route.id, "simplest");
});

test("impossible exclusions return no recommendation", () => {
  const result = plan("to Galle, no air transport and no train");
  assert.equal(result.status, "error");
  assert.equal(result.route, undefined);
  assert.match(respond(result), /No existing journey/);
});

test("green requests reference the Eco label without inventing emissions", () => {
  const green = plan("Find me the greenest route to Port City.");
  assert.equal(green.route.id, "eco");
  assert.match(respond(green), /Eco \/ Cost-saving/);
  const excluded = plan("greenest to Port City, avoid bus");
  assert.match(respond(excluded), /emissions data is not available/);
});

test("cheaper comparisons use the selected trip's actual fare", () => {
  const result = plan("Find me a cheaper option", context);
  assert.match(
    respond(result),
    new RegExp(
      `saves ${formatFare(result.currentRoute.cost - result.route.cost)}`,
    ),
  );
  const cheapest = plan("Find me a cheaper option", {
    ...context,
    style: "eco",
  });
  assert.match(respond(cheapest), /isn't a cheaper option/);
});

test("responses and navigation preserve every selected route's actual metrics", () => {
  // Exercise every available AI pair, walking setting, preference and exclusion subset.
  for (const from of journeyDestinations)
    for (const to of journeyDestinations) {
      if (from === to) continue;
      for (const walking of ["include", "low"])
        for (const { id: style } of comparisonTags) {
          for (let mask = 0; mask < 8; mask++) {
            const avoidModes = ["air", "bus", "rail"].filter(
              (_, index) => mask & (1 << index),
            );
            const result = recommend({
              from: from.name,
              to: to.name,
              walking,
              style,
              avoidModes,
            });
            if (result.status === "error") {
              assert.ok(
                buildRoutes(from, to, walking).every((route) =>
                  route.segments.some(({ mode }) => avoidModes.includes(mode)),
                ),
              );
              continue;
            }
            const { route } = result;
            assert.ok(
              route.segments.every(({ mode }) => !avoidModes.includes(mode)),
            );
            const query = journeyQuery(from.name, to.name, route.id, walking);
            const reopened = readJourney(new URLSearchParams(query));
            assert.deepEqual(reopened.selected, route);
            const response = respond(result);
            assert.ok(response.includes(formatFare(route.cost)));
            assert.ok(response.includes(`${route.duration} minutes`));
            assert.ok(response.includes(`${route.walk} minutes of walking`));
          }
        }
    }
});

test("Journey AI offers exactly the eight destinations with dedicated photos", () => {
  assert.deepEqual(
    journeyDestinations.map(({ name }) => name),
    [
      "Maharagama",
      "Galle",
      "Colombo Fort",
      "Kandy",
      "Bandaranaike International Airport",
      "Port City",
      "Makumbura",
      "Kalutara",
    ],
  );
  for (const destination of journeyDestinations) {
    const from = destination.name === "Maharagama" ? "Kandy" : "Maharagama";
    const result = plan(`From ${from} to ${destination.name}`);
    assert.equal(result.status, "success", destination.name);
    assert.equal(result.to, destination);
    assert.ok(result.from.image && result.to.image);
  }
  for (const phrase of ["Airport", "BIA", "Fort", "Makumbra", "Kaluthara"])
    assert.equal(plan(`Take me to ${phrase}`).status, "success", phrase);
});

test("destinations without photos cannot be planned through names, aliases, typos or raw intents", () => {
  for (const location of locations.filter(({ image }) => !image)) {
    for (const name of [location.name, ...(location.aliases ?? [])]) {
      for (const phrase of [
        `Take me to ${name}`,
        `From ${name} to Kandy`,
        `${name} to Kandy`,
        `Take me to ${name} or Galle`,
      ]) {
        const result = plan(phrase, context);
        assert.equal(result.status, "error", phrase);
        assert.equal(result.route, undefined, phrase);
        assert.match(
          result.message,
          /isn't available in Journey AI yet/,
          phrase,
        );
        for (const { name: supported } of journeyDestinations)
          assert.ok(result.message.includes(supported), phrase);
      }
    }
    const intent = {
      from: "Maharagama",
      to: location.name,
      walking: "include",
      style: "fastest",
      avoidModes: [],
    };
    assert.equal(recommend(intent).status, "error", location.name);
    assert.equal(
      recommend({ ...intent, from: location.name, to: "Kandy" }).status,
      "error",
      location.name,
    );
  }
  assert.equal(
    plan("Take me to Rathnpura").clarification.status,
    "unsupported",
  );
});

test("unavailable destinations clear an accepted route and recover without losing preferences", () => {
  let response = conversationTurns([
    "From Colombo Fort to Galle with less walking, no air taxi",
    "I'll take this one",
    "Take me to Rathnapura",
  ]);
  assert.equal(response.result.route, undefined);
  assert.equal(response.conversation.accepted, false);
  assert.equal(response.conversation.selectedJourney, null);
  assert.equal(response.conversation.to, undefined);
  assert.equal(response.conversation.pendingPlace.status, "unsupported");
  assert.equal(
    turn("Start tracking", response.conversation).navigation,
    undefined,
  );
  assert.equal(turn("Yes", response.conversation).navigation, undefined);
  response = turn("Kalutara", response.conversation);
  assert.equal(response.result.status, "success");
  assert.equal(response.conversation.from, "Colombo Fort");
  assert.equal(response.conversation.to, "Kalutara");
  assert.equal(response.conversation.walking, "low");
  assert.deepEqual(response.conversation.avoidModes, ["air"]);
  const started = conversationTurns(
    ["Select this", "Yes"],
    response.conversation,
  );
  const url = new URL(started.navigation, "https://moveone.test");
  assert.equal(url.searchParams.get("to"), "Kalutara");
  assert.equal(url.searchParams.get("walking"), "low");
});

test("existing page context cannot seed or start an unavailable Journey AI route", () => {
  for (const [from, to, replacement, role] of [
    ["Maharagama", "Rathnapura", "Galle", "to"],
    ["Colombo", "Kandy", "Colombo Fort", "from"],
  ]) {
    const state = start({
      from,
      to,
      style: "comfortable",
      walking: "low",
      accepted: true,
    });
    assert.equal(state.accepted, false);
    assert.equal(state.route, undefined);
    assert.equal(state.pendingPlace.role, role);
    assert.equal(turn("Start tracking", state).navigation, undefined);
    const recovered = turn(replacement, state);
    assert.equal(recovered.result.status, "success");
    assert.equal(recovered.conversation[role], replacement);
    assert.equal(recovered.conversation.style, "comfortable");
    assert.equal(recovered.conversation.walking, "low");
  }
});

test("catalogue retains map locations with unique canonical names and Sri Lankan coordinates", () => {
  const required = [
    "Maharagama",
    "Colombo Fort",
    "Colombo",
    "Port City",
    "Moratuwa",
    "Panadura",
    "Kalutara",
    "Beruwala",
    "Bentota",
    "Ambalangoda",
    "Hikkaduwa",
    "Galle",
    "Matara",
    "Hambantota",
    "Rathnapura",
    "Kandy",
    "Nuwara Eliya",
    "Ella",
    "Badulla",
    "Kurunegala",
    "Anuradhapura",
    "Polonnaruwa",
    "Jaffna",
    "Trincomalee",
    "Batticaloa",
    "Negombo",
    "Katunayake",
    "Bandaranaike International Airport",
    "Makumbura",
  ];
  assert.equal(
    new Set(locations.map(({ name }) => name)).size,
    locations.length,
  );
  for (const name of required) {
    const location = findLocation(name);
    assert.ok(location, name);
    const [lon, lat] = location.coordinates;
    assert.ok(lon > 79.4 && lon < 82 && lat > 5.8 && lat < 10, name);
  }
});

test("aliases and conservative typo matching resolve canonical objects without prefix collisions", () => {
  const examples = {
    fort: "Colombo Fort",
    "COLOMBO FORT STATION": "Colombo Fort",
    Airport: "Bandaranaike International Airport",
    BIA: "Bandaranaike International Airport",
    "Katunayake Airport": "Bandaranaike International Airport",
    "Colombo Airport": "Bandaranaike International Airport",
    Nuwaraeliya: "Nuwara Eliya",
    Ratnapura: "Rathnapura",
    Anuradapura: "Anuradhapura",
    Trinco: "Trincomalee",
    Rathnpura: "Rathnapura",
    Kandy: "Kandy",
    "Port City": "Port City",
  };
  for (const [phrase, canonical] of Object.entries(examples)) {
    assert.equal(
      resolveLocation(phrase).location,
      findLocation(canonical),
      phrase,
    );
    const result = plan(`Take me to ${phrase}`);
    if (findLocation(canonical).image)
      assert.equal(result.to.name, canonical, phrase);
    else {
      assert.equal(result.status, "error", phrase);
      assert.equal(result.route, undefined, phrase);
      assert.match(result.message, /isn't available in Journey AI yet/, phrase);
    }
  }
  assert.deepEqual(
    findLocationMentions("Colombo Airport and Colombo Fort Station").map(
      ({ location }) => location.name,
    ),
    ["Bandaranaike International Airport", "Colombo Fort"],
  );
  for (const unknown of [
    "Atlantis",
    "Kandyland",
    "zzzzzzz",
    "Canada",
    "Nuwara",
  ])
    assert.equal(resolveLocation(unknown).status, "unknown", unknown);
  const ambiguous = resolveLocation("Colombo Fort or Port City");
  assert.equal(ambiguous.status, "ambiguous");
  assert.equal(ambiguous.location, undefined);
  const reopened = readJourney(
    new URLSearchParams("from=Fort&to=Airport&style=eco"),
  );
  assert.equal(reopened.from.name, "Colombo Fort");
  assert.equal(reopened.to.name, "Bandaranaike International Airport");
});

test("all requested destination sentence forms and ten acceptance phrases resolve", () => {
  for (const text of [
    "I want to go Galle",
    "I want to go to Galle",
    "take me Galle",
    "take me to Galle",
    "I need to get to Galle",
    "how can I reach Galle",
    "can you take me to Galle",
    "plan a trip to Galle",
    "find a route for Galle",
    "Galle please",
    "from Maharagama to Galle",
    "I am in Maharagama and need to get to Galle",
  ]) {
    const result = plan(text);
    assert.equal(result.status, "success", `${text}: ${result.message}`);
    assert.equal(result.to.name, "Galle", text);
    assert.equal(result.from.name, "Maharagama", text);
  }
  const examples = [
    ["I want to go to Galle.", "Galle", "recommended"],
    ["I want to go Galle.", "Galle", "recommended"],
    ["Galle please.", "Galle", "recommended"],
    [
      "Take me from Colombo Fort to Galle.",
      "Galle",
      "recommended",
      "include",
      [],
      "Colombo Fort",
    ],
    ["Give me the fastest way to Kalutara.", "Kalutara", "fastest"],
    [
      "I want to visit Port City but I can't walk much.",
      "Port City",
      "recommended",
      "low",
    ],
    [
      "I'm travelling with my grandmother to Kandy.",
      "Kandy",
      "comfortable",
      "low",
    ],
    ["Take me to Makumbura as cheaply as possible.", "Makumbura", "eco"],
    [
      "Get me to the airport without an air taxi.",
      "Bandaranaike International Airport",
      "recommended",
      "include",
      ["air"],
    ],
    [
      "Take me to Galle, no bus please.",
      "Galle",
      "recommended",
      "include",
      ["bus"],
    ],
  ];
  for (const [
    phrase,
    to,
    style,
    walking = "include",
    avoid = [],
    from = "Maharagama",
  ] of examples) {
    const result = plan(phrase);
    assert.equal(result.status, "success", `${phrase}: ${result.message}`);
    assert.equal(result.to.name, to, phrase);
    assert.equal(result.from.name, from, phrase);
    assert.equal(result.intent.style, style, phrase);
    assert.equal(result.intent.walking, walking, phrase);
    assert.deepEqual(result.intent.avoidModes, avoid, phrase);
    assert.ok(result.route.segments.every(({ mode }) => !avoid.includes(mode)));
  }
});

test("natural preferences and avoidance phrases retain hard constraints", () => {
  const preferences = {
    fastest: ["fast", "quick", "hurry", "I'm late", "get there soon"],
    eco: [
      "affordable",
      "low fare",
      "lowest price",
      "don't spend much",
      "cheaply",
      "low emission",
      "sustainable",
    ],
    comfortable: ["relaxing", "less crowded", "easy journey", "smooth journey"],
    simplest: ["few changes", "don't want to change", "easy to follow"],
  };
  for (const [style, phrases] of Object.entries(preferences))
    for (const phrase of phrases)
      assert.equal(parse(`${phrase}, to Kandy`).style, style, phrase);
  for (const phrase of [
    "wheel chair",
    "step free",
    "can't walk far",
    "cannot walk far",
    "leg problem",
    "can't walk much",
    "travelling with a child",
    "travelling with kids",
    "travelling with luggage",
  ])
    assert.equal(plan(`to Kandy, ${phrase}`).route.walk, 2, phrase);
  for (const [phrase, mode] of [
    ["I don't like buses", "bus"],
    ["don't use SkyRail", "rail"],
    ["I'm afraid of flying", "air"],
    ["don't fly", "air"],
  ]) {
    const result = plan(`fastest to Kalutara, ${phrase}`);
    assert.ok(result.intent.avoidModes.includes(mode), phrase);
    assert.ok(
      result.route.segments.every((segment) => segment.mode !== mode),
      phrase,
    );
  }
});

test("multi-turn journey memory retains places and exclusions through preferences and questions", () => {
  let state = start();
  let result;
  for (const phrase of [
    "Take me to Galle.",
    "Fastest.",
    "No air taxi.",
    "Make it cheaper.",
  ]) {
    ({ conversation: state, result } = turn(phrase, state));
    assert.equal(result.status, "success", phrase);
    assert.equal(state.to, "Galle", phrase);
  }
  assert.equal(state.style, "eco");
  assert.deepEqual(state.avoidModes, ["air"]);
  const route = result.route;
  for (const [question, expected] of [
    ["How long will it take?", `${route.duration} minutes`],
    ["How long does it take?", `${route.duration} minutes`],
    ["How much does it cost?", formatFare(route.cost)],
    ["What will it cost?", formatFare(route.cost)],
    ["How much is it?", formatFare(route.cost)],
    ["How many transfers?", `${route.transfers} transfer`],
    ["How much walking?", `${route.walk} minutes`],
    ["Which transport will I use?", "Smart Bus and SkyRail"],
    [
      "Is it step free?",
      "Vehicle boarding accessibility and equipment are not specified",
    ],
    ["Why did you choose this?", "lowest fare"],
    ["Is it crowded?", "doesn't confirm crowd levels"],
  ]) {
    const response = turn(question, state);
    assert.equal(response.conversation, state, question);
    assert.equal(response.result.route, route, question);
    assert.ok(respond(response.result).includes(expected), question);
  }
  ({ conversation: state } = turn("What about Kandy instead?", state));
  ({ conversation: state } = turn("Start from Colombo Fort.", state));
  assert.equal(state.from, "Colombo Fort");
  assert.equal(state.to, "Kandy");
  assert.equal(state.style, "eco");
  assert.deepEqual(state.avoidModes, ["air"]);
  ({ conversation: state } = turn("I can't walk far", state));
  ({ conversation: state } = turn("Fastest", state));
  assert.equal(state.walking, "low");
  assert.equal(state.route.walk, 2);
  assert.deepEqual(state.avoidModes, ["air"]);
});

test("clarifications retain known fields and preferences without silently reusing unknown places", () => {
  let { conversation: state, result } = turn("I need a journey.");
  assert.equal(result.message, "Of course. Where would you like to go?");
  assert.equal(
    turn("Fastest", state).result.message,
    "Of course. Where would you like to go?",
  );
  ({ conversation: state, result } = turn("Galle.", state));
  assert.equal(result.to.name, "Galle");
  ({ conversation: state, result } = turn("Take me there cheaply.", state));
  assert.equal(result.to.name, "Galle");
  assert.equal(state.style, "eco");
  ({ conversation: state, result } = turn(
    "Take me to Atlantis without air taxi",
    state,
  ));
  assert.equal(result.route, undefined);
  assert.equal(
    result.message,
    "I couldn't find that place. Could you say the destination again?",
  );
  assert.equal(state.to, undefined);
  ({ conversation: state, result } = turn("Makumbura", state));
  assert.equal(result.to.name, "Makumbura");
  assert.equal(state.style, "eco");
  assert.deepEqual(state.avoidModes, ["air"]);
  ({ conversation: state, result } = turn("from Atlantis to Kandy", state));
  assert.match(result.message, /starting point again/);
  ({ conversation: state, result } = turn("Fastest", state));
  assert.equal(result.status, "error");
  ({ conversation: state, result } = turn("Colombo Fort", state));
  assert.equal(result.from.name, "Colombo Fort");
  assert.equal(result.to.name, "Kandy");
  ({ conversation: state, result } = turn(
    "Take me to Colombo Fort or Port City",
    state,
  ));
  assert.match(result.message, /Did you mean Colombo Fort or Port City/);
  assert.equal(result.route, undefined);
  ({ result } = turn("Port City", state));
  assert.equal(result.to.name, "Port City");
});

test("alternatives and next-fastest use valid generated routes; cheaper never claims a false saving", () => {
  let { conversation: state, result } = turn("Fastest to Galle, no air taxi");
  const ordered = buildRoutes(result.from, result.to, "include")
    .filter((route) => !route.segments.some(({ mode }) => mode === "air"))
    .sort(
      (a, b) => a.duration - b.duration || a.walk - b.walk || a.cost - b.cost,
    );
  assert.equal(result.route.id, ordered[0].id);
  ({ conversation: state, result } = turn("What's the next fastest?", state));
  assert.equal(result.route.id, ordered[1].id);
  assert.match(respond(result), /next route in travel-time order/);
  ({ conversation: state, result } = turn(
    "Do you have another option?",
    state,
  ));
  assert.equal(result.route.id, ordered[2].id);
  ({ conversation: state, result } = turn("Is there a cheaper one?", state));
  assert.equal(result.route.cost, Math.min(...ordered.map(({ cost }) => cost)));
  const cheapest = result.route;
  ({ result } = turn("Is there a cheaper one?", state));
  assert.equal(result.route, cheapest);
  assert.match(respond(result), /isn't a cheaper option/);
  assert.doesNotMatch(respond(result), /saves/);
  ({ conversation: state } = turn(
    "to Kandy, no bus and no air taxi, less walking",
  ));
  ({ result } = turn("Another option", state));
  assert.equal(result.route.id, "simplest");
  assert.match(respond(result), /shown all the options/);
  ({ conversation: state, result } = turn("No train", state));
  assert.equal(result.route, undefined);
  assert.equal(result.status, "error");
  ({ result } = turn("Allow bus and rail", state));
  assert.equal(result.status, "success");
});

test("questions on an existing Journey/Tracking selection use that exact route", () => {
  for (const walking of ["include", "low"]) {
    const journey = readJourney(
      new URLSearchParams(
        `from=Colombo Fort&to=Kalutara&style=simplest&walking=${walking}`,
      ),
    );
    const state = start(journey);
    assert.deepEqual(state.route, journey.selected);
    const answer = turn("How much is it?", state).result;
    assert.equal(answer.route.id, "simplest");
    assert.ok(respond(answer).includes(formatFare(journey.selected.cost)));
    assert.match(
      respond(turn("Why did you choose this?", state).result),
      /selected on your current journey/,
    );
  }
  assert.equal(
    turn("How long does it take?").result.message,
    "Of course. Where would you like to go?",
  );
});

test("optional Mapbox helper restricts Sri Lanka, validates results and fails gracefully offline", async () => {
  let calls = 0;
  const fetcher = async (url) => {
    calls++;
    const params = new URL(url).searchParams;
    assert.equal(params.get("country"), "lk");
    assert.equal(params.get("types"), "place,locality,district");
    const feature = (name, country, coordinates, type = "place") => ({
      properties: {
        name,
        feature_type: type,
        context: { country: { country_code: country } },
      },
      geometry: { type: "Point", coordinates },
    });
    return {
      ok: true,
      json: async () => ({
        features: [
          feature("Dambulla", "LK", [80.6517, 7.86]),
          feature("Dambulla", "LK", [80.6517, 7.86]),
          feature("Overseas", "IN", [80, 8]),
          feature("Bad coordinate", "LK", [0, 0]),
          feature("Invalid", "LK", ["80", "8"]),
          feature("Address", "LK", [80, 8], "address"),
        ],
      }),
    };
  };
  assert.deepEqual(await geocode("Dambulla", { token: "", fetcher }), []);
  assert.deepEqual(
    await geocode("Dambulla", { token: "sk.secret", fetcher }),
    [],
  );
  assert.equal(calls, 0);
  assert.deepEqual(await geocode("Dambulla", { token: "pk.test", fetcher }), [
    { name: "Dambulla", coordinates: [80.6517, 7.86], source: "mapbox" },
  ]);
  assert.deepEqual(
    await geocode("Dambulla", {
      token: "pk.test",
      fetcher: async () => {
        throw new Error("offline");
      },
    }),
    [],
  );
  assert.deepEqual(
    await geocode("Dambulla", {
      token: "pk.test",
      fetcher: async () => ({ ok: false }),
    }),
    [],
  );
  const controller = new AbortController();
  controller.abort();
  assert.deepEqual(
    await geocode("Dambulla", {
      token: "pk.test",
      fetcher,
      signal: controller.signal,
    }),
    [],
  );
});
