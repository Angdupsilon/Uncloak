import { isLink } from "@/lib/format";

export function ExternalLinkIcon({ className = "h-3 w-3" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M6 3H3.75A1.75 1.75 0 0 0 2 4.75v7.5C2 13.216 2.784 14 3.75 14h7.5A1.75 1.75 0 0 0 13 12.25V10" />
      <path d="M9 2h5v5M14 2 7.5 8.5" />
    </svg>
  );
}

/** Link to an original record. Opens in a new tab and says so to screen readers. */
export function SourceLink({ url, label = "Source", className = "" }: { url: string | null | undefined; label?: string; className?: string }) {
  if (isLink(url)) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className={`gs-source-link inline-flex items-center gap-1 font-medium underline-offset-2 transition-colors ${className}`}
      >
        {label}
        <ExternalLinkIcon />
        <span className="sr-only">(opens in a new tab)</span>
      </a>
    );
  }
  return url ? <span className="break-all text-slate-400">{url}</span> : <span className="text-slate-400">No source link</span>;
}
