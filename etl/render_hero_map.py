"""Render the map take in the home-page hero reel from our own records.

The other four hero clips are generated footage (see generate_imagery.py
--set hero). This one is not: it is drawn frame by frame from the seed data,
so every point of light is a recorded site with a published, reviewed or mapped
location. It is styled to sit in the same reel: one continuous slow aerial
move, near-black frame with a single ember-orange light source, anamorphic
streaks, shallow depth of field and film grain, 24 fps, 8 s.

The camera drifts over a tilted map of the contiguous U.S. while sites ignite
from west to east, then holds on the full constellation.

Output:
  web/public/hero/map.mp4          the clip
  web/public/hero/manifest.json    "map" entry: inputs, site count, sha256

Needs numpy, scipy, pillow and imageio-ffmpeg (for its bundled ffmpeg), which
are not in requirements.txt because nothing else in the pipeline uses them:
  pip install numpy scipy pillow imageio-ffmpeg
  python etl/render_hero_map.py
  python etl/render_hero_map.py --still 0.9 --out /tmp   # one PNG frame, for framing
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import imageio_ffmpeg
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter

ROOT = Path(__file__).resolve().parent.parent
HERO = ROOT / "web" / "public" / "hero"
STATES = ROOT / "web" / "public" / "us_states.geojson"
SOURCES = [ROOT / "data" / "seed" / "projects.csv", ROOT / "data" / "seed_national" / "projects.csv"]
SOURCES += sorted((ROOT / "data" / "seed_states").glob("*/projects.csv"))

W, H = 1280, 720
SS = 2  # supersampling for the vector layer
FPS = 24
SECONDS = 8
FRAMES = FPS * SECONDS

# Same frame as HeroVisual: contiguous U.S., equirectangular, corrected at 38°N.
MIN_LON, MAX_LON, MIN_LAT, MAX_LAT = -124.8, -66.9, 24.4, 49.4
KX = math.cos(math.radians(38))
LON0, LAT0 = -96.0, 37.5

EMBER = np.array([1.00, 0.54, 0.24])  # #ff8a3d, the HeroVisual glow
CORE = np.array([1.00, 0.85, 0.66])  # #ffd9a8
FLARE = np.array([1.00, 0.42, 0.12])


def plane(lon, lat):
    return (np.asarray(lon) - LON0) * KX, np.asarray(lat) - LAT0


def load_sites() -> np.ndarray:
    seen: set[tuple[float, float]] = set()
    for path in SOURCES:
        with path.open(newline="") as f:
            for row in csv.DictReader(f):
                try:
                    lat, lon = float(row["lat"]), float(row["lon"])
                except (KeyError, TypeError, ValueError):
                    continue
                if MIN_LAT <= lat <= MAX_LAT and MIN_LON <= lon <= MAX_LON:
                    seen.add((round(lon, 3), round(lat, 3)))
    return np.array(sorted(seen))


def load_rings() -> list[np.ndarray]:
    rings = []
    for feat in json.loads(STATES.read_text())["features"]:
        g = feat["geometry"]
        polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        for poly in polys:
            ring = np.array(poly[0])
            if ring[:, 0].max() > MIN_LON and ring[:, 1].min() < MAX_LAT:
                rings.append(np.column_stack(plane(ring[:, 0], ring[:, 1])))
    return rings


def ease(t: float) -> float:
    return 0.5 - 0.5 * math.cos(math.pi * t)


def lerp(a, b, t):
    return a + (b - a) * t


def camera(t: float):
    """A slow drone move: push in, lift the tilt a little, orbit a few degrees."""
    e = ease(t)
    pitch = math.radians(lerp(40, 47, e))  # from straight down
    yaw = math.radians(lerp(-7, 5, e))
    dist = lerp(58, 49, e)
    target = np.array([lerp(3.0, 4.5, e), lerp(-2.0, -0.5, e), 0.0])
    fwd = np.array([math.sin(yaw), math.cos(yaw), 0.0])
    pos = target - dist * math.sin(pitch) * fwd + np.array([0, 0, dist * math.cos(pitch)])
    w = target - pos
    w /= np.linalg.norm(w)
    r = np.cross(w, [0, 0, 1.0])
    r /= np.linalg.norm(r)
    u = np.cross(r, w)
    focal = 1.05 * W  # ~63° horizontal field of view

    def project(xy: np.ndarray, scale=1):
        v = np.column_stack([xy, np.zeros(len(xy))]) - pos
        z = v @ w
        sx = W / 2 + focal * (v @ r) / z
        sy = H / 2 - focal * (v @ u) / z
        return np.column_stack([sx, sy]) * scale, z

    return project, dist


def render(t: float, sites_xy, ignite, weight, rings, rng) -> np.ndarray:
    project, dist = camera(t)

    # Vector layer: dark state fills and hairline borders, supersampled.
    vec = Image.new("L", (W * SS, H * SS), 0)
    fill = Image.new("L", (W * SS, H * SS), 0)
    dv, df = ImageDraw.Draw(vec), ImageDraw.Draw(fill)
    for ring in rings:
        pts, _ = project(ring, SS)
        poly = [tuple(p) for p in pts]
        df.polygon(poly, fill=255)
        dv.line(poly + [poly[0]], fill=255, width=SS, joint="curve")
    line = np.asarray(vec.resize((W, H), Image.LANCZOS), dtype=np.float32) / 255
    land = np.asarray(fill.resize((W, H), Image.LANCZOS), dtype=np.float32) / 255

    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    # Land is lit a touch from the upper right, like the old diagonal streak.
    shade = 0.055 + 0.03 * (xx / W) - 0.02 * (yy / H)
    img = np.zeros((H, W, 3), np.float32)
    img += (land * shade)[..., None] * np.array([1.0, 0.93, 0.86])

    # The ignition front sweeps west to east; borders near it catch the light.
    front_lon = lerp(MIN_LON - 4, MAX_LON + 4, min(1, t / 0.78))
    front, _ = project(np.column_stack(plane([front_lon, front_lon], [MIN_LAT, MAX_LAT])))
    fx = np.interp(yy, [front[1, 1], front[0, 1]], [front[1, 0], front[0, 0]])
    near_front = np.exp(-(((xx - fx) / 90) ** 2)) * (t < 0.85) * (1 - t / 0.85)
    img += (line * (0.16 + 0.35 * near_front))[..., None] * np.array([1.0, 0.9, 0.8])

    # Sites: splat each lit point into an energy buffer, then bloom it.
    since = t - ignite
    lit = since > 0
    pts, z = project(sites_xy[lit])
    s = since[lit]
    energy = weight[lit] * (1 + 3.2 * np.exp(-s / 0.035)) * np.clip(s / 0.01, 0, 1)
    depth = (dist / z) ** 1.2
    buf = np.zeros((H, W), np.float32)
    ix, iy = pts[:, 0], pts[:, 1]
    ok = (ix >= 0) & (ix < W - 1) & (iy >= 0) & (iy < H - 1)
    ix, iy, e = ix[ok], iy[ok], (energy * depth)[ok]
    x0, y0 = ix.astype(int), iy.astype(int)
    fx_, fy_ = ix - x0, iy - y0
    for dx, dy, wgt in ((0, 0, (1 - fx_) * (1 - fy_)), (1, 0, fx_ * (1 - fy_)), (0, 1, (1 - fx_) * fy_), (1, 1, fx_ * fy_)):
        np.add.at(buf, (y0 + dy, x0 + dx), e * wgt)

    core = gaussian_filter(buf, 0.9)
    glow = gaussian_filter(buf, 4.0)
    halo = gaussian_filter(buf, 18.0)
    # Anamorphic flare, only off the bright clusters so single sites stay points.
    streak = gaussian_filter(np.maximum(glow - 0.035, 0), (1.0, 70.0))
    img += core[..., None] * CORE * 2.6
    img += glow[..., None] * EMBER * 5.5
    img += halo[..., None] * EMBER * 22.0
    img += streak[..., None] * FLARE * 16.0

    # Shallow depth of field: sharp across a band below centre, soft far and near.
    soft = np.stack([gaussian_filter(img[..., c], 2.4) for c in range(3)], -1)
    focus = np.clip(np.abs(yy / H - 0.58) / 0.34, 0, 1)[..., None] ** 1.5
    img = img * (1 - focus) + soft * focus

    # Filmic roll-off, vignette, grain.
    img = 1 - np.exp(-img * 1.6)
    vig = 1 - 0.55 * (((xx / W - 0.55) / 0.75) ** 2 + ((yy / H - 0.5) / 0.7) ** 2)
    img *= np.clip(vig, 0, 1)[..., None]
    grain = gaussian_filter(rng.standard_normal((H, W)).astype(np.float32), 0.6)
    img += (grain * 0.018)[..., None]
    img *= min(1, t / 0.04 + 0.35)  # open from near-black, like the arc clip
    return (np.clip(img, 0, 1) ** (1 / 1.1) * 255).astype(np.uint8)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--still", type=float, help="write one frame at this t in [0, 1] and exit")
    ap.add_argument("--out", type=Path, default=Path("."), help="directory for --still frames")
    args = ap.parse_args()

    sites = load_sites()
    rings = load_rings()
    rng = np.random.default_rng(7)
    sites_xy = np.column_stack(plane(sites[:, 0], sites[:, 1]))
    # West to east with some scatter, so the front reads as filings landing, not a wipe.
    west_east = (sites[:, 0] - MIN_LON) / (MAX_LON - MIN_LON)
    ignite = 0.04 + 0.70 * west_east + rng.uniform(-0.05, 0.08, len(sites))
    weight = rng.uniform(0.7, 1.15, len(sites)).astype(np.float32)

    if args.still is not None:
        out = args.out / f"map-still-{args.still:.2f}.png"
        Image.fromarray(render(args.still, sites_xy, ignite, weight, rings, rng)).save(out)
        print(f"{len(sites)} sites -> {out}")
        return

    out = HERO / "map.mp4"
    cmd = [
        imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-loglevel", "error",
        "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
        "-c:v", "libx264", "-preset", "slow", "-crf", "21", "-pix_fmt", "yuv420p",
        "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
        "-movflags", "+faststart", str(out),
    ]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for i in range(FRAMES):
        proc.stdin.write(render(i / (FRAMES - 1), sites_xy, ignite, weight, rings, rng).tobytes())
    proc.stdin.close()
    if proc.wait():
        raise SystemExit("ffmpeg failed")

    data = out.read_bytes()
    manifest_path = HERO / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    manifest["assets"]["map"] = {
        "stage": "map",
        "file": out.name,
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
        "generator": "etl/render_hero_map.py",
        "inputs": [str(p.relative_to(ROOT)) for p in SOURCES] + [str(STATES.relative_to(ROOT))],
        "sites": int(len(sites)),
        "description": "Rendered from our records, not generated footage. Each point is one recorded site with a published, reviewed or mapped location in the contiguous U.S.",
        "generated_at": now,
        "duration_s": SECONDS,
    }
    manifest["updated_at"] = now
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"{len(sites)} sites, {len(data) / 1e6:.1f} MB -> {out}")


if __name__ == "__main__":
    main()
