"use client";

import { useState, useEffect } from "react";
import type { LooseEnd, JunkEmail, AgentSuggestion } from "@/lib/types";

interface SuggestionsResult {
  suggestions: Record<string, string>;
  agentSuggestions: AgentSuggestion[];
  isLoading: boolean;
}

let lastFetchedFingerprint = "";

export function useSuggestions(
  looseEnds: LooseEnd[],
  junkEmails?: JunkEmail[],
): SuggestionsResult {
  const [suggestions, setSuggestions] = useState<Record<string, string>>({});
  const [agentSuggestions, setAgentSuggestions] = useState<AgentSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const itemCount = looseEnds.length;
  const junkCount = junkEmails?.length ?? 0;

  useEffect(() => {
    if (itemCount === 0 && junkCount === 0) return;

    const fingerprint = looseEnds.map((le) => le.id).sort().join(",") + "|" + junkCount;
    if (fingerprint === lastFetchedFingerprint) return;
    lastFetchedFingerprint = fingerprint;

    setIsLoading(true);

    const body = JSON.stringify({ looseEnds, junkEmails });

    fetch("/api/scan/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data.suggestions)) {
          setAgentSuggestions(data.suggestions);
          setSuggestions(data.textSuggestions || {});
        } else {
          setSuggestions(data.suggestions || {});
          setAgentSuggestions([]);
        }
      })
      .catch((err) => {
        console.error("[useSuggestions] Fetch error:", err);
      })
      .finally(() => {
        setIsLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemCount, junkCount]);

  return { suggestions, agentSuggestions, isLoading };
}
