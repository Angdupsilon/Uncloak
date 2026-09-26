// Turn what a visitor typed (city, county, ZIP, street address, or "lat,lon") into a point.
// Server-only. The external lookups are the same public geocoders the ETL uses (U.S. Census
// for street addresses, OpenStreetMap Nominatim for places and ZIP codes). They locate the
// visitor's search, not a site, and add no data to Uncloak. If they're unreachable, a
// city or county that appears in our records falls back to the center of its recorded sites.
import { inTexasBox, parseLatLon } from "./geo";
import { datasetPlace } from "./publicQueries";
import type { GeocodeFailure, GeocodeResult } from "./types";

const UA = "Uncloak public research site (Texas data-center records)";
const TIMEOUT_MS = 6000;

// Small in-memory cache: repeated example searches never hit the geocoders twice, and
// Nominatim's usage policy asks for caching.
const memo = new Map<string, GeocodeResult | GeocodeFailure>();

type Out = GeocodeResult | GeocodeFailure;

const notFound = (q: string): GeocodeFailure => ({
  ok: false,
  reason: "not_found",
  message: `We couldn't find “${q}” in Texas. Try a city, county, ZIP code or full street address.`,
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
  if (m.addressComponents?.state && m.addressComponents.state !== "TX") {
    return { ok: false, reason: "outside_texas", message: `${m.matchedAddress} is outside Texas. Uncloak covers Texas public records only.` };
  }
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
  const tx = list.find((x) => x.address?.state === "Texas");
  if (!tx) {
    const first = list[0];
    return {
      ok: false,
      reason: "outside_texas",
      message: `The closest match, ${first.display_name}, is outside Texas. Uncloak covers Texas public records only.`,
    };
  }
  const county = /county/i.test(q) ? (tx.address?.county?.replace(/\s+county$/i, "") ?? null) : null;
  return { ok: true, label: tx.display_name.replace(/, United States$/, ""), lat: Number(tx.lat), lon: Number(tx.lon), method: "osm", county };
}

export async function geocode(raw: string): Promise<Out> {
  const q = raw.trim().slice(0, 200);
  if (!q) return notFound(raw);
  const key = q.toLowerCase();
  const hit = memo.get(key);
  if (hit) return hit;

  const ll = parseLatLon(q);
  if (ll) {
    const out: Out = inTexasBox(ll[0], ll[1])
      ? { ok: true, label: "Your location", lat: ll[0], lon: ll[1], method: "coordinates", county: null }
      : { ok: false, reason: "outside_texas", message: "That location is outside Texas. Uncloak covers Texas public records only." };
    return out; // never cached: coordinates are the visitor's own location
  }

  const looksLikeAddress = /^\d+\s+\S+/.test(q) && !/^\d{5}$/.test(q);
  let out: Out | null = null;
  let externalFailed = false;
  try {
    if (looksLikeAddress) {
      // Census wants a state; add one if the visitor didn't.
      out = await census(/\b(tx|texas)\b/i.test(q) ? q : `${q}, TX`);
    }
    const placesOnly = !looksLikeAddress;
    if (!out) out = await nominatim(/^\d{5}$/.test(q) || /\b(tx|texas)\b/i.test(q) || looksLikeAddress ? q : `${q}, Texas`, placesOnly);
    // "Chicago, Texas" finds no place, so ask again without the state to say where it is.
    if (!out && !/\b(tx|texas)\b/i.test(q) && !/^\d{5}$/.test(q)) out = await nominatim(q, placesOnly);
  } catch (err) {
    console.warn("[gridsight geocode]", err);
    externalFailed = true;
  }

  if (!out || (out.ok === false && out.reason !== "outside_texas")) {
    const local = await datasetPlace(q);
    if (local) out = { ok: true, ...local, method: "dataset" };
  }
  if (out?.ok && !inTexasBox(out.lat, out.lon)) {
    out = { ok: false, reason: "outside_texas", message: `${out.label} is outside Texas. Uncloak covers Texas public records only.` };
  }
  if (!out) {
    out = externalFailed
      ? { ok: false, reason: "lookup_failed", message: "The address lookup service didn't respond. Try a Texas city or county name, or try again shortly." }
      : notFound(q);
  }
  if (!(out.ok === false && out.reason === "lookup_failed")) memo.set(key, out);
  return out;
}
