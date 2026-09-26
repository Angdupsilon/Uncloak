"use client";
import Illustration, { type IllustrationStat } from "@/components/Illustration";
import { STAGES, type Stage } from "@/lib/stages";

/**
 * A Time Machine stage, rendered through <Illustration> so the "AI
 * illustration" badge and the not-a-photograph disclaimer have exactly one
 * implementation. Assets come from etl/generate_imagery.py.
 */
export default function StageClip({
  stage,
  asOf,
  stats = [],
}: {
  stage: Stage;
  asOf?: string;
  stats?: IllustrationStat[];
}) {
  const index = STAGES.findIndex((s) => s.id === stage.id);
  const caption = [
    `Stage ${index + 1} of ${STAGES.length}: ${stage.label}`,
    stage.basis,
    asOf ? `As of ${asOf}` : null,
  ]
    .filter(Boolean)
    .join(" \u00b7 ");

  return (
    <Illustration
      src={stage.clip}
      poster={stage.poster}
      video
      alt={`Illustration of the ${stage.label} stage`}
      caption={caption}
      stats={stats}
    />
  );
}
