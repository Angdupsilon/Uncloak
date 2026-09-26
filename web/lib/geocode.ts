// Turn what a visitor typed (city, county, ZIP, street address, or "lat,lon") into a point.
// Server-only. The external lookups are the same public geocoders the ETL uses (U.S. Census
// for street addresses, OpenStreetMap Nominatim for places and ZIP codes). They locate the
// visitor's search, not a site, and add no data to Uncloak. If they're unreachable, a
// city or county that appears in our records falls back to the center of its recorded sites.
import { inUSBox, parseLatLon } from "./geo";
import { datasetPlace } from "./publicQueries";
import type { GeocodeFailure, GeocodeResult } from "./types";

const UA = "Uncloak public research site (U.S. data-center records)";
const TIMEOUT_MS = 6000;

// Small in-memory cache: repeated example searches never hit the geocoders twice, and
// Nominatim's usage policy asks for caching.
const memo = new Map<string, GeocodeResult | GeocodeFailure>();

type Out = GeocodeResult | GeocodeFailure;

const notFound = (q: string): GeocodeFailure => ({
  ok: false,
  reason: "not_found",
  message: `We couldn't find “${q}” in the U.S. Try a city and state, a county, a ZIP code or a full street address.`,
});

async function census(q: string): Promise<Out | null> {
  const url = new URL("https://geocoding.geo.census.gov/geocoder/locations/onelineaddress");
  url.searchParams.set("address", q);
  url.searchParams.set("benchmark", "Public_AR_Current");
  url.searchParams.set("format", "json");
  const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  if (!r.ok) throw new Error(`census ${r.status}`);
  const j = await r.json();
  const m = j?.result?.addressMatches?.[0];
  if (!m) return null;
  const lat = Number(m.coordinates?.y);
  const lon = Number(m.coordinates?.x);
  return { ok: true, label: m.matchedAddress, lat, lon, method: "census", county: null };
}

// Place-like results only, so "Chicago" doesn't resolve to a Chicago-named railroad in Amarillo.
const PLACE_TYPES = new Set([
  "city", "town", "village", "hamlet", "municipality", "county", "suburb", "neighbourhood", "quarter",
  "city_district", "borough", "postcode", "state", "locality", "census", "administrative",
]);

async function nominatim(q: string, placesOnly: boolean): Promise<Out | null> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  if (/^\d{5}$/.test(q)) {
    url.searchParams.set("postalcode", q);
    url.searchParams.set("country", "us");
  } else {
    url.searchParams.set("q", q);
    url.searchParams.set("countrycodes", "us");
  }
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "5");
  const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  if (!r.ok) throw new Error(`nominatim ${r.status}`);
  const all = (await r.json()) as {
    lat: string;
    lon: string;
    display_name: string;
    category?: string;
    addresstype?: string;
    address?: { state?: string; county?: string };
  }[];
  const list = placesOnly ? all.filter((x) => x.category === "place" || x.category === "boundary" || PLACE_TYPES.has(x.addresstype ?? "")) : all;
  if (!list.length) return null;
  const top = list[0];
  const county = /county|parish/i.test(q) ? (top.address?.county?.replace(/\s+(county|parish)$/i, "") ?? null) : null;
  return { ok: true, label: top.display_name.replace(/, United States$/, ""), lat: Number(top.lat), lon: Number(top.lon), method: "osm", county };
}

export async function geocode(raw: string): Promise<Out> {
  const q = raw.trim().slice(0, 200);
  if (!q) return notFound(raw);
  const key = q.toLowerCase();
  const hit = memo.get(key);
  if (hit) return hit;

  const ll = parseLatLon(q);
  if (ll) {
    const out: Out = inUSBox(ll[0], ll[1])
      ? { ok: true, label: "Your location", lat: ll[0], lon: ll[1], method: "coordinates", county: null }
      : { ok: false, reason: "outside_us", message: "That location is outside the U.S. Uncloak covers U.S. data-center records only." };
    return out; // never cached: coordinates are the visitor's own location
  }

  const looksLikeAddress = /^\d+\s+\S+/.test(q) && !/^\d{5}$/.test(q);
  let out: Out | null = null;
  let externalFailed = false;
  try {
    if (looksLikeAddress) out = await census(q);
    if (!out) out = await nominatim(q, !looksLikeAddress);
  } catch (err) {
    console.warn("[gridsight geocode]", err);
    externalFailed = true;
  }

  if (!out || (out.ok === false && out.reason !== "outside_us")) {
    const local = await datasetPlace(q);
    if (local) out = { ok: true, ...local, method: "dataset" };
  }
  if (out?.ok && !inUSBox(out.lat, out.lon)) {
    out = { ok: false, reason: "outside_us", message: `${out.label} is outside the U.S. Uncloak covers U.S. data-center records only.` };
  }
  if (!out) {
    out = externalFailed
      ? { ok: false, reason: "lookup_failed", message: "The address lookup service didn't respond. Try a city or county name with its state (for example “Loudoun County, VA”), or try again shortly." }
      : notFound(q);
  }
  if (!(out.ok === false && out.reason === "lookup_failed")) memo.set(key, out);
  return out;
}
