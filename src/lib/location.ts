export type ResolvedPlace = {
  label: string;
  timezone: string;
  latitude: number;
  longitude: number;
};

type GeocodeHit = {
  name?: string;
  admin1?: string;
  country_code?: string;
  timezone?: string;
  latitude?: number;
  longitude?: number;
};

function cleanPlaceQuery(raw: string): string {
  return raw
    .trim()
    .replace(/[?.!]+$/g, "")
    .replace(/\s+/g, " ");
}

/** Resolve a city/place name to weather coords + IANA timezone via Open-Meteo. */
export async function resolvePlace(
  place: string,
): Promise<ResolvedPlace | null> {
  const q = cleanPlaceQuery(place);
  if (!q || q.length < 2) return null;

  const url =
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}` +
    `&count=5&language=en`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = (await res.json()) as { results?: GeocodeHit[] };
  const results = data.results || [];
  if (!results.length) return null;

  const preferred =
    results.find((r) => (r.country_code || "").toUpperCase() === "US") ||
    results[0]!;

  if (
    preferred.latitude == null ||
    preferred.longitude == null ||
    !preferred.timezone
  ) {
    return null;
  }

  try {
    Intl.DateTimeFormat(undefined, { timeZone: preferred.timezone });
  } catch {
    return null;
  }

  const parts = [preferred.name, preferred.admin1].filter(Boolean);
  return {
    label: parts.join(", ") || q,
    timezone: preferred.timezone,
    latitude: preferred.latitude,
    longitude: preferred.longitude,
  };
}

/** Match texts like "I'm in Seattle now" / "now in Detroit" / "set location Seattle". */
export function extractLocationPhrase(text: string): string | null {
  const line = text.trim().replace(/\s+/g, " ");
  const patterns = [
    /^i(?:['’]|\s)?m\s+in\s+(.+?)(?:\s+now)?\.?$/i,
    /^now\s+in\s+(.+?)\.?$/i,
    /^set\s+location(?:\s+to)?\s+(.+?)\.?$/i,
    /^i(?:['’]|\s)?m\s+(?:moving\s+)?to\s+(.+?)(?:\s+now)?\.?$/i,
  ];
  for (const re of patterns) {
    const m = line.match(re);
    if (m?.[1]) return cleanPlaceQuery(m[1]);
  }
  return null;
}
