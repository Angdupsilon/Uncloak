"use client";
import { useEffect, useState } from "react";

/** Fetch JSON for a URL; aborts stale requests and keeps the last data while reloading. */
export function useJson<T>(url: string | null) {
  const [state, setState] = useState<{ forUrl: string | null; data: T | null; error: string | null }>({
    forUrl: null,
    data: null,
    error: null,
  });

  useEffect(() => {
    if (!url) return;
    const ac = new AbortController();
    fetch(url, { signal: ac.signal })
      .then(async (r) => {
        const body = await r.json().catch(() => null);
        // An abort that lands while the body is streaming rejects r.json(); without
        // this check the stale request would store an empty body as data.
        if (ac.signal.aborted) return;
        if (!r.ok) throw new Error(body?.error ?? r.statusText);
        if (body == null) throw new Error("Invalid response");
        setState({ forUrl: url, data: body as T, error: null });
      })
      .catch((err: Error) => {
        if (ac.signal.aborted) return;
        setState((s) => ({ ...s, forUrl: url, error: err.message }));
      });
    return () => ac.abort();
  }, [url]);

  return {
    data: url ? state.data : null,
    loading: !!url && state.forUrl !== url,
    // Do not surface an error from the previous URL while a newer snapshot loads.
    error: url && state.forUrl === url ? state.error : null,
  };
}
