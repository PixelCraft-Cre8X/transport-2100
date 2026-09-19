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
