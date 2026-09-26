"""Generate the stage illustrations with xAI (Grok Imagine) and record how.

These are generic illustrations of construction stages, reused across every
site. They are NOT pictures of any specific project, and every surface that
renders one says so. The manifest written here is what makes that claim
auditable: prompt, model, endpoint, date and file hash for each asset, on the
same standard as the rest of the Methodology page.

Output:
  web/public/illustrations/<stage>.<ext>      the asset
  web/public/illustrations/manifest.json      prompt, model, date, sha256

Models (from GET /v1/models, 2026-09-26): grok-imagine-image,
grok-imagine-image-2.0, grok-imagine-image-quality, grok-imagine-video,
grok-imagine-video-1.5.

Endpoints:
  POST /v1/images/generations   -> synchronous, returns b64_json or url
  POST /v1/videos/generations   -> asynchronous, returns {"request_id": ...}
  GET  /v1/videos/{request_id}  -> 202 {"status":"pending","progress":N}
                                   200 {"status":"done","video":{"url",...}}
Images come back in one call. Video is a job: submit, then poll until 200 and
fetch the signed URL. Roughly 20-30s per 8-second clip.

Usage:
  export XAI_API_KEY=...
  python etl/generate_imagery.py                  # all stages, images
  python etl/generate_imagery.py --stage filed    # one stage
  python etl/generate_imagery.py --video          # try video generation
  python etl/generate_imagery.py --force          # regenerate existing assets
  python etl/generate_imagery.py --dry-run        # print what would be called
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parent.parent
OUT_DIRS = {
    "stages": ROOT / "web" / "public" / "illustrations",
    "hero": ROOT / "web" / "public" / "hero",
}

API_BASE = "https://api.x.ai/v1"
IMAGE_MODEL = os.getenv("XAI_IMAGE_MODEL", "grok-imagine-image-quality")
VIDEO_MODEL = os.getenv("XAI_VIDEO_MODEL", "grok-imagine-video-1.5")
POLL_EVERY_S = 5
VIDEO_TIMEOUT_S = 600

# The API reports spend as "cost_in_usd_ticks". Confirmed against a real bill on
# 2026-09-26: 32e9 ticks for five 8s clips came to ~$3.20, i.e. 1e-10 USD/tick.
USD_PER_TICK = 1e-10

# One shared clause so every stage shares camera, light and lens. Consistency
# across the set is what makes the sequence read as one site progressing.
STYLE = (
    "Slow aerial drone view, straight-on documentary framing, clear flat daylight, "
    "neutral colour grade, wide lens, rural Texas landscape, no text, no logos, no people."
)

# Hero reel. Four held takes with deliberately opposite palettes, in the
# showcase format Runway uses: unrelated subjects, one continuous shot each,
# hard palette swing between them. No text sits over these, so they do not need
# a calm dark centre; they need to look expensive.
HERO_STYLE = (
    "Single continuous locked-off cinematic shot, no cuts, slow deliberate motion, "
    "shallow depth of field, anamorphic feel, film grain, no text, no signage, no logos, "
    "no people, no vehicles with plates, no watermarks."
)

HERO: dict[str, str] = {
    "arc": (
        "Extreme close shot of a high-voltage substation transformer at night, a single "
        "brilliant orange electrical arc flaring across a ceramic insulator, everything else "
        "falling into deep black, sparks drifting. Near-black frame with one ember-orange light source. "
        + HERO_STYLE
    ),
    "water": (
        "Underwater shot of turbulent cooling water discharge, dense white bubble churn against "
        "deep blue, shafts of surface light cutting down through the current. Saturated deep blue palette. "
        + HERO_STYLE
    ),
    "salt": (
        "High aerial shot drifting over a vast cracked white salt flat, polygonal salt crust "
        "stretching to a pale horizon, thin sheen of water catching flat overcast light. "
        "Almost monochrome pale white and bone palette. " + HERO_STYLE
    ),
    "arm": (
        "Close shot of a precise white robotic arm moving in a sterile semiconductor clean room, "
        "smooth mechanical articulation, soft even diffused lighting, seamless pale grey surfaces. "
        "Flat neutral grey palette, clinical and calm. " + HERO_STYLE
    ),
}

STAGES: dict[str, str] = {
    "filed": (
        "An empty flat rural parcel of dry grass and scrub with a single dirt access road "
        "at one edge. No buildings, no equipment, undisturbed land. " + STYLE
    ),
    "certified": (
        "The same flat rural parcel now graded and cleared to bare earth, survey stakes and "
        "orange marker flags set out in a grid, a new gravel access road. No structures. " + STYLE
    ),
    "construction": (
        "A large data-center construction site: the steel frame skeleton of two long "
        "rectangular buildings rising from a poured concrete slab, tower cranes, "
        "construction vehicles and material laydown areas. " + STYLE
    ),
    "complete": (
        "A finished data-center campus: two long windowless rectangular buildings with white "
        "roofs, rows of rooftop cooling units, empty parking, perimeter fence, landscaped berm. "
        + STYLE
    ),
    "energized": (
        "A finished data-center campus with its electrical substation and transformer yard "
        "energised alongside the buildings, transmission lines leaving the site, exterior "
        "lighting on at dusk. " + STYLE
    ),
}


def _client(api_key: str) -> httpx.Client:
    return httpx.Client(
        base_url=API_BASE,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        timeout=httpx.Timeout(300.0, connect=30.0),
    )


def _extract_asset(payload: dict) -> tuple[bytes, str | None]:
    """Pull bytes out of an OpenAI-shaped generations response.

    Handles both b64_json and url delivery; returns (bytes, revised_prompt).
    """
    items = payload.get("data") or []
    if not items:
        raise RuntimeError(f"no data in response: {json.dumps(payload)[:400]}")
    item = items[0]
    revised = item.get("revised_prompt")

    if item.get("b64_json"):
        return base64.b64decode(item["b64_json"]), revised
    if item.get("url"):
        with httpx.Client(timeout=120.0, follow_redirects=True) as c:
            r = c.get(item["url"])
            r.raise_for_status()
            return r.content, revised
    raise RuntimeError(f"response had neither b64_json nor url: {json.dumps(item)[:400]}")


def generate(stage: str, prompt: str, *, api_key: str, video: bool, dry_run: bool, out_dir: Path) -> dict | None:
    endpoint = "/videos/generations" if video else "/images/generations"
    model = VIDEO_MODEL if video else IMAGE_MODEL
    body = {"model": model, "prompt": prompt, "n": 1}
    if not video:
        # xAI's image endpoint rejects size/quality/style; only response_format applies.
        body["response_format"] = "b64_json"

    if dry_run:
        print(f"  [dry-run] POST {API_BASE}{endpoint}  model={model}")
        print(f"            prompt: {prompt[:90]}...")
        return None

    extra: dict = {}
    with _client(api_key) as client:
        resp = client.post(endpoint, json=body)
        if resp.status_code >= 400:
            # Surface the API's own message rather than a generic failure.
            raise SystemExit(
                f"error: {endpoint} returned {resp.status_code}\n"
                f"  {resp.text[:500]}\n"
                f"  (model={model}; override with XAI_IMAGE_MODEL / XAI_VIDEO_MODEL)"
            )
        payload = resp.json()

        if video:
            # Video is a job: poll /v1/videos/{id} until it returns 200.
            request_id = payload.get("request_id")
            if not request_id:
                raise RuntimeError(f"no request_id in response: {json.dumps(payload)[:300]}")
            deadline = time.monotonic() + VIDEO_TIMEOUT_S
            while True:
                if time.monotonic() > deadline:
                    raise SystemExit(f"error: video job {request_id} still pending after {VIDEO_TIMEOUT_S}s")
                poll = client.get(f"/videos/{request_id}")
                if poll.status_code == 200:
                    payload = poll.json()
                    break
                if poll.status_code != 202:
                    raise SystemExit(f"error: polling {request_id} returned {poll.status_code}\n  {poll.text[:300]}")
                pct = poll.json().get("progress")
                print(f"    ...{pct}%", end="\r", flush=True)
                time.sleep(POLL_EVERY_S)

            vid = payload.get("video") or {}
            url = vid.get("url")
            if not url:
                raise RuntimeError(f"job done but no video url: {json.dumps(payload)[:300]}")
            with httpx.Client(timeout=300.0, follow_redirects=True) as c:
                r = c.get(url)
                r.raise_for_status()
                data = r.content
            revised = None
            extra = {
                "request_id": request_id,
                "duration_s": vid.get("duration"),
                "cost_usd_ticks": (payload.get("usage") or {}).get("cost_in_usd_ticks"),
            }
            model = payload.get("model", model)
        else:
            data, revised = _extract_asset(payload)

    ext = "mp4" if video else "jpg"
    path = out_dir / f"{stage}.{ext}"
    path.write_bytes(data)

    return {
        "stage": stage,
        "file": path.name,
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
        "prompt": prompt,
        "revised_prompt": revised,
        "model": model,
        "endpoint": f"{API_BASE}{endpoint}",
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        **extra,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--set", choices=("stages", "hero"), default="stages", help="which asset set to generate")
    ap.add_argument("--stage", help="generate one item from the set (default: all)")
    ap.add_argument("--video", action="store_true", help="use the video endpoint instead of images")
    ap.add_argument("--force", action="store_true", help="regenerate assets that already exist")
    ap.add_argument("--dry-run", action="store_true", help="print the calls without making them")
    args = ap.parse_args()

    api_key = os.getenv("XAI_API_KEY", "").strip()
    if not api_key and not args.dry_run:
        raise SystemExit(
            "error: XAI_API_KEY is not set.\n"
            "  Get a key at https://console.x.ai, then: export XAI_API_KEY=...\n"
            "  Re-run with --dry-run to see the calls without a key."
        )

    prompts = HERO if args.set == "hero" else STAGES
    if args.stage and args.stage not in prompts:
        raise SystemExit(f"error: '{args.stage}' is not in the {args.set} set ({', '.join(sorted(prompts))})")

    OUT_DIR = OUT_DIRS[args.set]
    MANIFEST = OUT_DIR / "manifest.json"
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {"assets": {}}
    manifest.setdefault("assets", {})

    wanted = [args.stage] if args.stage else list(prompts)
    ext = "mp4" if args.video else "jpg"
    generated = 0

    print(f"Generating {len(wanted)} {'video' if args.video else 'image'} asset(s) -> {OUT_DIR}")
    for stage in wanted:
        existing = OUT_DIR / f"{stage}.{ext}"
        if existing.exists() and not args.force:
            print(f"  {stage:13s} exists, skipping (--force to regenerate)")
            continue
        print(f"  {stage:13s} generating...")
        record = generate(stage, prompts[stage], api_key=api_key, video=args.video, dry_run=args.dry_run, out_dir=OUT_DIR)
        if record:
            manifest["assets"][stage] = record
            generated += 1
            print(f"  {stage:13s} saved {record['file']} ({record['bytes'] / 1024:.0f} KB)")

    spent = sum(
        (manifest["assets"][k].get("cost_usd_ticks") or 0) for k in wanted if k in manifest["assets"]
    ) * USD_PER_TICK
    if spent:
        print(f"\nThis run: about ${spent:.2f} (reported by the API)")

    if generated and not args.dry_run:
        manifest["updated_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
        manifest["note"] = (
            "Generic illustrations of construction stages, reused across all sites. "
            "Not photographs of any specific project."
        )
        MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")
        print(f"\nManifest: {MANIFEST.relative_to(ROOT)} ({len(manifest['assets'])} asset(s) recorded)")

    return 0


if __name__ == "__main__":
    sys.exit(main())
