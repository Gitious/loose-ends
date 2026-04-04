"use client";

import { useState, useEffect, useRef } from "react";
import type { LooseEnd } from "@/lib/types";

const CACHE_KEY = "le-suggestions";
const CACHE_IDS_KEY = "le-suggestions-ids";

export function useSuggestions(looseEnds: LooseEnd[]) {
  const [suggestions, setSuggestions] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const looseEndsRef = useRef(looseEnds);
  looseEndsRef.current = looseEnds;

  const looseEndIds = looseEnds.map((le) => le.id).join(",");

  useEffect(() => {
    if (!looseEndIds) return;

    // Try restoring from cache first
    try {
      const cachedIds = sessionStorage.getItem(CACHE_IDS_KEY);
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cachedIds === looseEndIds && cached) {
        setSuggestions(JSON.parse(cached));
        return; // Cache hit — don't fetch
      }
    } catch {}

    // Cache miss — fetch fresh suggestions
    let cancelled = false;
    setIsLoading(true);

    fetch("/api/scan/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ looseEnds: looseEndsRef.current }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) {
          const s = data.suggestions || {};
          setSuggestions(s);
          try {
            sessionStorage.setItem(CACHE_KEY, JSON.stringify(s));
            sessionStorage.setItem(CACHE_IDS_KEY, looseEndIds);
          } catch {}
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [looseEndIds]);

  return { suggestions, isLoading };
}
