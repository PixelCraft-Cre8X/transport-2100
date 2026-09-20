/**
 * Optional future fallback; deliberately not used to invent network availability.
 * Mapbox v6: https://docs.mapbox.com/api/search/geocoding/#forward-geocoding
 * Results are ephemeral. Only the existing public browser token is accepted.
 */
export async function geocodeSriLankanPlace(
  query,
  {
    token = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN,
    fetcher = globalThis.fetch,
    signal,
  } = {},
) {
  if (
    !query?.trim() ||
    !token?.startsWith("pk.") ||
    !fetcher ||
    signal?.aborted
  )
    return [];
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, 5000);
  try {
    const params = new URLSearchParams({
      q: query.trim(),
      access_token: token,
      country: "lk",
      types: "place,locality,district",
      limit: "3",
      autocomplete: "false",
      language: "en",
    });
    const response = await fetcher(
      `https://api.mapbox.com/search/geocode/v6/forward?${params}`,
      { signal: controller.signal },
    );
    if (!response.ok) return [];
    const data = await response.json();
    const found = new Map();
    for (const feature of Array.isArray(data.features) ? data.features : []) {
      const properties = feature.properties;
      const coordinates = feature.geometry?.coordinates;
      const country = properties?.context?.country?.country_code?.toLowerCase();
      if (
        country !== "lk" ||
        !["place", "locality", "district"].includes(properties?.feature_type) ||
        !properties?.name ||
        feature.geometry?.type !== "Point" ||
        !Array.isArray(coordinates) ||
        coordinates.length !== 2 ||
        !coordinates.every(Number.isFinite)
      )
        continue;
      const [longitude, latitude] = coordinates;
      if (longitude < 79.4 || longitude > 82 || latitude < 5.8 || latitude > 10)
        continue;
      const location = {
        name: properties.name,
        coordinates: [...coordinates],
        source: "mapbox",
      };
      found.set(
        `${location.name.toLowerCase()}:${coordinates.join()}`,
        location,
      );
    }
    return [...found.values()];
  } catch {
    // Offline, denied, malformed and timed-out requests leave the local resolver usable.
    return [];
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}
