"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ChatPanel from "@/components/chat/ChatPanel";

export default function ChatDrawer() {
  const [open, setOpen] = useState(false);

  // Focus the chat input when drawer opens
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => {
        const input = document.querySelector<HTMLInputElement>(
          'input[placeholder*="loose ends"]'
        );
        input?.focus();
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [open]);

  return (
    <div className="shrink-0 pt-3">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="glass flex w-full items-center gap-3 rounded-2xl px-5 py-3.5 text-sm text-le-muted transition-all hover:border-le-accent/30 hover:text-le-text"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-le-accent shrink-0">
            <path
              fillRule="evenodd"
              d="M10 2c-2.236 0-4.43.18-6.57.524C1.993 2.755 1 4.014 1 5.426v5.148c0 1.413.993 2.67 2.43 2.902 1.168.188 2.352.327 3.55.414.28.02.521.18.642.413l1.713 3.293a.75.75 0 001.33 0l1.713-3.293c.121-.233.362-.393.642-.414 1.198-.087 2.382-.226 3.55-.414 1.437-.231 2.43-1.49 2.43-2.902V5.426c0-1.413-.993-2.67-2.43-2.902A41.289 41.289 0 0010 2z"
              clipRule="evenodd"
            />
          </svg>
          <span className="truncate">Ask about your loose ends...</span>
          <svg viewBox="0 0 16 16" fill="currentColor" className="ml-auto h-3 w-3 text-le-muted/50 shrink-0">
            <path fillRule="evenodd" d="M6.22 4.22a.75.75 0 011.06 0l3.25 3.25a.75.75 0 010 1.06l-3.25 3.25a.75.75 0 01-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 010-1.06z" clipRule="evenodd" />
          </svg>
        </button>
      ) : (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "min(50vh, 350px)", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }}
          className="relative overflow-hidden"
        >
          <button
            onClick={() => setOpen(false)}
            className="absolute right-3 top-2 z-10 rounded-md p-1 text-le-muted transition-colors hover:text-le-text"
            aria-label="Close chat"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
              <path fillRule="evenodd" d="M4.22 4.22a.75.75 0 011.06 0L8 6.94l2.72-2.72a.75.75 0 111.06 1.06L9.06 8l2.72 2.72a.75.75 0 11-1.06 1.06L8 9.06l-2.72 2.72a.75.75 0 01-1.06-1.06L6.94 8 4.22 5.28a.75.75 0 010-1.06z" clipRule="evenodd" />
            </svg>
          </button>
          <div className="h-full">
            <ChatPanel />
          </div>
        </motion.div>
      )}
    </div>
  );
}
