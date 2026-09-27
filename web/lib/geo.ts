// Small geography helpers shared by the server (nearby search) and the client (near page).

const EARTH_KM = 6371.0088;
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in km. */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

const COMPASS = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];

/** Compass direction from point 1 to point 2, e.g. "northwest". */
export function compass(lat1: number, lon1: number, lat2: number, lon2: number): string {
  const y = Math.sin(rad(lon2 - lon1)) * Math.cos(rad(lat2));
  const x = Math.cos(rad(lat1)) * Math.sin(rad(lat2)) - Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lon2 - lon1));
  const deg = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  return COMPASS[Math.round(deg / 45) % 8];
}

export const KM_PER_MI = 1.609344;

export function fmtDistance(km: number): string {
  const mi = km / KM_PER_MI;
  if (mi < 0.1) return "under 0.1 mi";
  return `${mi < 10 ? mi.toFixed(1) : Math.round(mi).toLocaleString()} mi`;
}

/** Radius choices for the near page, in miles. */
export const RADIUS_MI = [10, 25, 50, 100] as const;
export const DEFAULT_RADIUS_MI = 25;

/** Boxes covering the U.S. (slightly padded): [minLat, minLon, maxLat, maxLon]. */
const US_BOXES = [
  [24.3, -125, 49.5, -66.8], // contiguous states and DC
  [51, -180, 71.5, -129], // Alaska
  [18.8, -160.5, 22.4, -154.6], // Hawaii
  [17.8, -67.4, 18.6, -65.2], // Puerto Rico
] as const;

export function inUSBox(lat: number, lon: number): boolean {
  return US_BOXES.some((b) => lat >= b[0] && lat <= b[2] && lon >= b[1] && lon <= b[3]);
}

export const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut",
  DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  PR: "Puerto Rico", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas",
  UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

/** "Loudoun" + VA -> "Loudoun County"; Louisiana parishes, Puerto Rico municipios and
 *  independent cities / planning regions keep their own wording. */
export function countyLabel(county: string, state: string | null | undefined): string {
  if (/ (city|Region)$/.test(county) || state === "DC" || county === "District of Columbia") return county;
  if (state === "LA") return `${county} Parish`;
  if (state === "PR") return `${county} Municipio`;
  return `${county} County`;
}

/** "30.27,-97.74" -> [30.27, -97.74]; anything else -> null. */
export function parseLatLon(s: string): [number, number] | null {
  const m = s.trim().match(/^(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? [lat, lon] : null;
}
