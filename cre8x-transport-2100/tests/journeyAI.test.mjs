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
} = await server.ssrLoadModule("/src/utils/journeyAI.js");
const { buildRoutes, journeyQuery, readJourney, formatFare } =
  await server.ssrLoadModule("/src/data/journeys.js");
const { locations, comparisonTags } = await server.ssrLoadModule(
  "/src/data/network.js",
);
const plan = (text, context) => recommend(parse(text, context));
const { resolveLocation, findLocation, findLocationMentions } =
  await server.ssrLoadModule("/src/utils/locationResolver.js");
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
  // Exercise every network pair, walking setting, preference and exclusion subset.
  for (const from of locations)
    for (const to of locations) {
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

test("catalogue covers every requested place with unique canonical names and Sri Lankan coordinates", () => {
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
    assert.equal(plan(`Take me to ${phrase}`).to.name, canonical, phrase);
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
    "I want to go Rathnapura",
    "I want to go to Rathnapura",
    "take me Rathnapura",
    "take me to Rathnapura",
    "I need to get to Rathnapura",
    "how can I reach Rathnapura",
    "can you take me to Rathnapura",
    "plan a trip to Rathnapura",
    "find a route for Rathnapura",
    "Rathnapura please",
    "from Maharagama to Rathnapura",
    "I am in Maharagama and need to get to Rathnapura",
  ]) {
    const result = plan(text);
    assert.equal(result.status, "success", `${text}: ${result.message}`);
    assert.equal(result.to.name, "Rathnapura", text);
    assert.equal(result.from.name, "Maharagama", text);
  }
  const examples = [
    ["I want to go to Rathnapura.", "Rathnapura", "recommended"],
    ["I want to go Rathnapura.", "Rathnapura", "recommended"],
    ["Rathnapura please.", "Rathnapura", "recommended"],
    [
      "Take me from Colombo to Rathnapura.",
      "Rathnapura",
      "recommended",
      "include",
      [],
      "Colombo",
    ],
    ["Give me the fastest way to Matara.", "Matara", "fastest"],
    [
      "I want to visit Nuwara Eliya but I can't walk much.",
      "Nuwara Eliya",
      "recommended",
      "low",
    ],
    [
      "I'm travelling with my grandmother to Kandy.",
      "Kandy",
      "comfortable",
      "low",
    ],
    ["Take me to Jaffna as cheaply as possible.", "Jaffna", "eco"],
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
    const result = plan(`fastest to Matara, ${phrase}`);
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
    "Take me to Rathnapura.",
    "Fastest.",
    "No air taxi.",
    "Make it cheaper.",
  ]) {
    ({ conversation: state, result } = turn(phrase, state));
    assert.equal(result.status, "success", phrase);
    assert.equal(state.to, "Rathnapura", phrase);
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
  ({ conversation: state } = turn("Start from Colombo.", state));
  assert.equal(state.from, "Colombo");
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
  assert.equal(turn("Fastest", state).result.message, "Of course. Where would you like to go?");
  ({ conversation: state, result } = turn("Rathnapura.", state));
  assert.equal(result.to.name, "Rathnapura");
  ({ conversation: state, result } = turn("Take me there cheaply.", state));
  assert.equal(result.to.name, "Rathnapura");
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
  ({ conversation: state, result } = turn("Jaffna", state));
  assert.equal(result.to.name, "Jaffna");
  assert.equal(state.style, "eco");
  assert.deepEqual(state.avoidModes, ["air"]);
  ({ conversation: state, result } = turn("from Atlantis to Kandy", state));
  assert.match(result.message, /starting point again/);
  ({ conversation: state, result } = turn("Fastest", state));
  assert.equal(result.status, "error");
  ({ conversation: state, result } = turn("Colombo", state));
  assert.equal(result.from.name, "Colombo");
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
  let { conversation: state, result } = turn(
    "Fastest to Rathnapura, no air taxi",
  );
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
        `from=Colombo&to=Matara&style=simplest&walking=${walking}`,
      ),
    );
    const state = start(journey);
    assert.deepEqual(state.route, journey.selected);
    const answer = turn("How much is it?", state).result;
    assert.equal(answer.route.id, "simplest");
    assert.ok(respond(answer).includes(formatFare(journey.selected.cost)));
    assert.match(respond(turn("Why did you choose this?", state).result), /selected on your current journey/);
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
