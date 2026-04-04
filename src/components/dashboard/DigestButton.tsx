"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { LooseEnd } from "@/lib/types";

export default function DigestButton({
  items,
  junkCount,
}: {
  items: LooseEnd[];
  junkCount: number;
}) {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSendDigest() {
    if (items.length === 0) {
      setStatus("error");
      setErrorMsg("No loose ends to digest.");
      setTimeout(() => setStatus("idle"), 3000);
      return;
    }

    setStatus("sending");
    setErrorMsg(null);

    try {
      const res = await fetch("/api/cron/daily-digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ looseEnds: items, junkCount }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to send digest");
      }

      setStatus("sent");
      setTimeout(() => setStatus("idle"), 4000);
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong");
      setTimeout(() => setStatus("idle"), 4000);
    }
  }

  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-le-accent/10 text-le-accent">
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path d="M3 4a2 2 0 00-2 2v1.161l8.441 4.221a1.25 1.25 0 001.118 0L19 7.162V6a2 2 0 00-2-2H3z" />
            <path d="M19 8.839l-7.77 3.885a2.75 2.75 0 01-2.46 0L1 8.839V14a2 2 0 002 2h14a2 2 0 002-2V8.839z" />
          </svg>
        </div>
        <h3 className="text-sm font-semibold text-le-text">Daily Digest</h3>
      </div>
      <p className="text-xs text-le-muted leading-relaxed mb-3">
        Send yourself an email summary of your current loose ends.
      </p>

      <button
        onClick={handleSendDigest}
        disabled={status === "sending"}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-le-elevated px-3 py-2 text-xs font-medium text-le-text transition-all duration-150 hover:bg-le-accent/15 hover:text-le-accent active:scale-[0.98] disabled:opacity-50"
      >
        {status === "sending" ? (
          <>
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-le-muted/30 border-t-le-accent" />
            Sending...
          </>
        ) : status === "sent" ? (
          <>
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-3.5 w-3.5 text-le-green"
            >
              <path
                fillRule="evenodd"
                d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-le-green">Digest sent!</span>
          </>
        ) : (
          <>
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-3.5 w-3.5"
            >
              <path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.289z" />
            </svg>
            Send Digest Email
          </>
        )}
      </button>

      <AnimatePresence>
        {status === "error" && errorMsg && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-2 text-[11px] text-le-red leading-relaxed"
          >
            {errorMsg}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
