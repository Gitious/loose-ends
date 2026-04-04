"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ChatPanel from "@/components/chat/ChatPanel";

type ChatState = "collapsed" | "open" | "expanded";

const PANEL_SIZES = {
  open: { width: 420, height: 540 },
  expanded: { width: 620, height: "80vh" as string | number },
};

export default function ChatDrawer() {
  const [state, setState] = useState<ChatState>("collapsed");

  // Focus input when opening
  useEffect(() => {
    if (state !== "collapsed") {
      const timer = setTimeout(() => {
        const ta = document.querySelector<HTMLTextAreaElement>(
          'textarea[placeholder*="loose ends"]'
        );
        ta?.focus();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [state]);

  // Escape to minimize
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape" && state !== "collapsed") {
      setState("collapsed");
    }
  }, [state]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <>
      {/* Backdrop for expanded state */}
      <AnimatePresence>
        {state === "expanded" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={() => setState("open")}
          />
        )}
      </AnimatePresence>

      {/* Floating container — fixed bottom-right */}
      <div className="fixed bottom-5 right-5 z-50">
        <AnimatePresence mode="wait">
          {state === "collapsed" ? (
            /* ── Collapsed: floating button ── */
            <motion.button
              key="collapsed"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }}
              onClick={() => setState("open")}
              className="group flex items-center gap-3 rounded-2xl border border-le-border/30 bg-le-surface/95 backdrop-blur-xl px-5 py-3.5 shadow-xl shadow-black/20 transition-all hover:border-le-accent/40 hover:shadow-[0_8px_32px_rgba(232,168,73,0.12)]"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-le-accent/15 text-le-accent transition-transform group-hover:scale-110">
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path fillRule="evenodd" d="M10 2c-2.236 0-4.43.18-6.57.524C1.993 2.755 1 4.014 1 5.426v5.148c0 1.413.993 2.67 2.43 2.902 1.168.188 2.352.327 3.55.414.28.02.521.18.642.413l1.713 3.293a.75.75 0 001.33 0l1.713-3.293c.121-.233.362-.393.642-.414 1.198-.087 2.382-.226 3.55-.414 1.437-.231 2.43-1.49 2.43-2.902V5.426c0-1.413-.993-2.67-2.43-2.902A41.289 41.289 0 0010 2z" clipRule="evenodd" />
                </svg>
              </div>
              <span className="text-sm text-le-muted group-hover:text-le-text transition-colors">
                Ask the agent...
              </span>
              <kbd className="hidden sm:inline-flex items-center rounded-md bg-le-void/60 border border-le-border/20 px-1.5 py-0.5 text-[10px] font-mono text-le-muted/50">
                Esc
              </kbd>
            </motion.button>
          ) : (
            /* ── Open / Expanded panel ── */
            <motion.div
              key="panel"
              initial={{ y: 20, opacity: 0, scale: 0.95 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 20, opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3, ease: [0.25, 1, 0.5, 1] }}
              style={{
                width: state === "expanded" ? PANEL_SIZES.expanded.width : PANEL_SIZES.open.width,
                height: state === "expanded" ? PANEL_SIZES.expanded.height : PANEL_SIZES.open.height,
              }}
              className="flex flex-col overflow-hidden rounded-2xl border border-le-border/30 bg-le-surface/[0.97] backdrop-blur-xl shadow-2xl shadow-black/30 transition-[width,height] duration-300 ease-[cubic-bezier(0.25,1,0.5,1)]"
            >
              {/* Header */}
              <div className="flex items-center gap-2.5 border-b border-le-border/20 bg-le-surface/50 px-4 py-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-le-accent/15 text-le-accent">
                  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
                    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
                    <circle cx="8" cy="8" r="2" fill="currentColor" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-le-text leading-none">Loose Ends Agent</h3>
                  <p className="text-[10px] text-le-muted/60 mt-0.5">Cross-service AI assistant</p>
                </div>

                {/* Expand / Contract */}
                <button
                  onClick={() => setState(state === "expanded" ? "open" : "expanded")}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-le-muted/50 transition-colors hover:bg-le-elevated/40 hover:text-le-muted"
                  aria-label={state === "expanded" ? "Contract" : "Expand"}
                >
                  {state === "expanded" ? (
                    <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5">
                      <path d="M10 2v4h4M6 14v-4H2M14 6l-4-4M2 10l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5">
                      <path d="M14 2l-4 4M2 14l4-4M10 2h4v4M6 14H2v-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>

                {/* Minimize */}
                <button
                  onClick={() => setState("collapsed")}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-le-muted/50 transition-colors hover:bg-le-elevated/40 hover:text-le-muted"
                  aria-label="Minimize chat"
                >
                  <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5">
                    <path d="M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>

                {/* Close */}
                <button
                  onClick={() => setState("collapsed")}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-le-muted/50 transition-colors hover:bg-le-red/10 hover:text-le-red"
                  aria-label="Close chat"
                >
                  <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                    <path fillRule="evenodd" d="M4.22 4.22a.75.75 0 011.06 0L8 6.94l2.72-2.72a.75.75 0 111.06 1.06L9.06 8l2.72 2.72a.75.75 0 11-1.06 1.06L8 9.06l-2.72 2.72a.75.75 0 01-1.06-1.06L6.94 8 4.22 5.28a.75.75 0 010-1.06z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>

              {/* Chat content */}
              <div className="flex-1 min-h-0">
                <ChatPanel expanded={state === "expanded"} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
