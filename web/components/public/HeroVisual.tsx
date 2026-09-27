"use client";

import { useRef, useState } from "react";

export default function HeroVisual() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
  };

  return (
    <>
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl bg-black">
      <video
        ref={videoRef}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        disablePictureInPicture
        onPlay={() => setPaused(false)}
        onPause={() => setPaused(true)}
        className="absolute inset-0 h-full w-full object-cover"
      >
        <source src="/hero/hero-loop-smooth.mp4" type="video/mp4" />
      </video>
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.7),rgba(0,0,0,0.15))]" />
      <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(0,0,0,0.7),transparent_85%)]" />
    </div>
    <button
      type="button"
      onClick={togglePlayback}
      className="absolute right-5 top-5 z-10 rounded-full border border-white/30 bg-black/35 px-3 py-2 text-[12px] text-white backdrop-blur-sm hover:bg-black/60"
      aria-label={paused ? "Play background video" : "Pause background video"}
    >
      {paused ? "Play video" : "Pause video"}
    </button>
    </>
  );
}
