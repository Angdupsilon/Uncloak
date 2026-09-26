"use client";
// Opt-in browser location. Nothing is requested until the visitor presses the button, and
// the coordinates only travel in the /near URL (rounded to ~100 m). They are never stored.
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LocateButton({ radius, className = "", dark = false }: { radius?: number; className?: string; dark?: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "locating" | "error">("idle");
  const [msg, setMsg] = useState("");

  const locate = () => {
    if (!("geolocation" in navigator)) {
      setState("error");
      setMsg("Your browser doesn't share location. Type a city, ZIP or address instead.");
      return;
    }
    setState("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(3);
        const lon = pos.coords.longitude.toFixed(3);
        setState("idle");
        router.push(`/near?lat=${lat}&lon=${lon}${radius ? `&radius=${radius}` : ""}`);
      },
      (err) => {
        setState("error");
        setMsg(
          err.code === err.PERMISSION_DENIED
            ? "Location access was declined. You can type a city, ZIP or address instead."
            : "We couldn't get your location. Type a city, ZIP or address instead.",
        );
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  };

  return (
    <span className={`inline-flex shrink-0 flex-wrap items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={locate}
        disabled={state === "locating"}
        title="Uses your browser's location once to find nearby sites. Not stored."
        className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-semibold disabled:opacity-60 ${dark ? "bg-white text-black hover:bg-[#e7eaf0]" : "bg-white text-black ring-1 ring-inset ring-black hover:bg-[#e7eaf0]"}`}
      >
        <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
          <circle cx="8" cy="8" r="2.5" />
          <path d="M8 1v2.5M8 12.5V15M1 8h2.5M12.5 8H15" strokeLinecap="round" />
        </svg>
        {state === "locating" ? "Locating…" : "Use my location"}
      </button>
      <span role="status" className={`text-[12px] ${dark ? "text-white" : "text-red-800"}`}>
        {state === "error" ? msg : ""}
      </span>
    </span>
  );
}
