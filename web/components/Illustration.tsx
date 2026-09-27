"use client";
import { useEffect, useState } from "react";

/**
 * An AI-generated illustration with live database figures overlaid.
 *
 * Two rules this component exists to enforce:
 *
 * 1. The "AI illustration" badge is always rendered. It is not a prop, not
 *    conditional, and not removable by a caller. These are generic images of a
 *    construction stage reused across every site - a viewer must never read one
 *    as a photograph of the project they clicked.
 * 2. The overlaid figures come from the database, never from the image. The
 *    picture is decoration; the numbers are the record.
 *
 * Assets and their provenance are produced by etl/generate_imagery.py, which
 * records prompt, model and date in public/illustrations/manifest.json.
 */

export interface IllustrationStat {
  label: string;
  value: string;
  /** Marks a figure the database does not measure directly (e.g. an estimate). */
  estimated?: boolean;
}

export default function Illustration({
  src,
  alt,
  caption,
  stats = [],
  aspect = "16/9",
  video = false,
  poster,
}: {
  src: string;
  alt: string;
  /** Extra context under the frame. The AI-illustration disclaimer is added regardless. */
  caption?: string;
  stats?: IllustrationStat[];
  aspect?: string;
  video?: boolean;
  /** Still shown while a video loads, so the frame is never blank. */
  poster?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);

  return (
    <figure className="overflow-hidden rounded-xl border border-[#e2e2e2] bg-white">
      <div className="relative w-full bg-[#efefef]" style={{ aspectRatio: aspect }}>
        {failed ? (
          <div className="absolute inset-0 grid place-items-center px-4 text-center">
            <div className="text-[13px] text-[#afafaf]">
              Illustration not generated yet
              <div className="mt-1 font-mono text-[11px]">{src.split("/").pop()}</div>
            </div>
          </div>
        ) : video ? (
          <video
            className="absolute inset-0 h-full w-full object-cover"
            src={src}
            poster={poster}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            onError={() => setFailed(true)}
            aria-label={alt}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- generated asset, no loader needed
          <img
            className="absolute inset-0 h-full w-full object-cover"
            src={src}
            alt={alt}
            onError={() => setFailed(true)}
          />
        )}

        {/* Always present, never a prop. */}
        <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-black/75 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
          AI illustration
        </span>

        {/* Live figures sit over the art in their own layer, with a scrim so
            they stay legible whatever the image turns out to look like. */}
        {stats.length > 0 && !failed && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-3 pb-2.5 pt-8">
            <dl className="flex flex-wrap gap-x-5 gap-y-1">
              {stats.map((s) => (
                <div key={s.label}>
                  <dt className="text-[11px] leading-4 text-white/70">
                    {s.label}
                    {s.estimated && <span className="ml-1 text-white/50">(est.)</span>}
                  </dt>
                  <dd className="text-[15px] font-medium leading-5 text-white tabular-nums">{s.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>

      {caption && (
        <figcaption className="px-3.5 py-2.5 text-[13px] leading-5 text-[var(--slate)]">{caption}</figcaption>
      )}
    </figure>
  );
}
