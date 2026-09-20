import { locations } from "../data/network.js";

export const normalizeRequest = (text) =>
  String(text ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[‐‑–—-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const placeName = (text) =>
  normalizeRequest(text?.name ?? text)
    .replace(/^[\s.,!?]+|[\s.,!?]+$/g, "")
    .replace(/^the\s+/, "");
const entries = locations.flatMap((location) =>
  [location.name, ...(location.aliases ?? [])].map((name) => ({
    name: placeName(name),
    location,
  })),
);
const escapePattern = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const namesPattern = entries
  .map(({ name }) => escapePattern(name))
  .sort((a, b) => b.length - a.length)
  .join("|");

/** Exact aliases only: appropriate for URLs and persisted journey values. */
export function findLocation(value) {
  return entries.find(({ name }) => name === placeName(value))?.location;
}

/** Longest whole-name match wins, so Colombo Airport never becomes Colombo. */
export function findLocationMentions(text) {
  return [
    ...normalizeRequest(text).matchAll(
      new RegExp(`\\b(${namesPattern})\\b`, "g"),
    ),
  ].map((match) => ({
    location: findLocation(match[0]),
    index: match.index,
    end: match.index + match[0].length,
  }));
}

// Damerau-Levenshtein distance also tolerates one adjacent letter transposition.
function editDistance(a, b) {
  const rows = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) =>
      i === 0 ? j : j === 0 ? i : 0,
    ),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + Number(a[i - 1] !== b[j - 1]),
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
    }
  }
  return rows[a.length][b.length];
}

/** Resolve a place phrase, not an arbitrary sentence. Never silently break ties. */
export function resolveLocation(text) {
  const query = placeName(text);
  const exact = findLocation(query);
  if (exact) return { status: "resolved", location: exact, match: "exact" };

  if (/\s+or\s+/.test(query)) {
    const alternatives = query
      .split(/\s+or\s+/)
      .map((part) => resolveLocation(part));
    const candidates = [
      ...new Set(
        alternatives.flatMap((item) =>
          item.location ? [item.location] : (item.candidates ?? []),
        ),
      ),
    ];
    if (candidates.length > 1) return { status: "ambiguous", candidates };
    // An unknown alternative is not permission to select the known one.
    return { status: "unknown", query };
  }

  if (query.length < 5 || query.length > 55)
    return { status: "unknown", query };
  const candidates = new Set();
  for (const { name, location } of entries) {
    if (name.length < 5 || Math.abs(name.length - query.length) > 2) continue;
    const distance = editDistance(query, name);
    const maxEdits = Math.min(query.length, name.length) >= 9 ? 2 : 1;
    if (
      distance <= maxEdits &&
      distance / Math.max(query.length, name.length) <= 0.22
    )
      candidates.add(location);
  }
  if (candidates.size === 1)
    return { status: "resolved", location: [...candidates][0], match: "fuzzy" };
  if (candidates.size > 1)
    return { status: "ambiguous", candidates: [...candidates] };
  return { status: "unknown", query };
}
