import * as db from "./db";

const WMO: Record<number, string> = {
  0: "clear skies",
  1: "mainly clear",
  2: "partly cloudy",
  3: "overcast",
  45: "foggy",
  61: "light rain",
  63: "rain",
  65: "heavy rain",
  80: "rain showers",
  95: "thunderstorms",
};
const RAIN = new Set([51, 53, 55, 61, 63, 65, 80, 81, 82, 95]);

async function coords(city: string): Promise<[number, number]> {
  if (process.env.WEATHER_LAT && process.env.WEATHER_LON) {
    return [Number(process.env.WEATHER_LAT), Number(process.env.WEATHER_LON)];
  }
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`;
  const res = await fetch(url);
  const data = (await res.json()) as {
    results?: { latitude: number; longitude: number }[];
  };
  const hit = data.results?.[0];
  if (!hit) return [42.3314, -83.0458];
  return [hit.latitude, hit.longitude];
}

export async function formatWeatherText(daysAhead = 0): Promise<string> {
  const settings = await db.getSettings();
  const city =
    settings.weatherCity?.trim() ||
    process.env.WEATHER_CITY?.trim() ||
    "Detroit";
  const tz =
    settings.timezone?.trim() ||
    process.env.TIMEZONE?.trim() ||
    "America/Detroit";
  const [lat, lon] = await coords(city);
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
    `&timezone=${encodeURIComponent(tz)}&forecast_days=3`;
  const res = await fetch(url);
  const data = (await res.json()) as {
    daily: {
      weathercode: number[];
      temperature_2m_max: number[];
      temperature_2m_min: number[];
      precipitation_probability_max: number[];
    };
  };
  const i = Math.min(Math.max(daysAhead, 0), 2);
  const code = data.daily.weathercode[i] ?? 0;
  const hi = Math.round(data.daily.temperature_2m_max[i] ?? 0);
  const lo = Math.round(data.daily.temperature_2m_min[i] ?? 0);
  const pop = data.daily.precipitation_probability_max[i] ?? 0;
  const label = daysAhead === 0 ? "Today" : daysAhead === 1 ? "Tomorrow" : `Day +${daysAhead}`;
  const conditions = WMO[code] || "mixed conditions";
  const umbrella = RAIN.has(code) || pop >= 50;
  const emoji = umbrella ? "☔" : "☀️";
  return `${emoji} ${label} in ${city}: ${conditions}, ${hi}°/${lo}°F${umbrella ? " — grab an umbrella" : ""}`;
}
