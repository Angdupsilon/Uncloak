# Time Machine stage clips

Five generic clips, generated **once** and reused for every project. They are
illustrations of a construction stage, never footage of a specific site — the UI
labels them that way and that label must not be removed.

## Files the app expects

Drop these into this folder. The app reads them by exact name:

| Stage | Video | Poster (optional) |
|---|---|---|
| Request filed | `filed.mp4` | `filed.jpg` |
| Site certified | `certified.mp4` | `certified.jpg` |
| Under construction | `construction.mp4` | `construction.jpg` |
| Buildings complete | `complete.mp4` | `complete.jpg` |
| Energized | `energized.mp4` | `energized.jpg` |

Missing files degrade to a labelled placeholder, so you can add them one at a
time. Posters are optional but stop the first frame flashing grey.

**Specs:** 16:9, ~1280x720 is plenty (rendered ~360px wide), a few seconds,
silent. They autoplay muted on loop. Keep each file under ~2 MB — five clips
load on the site panel and this is a demo, not a CDN.

## Prompts for Grok Imagine

Generate at grok.com or in the X app. Keep the camera angle, time of day and
lens consistent across all five so the sequence reads as one site progressing.

1. **filed.mp4**
   > Slow aerial drone push over an empty flat rural Texas parcel, dry grass and
   > scrub, a single access road at the edge, clear daylight, no buildings, no
   > people. Documentary aerial, neutral colour.

2. **certified.mp4**
   > Slow aerial drone push over the same flat rural Texas parcel, now graded
   > and cleared to bare earth, survey stakes and orange marker flags in a grid,
   > a gravel access road, no structures. Documentary aerial, neutral colour.

3. **construction.mp4**
   > Slow aerial drone push over a large data-center construction site, steel
   > frame skeleton of two long rectangular buildings going up, tower cranes,
   > concrete slab poured, construction vehicles. Documentary aerial, neutral.

4. **complete.mp4**
   > Slow aerial drone push over a finished data-center campus, two long
   > windowless rectangular buildings with white roofs, rows of rooftop cooling
   > units, empty parking, perimeter fence, daylight. Documentary aerial.

5. **energized.mp4**
   > Slow aerial drone push over a finished data-center campus at dusk, exterior
   > lighting on, substation and transformer yard energised beside the
   > buildings, transmission lines leaving the site. Documentary aerial.

## Cost

Five clips at roughly $2 per 15-second generation is about **$10 total**, once —
they are reused across all 182 projects.

## Why these aren't generated automatically

Grok Imagine's video generation is a product feature of the Grok app and X. The
public xAI API (`api.x.ai`) exposes chat and image generation; there is no
documented video endpoint to call from the ETL, so these are produced by hand
and committed. If xAI ships a video API later, the only thing that changes is
how these five files get made — nothing in the app needs to change.
