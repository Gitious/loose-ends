"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState, useCallback } from "react";

interface Memory {
  id: string;
  content: string;
  source: "gmail" | "calendar" | "github" | "slack" | "chat" | "agent";
  createdAt: string;
}

const SOURCE_STYLES: Record<
  Memory["source"],
  { bg: string; text: string; label: string }
> = {
  gmail: { bg: "bg-blue-500/15", text: "text-blue-400", label: "Gmail" },
  calendar: { bg: "bg-le-green/15", text: "text-le-green", label: "Calendar" },
  github: { bg: "bg-le-muted/15", text: "text-le-text", label: "GitHub" },
  slack: { bg: "bg-purple-500/15", text: "text-purple-400", label: "Slack" },
  chat: { bg: "bg-le-accent/15", text: "text-le-accent", label: "Chat" },
  agent: { bg: "bg-le-accent/15", text: "text-le-accent", label: "Agent" },
};

function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 30) return `${diffDays}d ago`;
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return `${months}mo ago`;
  }
  const years = Math.floor(diffDays / 365);
  return `${years}y ago`;
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
}

export default function MemoryPanel() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const fetchMemories = useCallback(async () => {
    try {
      const res = await fetch("/api/memories");
      if (res.ok) {
        const data: Memory[] = await res.json();
        // Sort by createdAt descending (newest first)
        data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setMemories(data);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMemories();
  }, [fetchMemories]);

  function handleDelete(memoryId: string) {
    // Optimistic delete
    setMemories((prev) => prev.filter((m) => m.id !== memoryId));
    fetch(`/api/memories?id=${encodeURIComponent(memoryId)}`, {
      method: "DELETE",
    }).catch(() => {
      // If delete fails, refetch to restore state
      fetchMemories();
    });
  }

  return (
    <motion.section
      className="glass rounded-2xl p-8 space-y-6"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15, duration: 0.4, ease: [0.25, 1, 0.5, 1] }}
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-le-accent/10 text-le-accent">
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-5 w-5"
          >
            <path d="M10 2a6 6 0 00-6 6c0 2.04 1.02 3.84 2.57 4.93.19.13.33.33.38.57l.43 2a.5.5 0 00.49.4h4.26a.5.5 0 00.49-.4l.43-2c.05-.24.19-.44.38-.57A5.99 5.99 0 0016 8a6 6 0 00-6-6zm-1.5 15a.5.5 0 00.5.5h2a.5.5 0 000-1H9a.5.5 0 00-.5.5zm.5 2a.5.5 0 000 1h2a.5.5 0 000-1H9z" />
          </svg>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold">What I&apos;ve Learned</h2>
            {memories.length > 0 && (
              <span className="rounded-full bg-le-elevated px-2 py-0.5 text-xs font-medium text-le-muted">
                {memories.length}
              </span>
            )}
          </div>
          <p className="text-xs text-le-muted mt-0.5">
            Patterns and context picked up from your connected services
          </p>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-sm text-le-muted py-4">Loading memories...</div>
      ) : memories.length === 0 ? (
        <motion.div
          className="flex flex-col items-center justify-center py-10 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-le-elevated mb-4">
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-6 w-6 text-le-muted"
            >
              <path d="M10 2a6 6 0 00-6 6c0 2.04 1.02 3.84 2.57 4.93.19.13.33.33.38.57l.43 2a.5.5 0 00.49.4h4.26a.5.5 0 00.49-.4l.43-2c.05-.24.19-.44.38-.57A5.99 5.99 0 0016 8a6 6 0 00-6-6zm-1.5 15a.5.5 0 00.5.5h2a.5.5 0 000-1H9a.5.5 0 00-.5.5zm.5 2a.5.5 0 000 1h2a.5.5 0 000-1H9z" />
            </svg>
          </div>
          <p className="text-sm text-le-muted leading-relaxed max-w-xs">
            No memories yet. Start scanning and I&apos;ll learn your patterns.
          </p>
        </motion.div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {(expanded ? memories : memories.slice(0, 3)).map((memory, i) => {
              const style = SOURCE_STYLES[memory.source] ?? SOURCE_STYLES.chat;
              const recent = isToday(memory.createdAt);
              return (
                <motion.div
                  key={memory.id}
                  layout
                  className={`group relative rounded-xl border border-le-border/50 bg-le-surface/60 p-4 transition-colors duration-150 hover:border-le-border ${recent ? "border-l-2 border-l-le-accent" : ""}`}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -12, transition: { duration: 0.2 } }}
                  transition={{
                    delay: i * 0.04,
                    duration: 0.35,
                    ease: [0.25, 1, 0.5, 1],
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-le-text leading-relaxed">
                        {memory.content}
                      </p>
                      <div className="flex items-center gap-2 mt-2.5">
                        <span
                          className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ${style.bg} ${style.text}`}
                        >
                          {style.label}
                        </span>
                        <span className="text-[11px] text-le-muted">
                          {relativeTime(memory.createdAt)}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(memory.id)}
                      className="shrink-0 flex h-7 w-7 items-center justify-center rounded-lg text-le-muted opacity-0 transition-all duration-150 group-hover:opacity-100 hover:bg-le-red/10 hover:text-le-red"
                      aria-label="Delete memory"
                    >
                      <svg
                        viewBox="0 0 16 16"
                        fill="currentColor"
                        className="h-3.5 w-3.5"
                      >
                        <path
                          fillRule="evenodd"
                          d="M5 3.25V4H2.75a.75.75 0 000 1.5h.3l.815 8.15A1.5 1.5 0 005.357 15h5.285a1.5 1.5 0 001.493-1.35l.815-8.15h.3a.75.75 0 000-1.5H11V3.25A2.25 2.25 0 008.75 1h-1.5A2.25 2.25 0 005 3.25zm2.25-.75a.75.75 0 00-.75.75V4h3V3.25a.75.75 0 00-.75-.75h-1.5zM6.05 6a.75.75 0 01.787.713l.275 5.5a.75.75 0 01-1.498.075l-.275-5.5A.75.75 0 016.05 6zm3.9 0a.75.75 0 01.712.787l-.275 5.5a.75.75 0 01-1.498-.075l.275-5.5A.75.75 0 019.95 6z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {/* Show all / Show less toggle */}
          {memories.length > 3 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="w-full rounded-xl py-2 text-center text-xs font-medium text-le-muted transition-colors hover:text-le-accent"
            >
              {expanded ? "Show less" : `Show all (${memories.length})`}
            </button>
          )}
        </div>
      )}
    </motion.section>
  );
}
