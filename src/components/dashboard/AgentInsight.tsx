"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

interface Memory {
  id: string;
  content: string;
  source: string;
  timestamp?: string;
  createdAt?: string;
}

const SOURCE_COLOR: Record<string, string> = {
  gmail: "bg-blue-400",
  calendar: "bg-emerald-400",
  github: "bg-gray-400",
  slack: "bg-purple-400",
  chat: "bg-le-accent",
  agent: "bg-le-accent",
};

function relativeTime(iso: string | undefined): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (isNaN(then)) return "";
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export default function AgentInsight() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/memories")
      .then((r) => (r.ok ? r.json() : []))
      .then((mems) => setMemories(Array.isArray(mems) ? mems : []))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded || memories.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, delay: 0.25 }}
    >
      {/* Collapsed: single row showing count + latest learning preview */}
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-le-elevated/40"
        >
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-le-accent/10">
            <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 text-le-accent/70">
              <path d="M8 1a4 4 0 00-4 4 3.99 3.99 0 001.338 2.981A1.5 1.5 0 006 9.319V10.5a.5.5 0 00.5.5h3a.5.5 0 00.5-.5V9.319a1.5 1.5 0 00.662-1.338A3.99 3.99 0 0012 5a4 4 0 00-4-4zM6.5 12a.5.5 0 000 1h3a.5.5 0 000-1h-3z" />
            </svg>
          </div>
          <span className="flex-1 min-w-0 text-xs text-le-muted truncate">
            <span className="text-le-text/70 font-medium">{memories.length} patterns learned</span>
            <span className="text-le-muted/40"> — </span>
            <span className="text-le-muted/60">{memories[0].content}</span>
          </span>
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 text-le-muted/30 shrink-0">
            <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 011.06 0L8 8.94l2.72-2.72a.75.75 0 111.06 1.06l-3.25 3.25a.75.75 0 01-1.06 0L4.22 7.28a.75.75 0 010-1.06z" clipRule="evenodd" />
          </svg>
        </button>
      ) : (
        /* Expanded: full list */
        <div className="glass rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-le-accent/10">
                <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 text-le-accent/70">
                  <path d="M8 1a4 4 0 00-4 4 3.99 3.99 0 001.338 2.981A1.5 1.5 0 006 9.319V10.5a.5.5 0 00.5.5h3a.5.5 0 00.5-.5V9.319a1.5 1.5 0 00.662-1.338A3.99 3.99 0 0012 5a4 4 0 00-4-4zM6.5 12a.5.5 0 000 1h3a.5.5 0 000-1h-3z" />
                </svg>
              </div>
              <span className="text-xs font-medium text-le-text/80">{memories.length} patterns learned</span>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/settings" className="text-[10px] text-le-muted/40 hover:text-le-accent transition-colors">
                Manage
              </Link>
              <button
                onClick={() => setOpen(false)}
                className="text-le-muted/40 hover:text-le-text transition-colors"
              >
                <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                  <path fillRule="evenodd" d="M11.78 9.78a.75.75 0 01-1.06 0L8 7.06 5.28 9.78a.75.75 0 01-1.06-1.06l3.25-3.25a.75.75 0 011.06 0l3.25 3.25a.75.75 0 010 1.06z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>

          <div className="px-2 pb-2.5 max-h-[180px] overflow-y-auto">
            <AnimatePresence>
              {memories.map((mem, i) => {
                const dotColor = SOURCE_COLOR[mem.source] || "bg-le-muted";
                const ts = mem.timestamp || mem.createdAt;
                return (
                  <motion.div
                    key={mem.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.03 }}
                    className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-le-elevated/30 transition-colors"
                  >
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`} />
                    <p className="flex-1 min-w-0 text-xs text-le-text/70 truncate">{mem.content}</p>
                    {ts && <span className="text-[10px] text-le-muted/30 shrink-0 tabular-nums">{relativeTime(ts)}</span>}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>
      )}
    </motion.div>
  );
}
