"use client";

import { useState, useEffect, useRef } from "react";
import type { LooseEnd } from "@/lib/types";

export function useSuggestions(looseEnds: LooseEnd[]) {
  const [suggestions, setSuggestions] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const looseEndsRef = useRef(looseEnds);
  looseEndsRef.current = looseEnds;

  const looseEndIds = looseEnds.map((le) => le.id).join(",");

  useEffect(() => {
    if (!looseEndIds || looseEndsRef.current.length === 0) {
      setSuggestions({});
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    fetch("/api/scan/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ looseEnds: looseEndsRef.current }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setSuggestions(data.suggestions || {});
      })
      .catch(() => {
        // Suggestions are non-critical
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [looseEndIds]);

  return { suggestions, isLoading };
}
