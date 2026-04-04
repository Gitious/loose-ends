"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { JunkEmail } from "@/lib/types";

export default function JunkCleanupBanner({
  junkEmails,
  onCleanup,
  onRescue,
}: {
  junkEmails: JunkEmail[];
  onCleanup: () => Promise<void>;
  onRescue?: (junkEmail: JunkEmail) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [done, setDone] = useState(false);
  const count = junkEmails.length;

  if (count === 0) return null;

  async function handleCleanup() {
    setCleaning(true);
    try {
      await onCleanup();
      setDone(true);
    } catch {
      // Error handled by parent
    } finally {
      setCleaning(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="glass mb-5 overflow-hidden rounded-2xl"
    >
      <div className="p-5">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-le-accent/10 text-le-accent">
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 000 1.5h.3l.815 8.15A1.5 1.5 0 005.357 15h5.285a1.5 1.5 0 001.493-1.35l.815-8.15h.3a.75.75 0 000-1.5H11V3.25A2.25 2.25 0 008.75 1h-1.5A2.25 2.25 0 005 3.25zm2.25-.75a.75.75 0 00-.75.75V4h3V3.25a.75.75 0 00-.75-.75h-1.5zM6.05 6a.75.75 0 01.787.713l.275 5.5a.75.75 0 01-1.498.075l-.275-5.5A.75.75 0 016.05 6zm3.9 0a.75.75 0 01.712.787l-.275 5.5a.75.75 0 01-1.498-.075l.275-5.5A.75.75 0 019.95 6z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <AnimatePresence mode="wait">
                {done ? (
                  <motion.p
                    key="done"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-sm font-medium text-le-green"
                  >
                    Done! {count} emails moved to trash
                  </motion.p>
                ) : (
                  <motion.p
                    key="count"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-sm font-medium text-le-text"
                  >
                    {count} promotional email{count !== 1 ? "s" : ""} detected
                  </motion.p>
                )}
              </AnimatePresence>
              {!done && (
                <p className="text-[11px] text-le-muted mt-0.5">
                  Low-importance emails that can be safely cleaned up
                </p>
              )}
            </div>
          </div>

          {!done && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setExpanded(!expanded)}
                className="rounded-xl px-3 py-1.5 text-xs font-medium text-le-muted transition-all hover:bg-le-elevated/50 hover:text-le-text"
              >
                {expanded ? "Hide" : "Preview"}
              </button>
              <button
                onClick={handleCleanup}
                disabled={cleaning}
                className="rounded-xl bg-le-accent px-4 py-1.5 text-xs font-medium text-le-void transition-all hover:shadow-[0_0_20px_rgba(232,168,73,0.3)] active:scale-[0.97] disabled:opacity-50"
              >
                {cleaning ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-3 w-3 animate-spin rounded-full border border-le-void/30 border-t-le-void" />
                    Cleaning...
                  </span>
                ) : (
                  "Clean Up All"
                )}
              </button>
            </div>
          )}
        </div>

        {/* Expandable list */}
        <AnimatePresence>
          {expanded && !done && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="mt-4 max-h-48 space-y-1.5 overflow-y-auto">
                {junkEmails.map((junk) => (
                  <div
                    key={junk.id}
                    className="flex items-center gap-2 rounded-lg bg-le-void/40 px-3 py-2"
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-le-muted/40" />
                    <span className="truncate text-xs text-le-muted">
                      {junk.from}
                    </span>
                    <span className="mx-1 text-le-border">-</span>
                    <span className="truncate text-xs text-le-text/70">
                      {junk.subject}
                    </span>
                    {onRescue && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRescue(junk);
                        }}
                        className="ml-auto shrink-0 rounded-lg px-2 py-1 text-[11px] font-medium text-le-accent transition-all hover:bg-le-accent/10"
                      >
                        Keep
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
