"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState, useCallback } from "react";

interface Memory {
  id: string;
  content: string;
  memo: string;
  source: "gmail" | "calendar" | "github" | "slack" | "chat" | "agent";
  createdAt: string;
}

const SOURCE_STYLES: Record<
  Memory["source"],
  { dot: string; text: string; label: string }
> = {
  gmail: { dot: "bg-red-400", text: "text-red-400/50", label: "Gmail" },
  calendar: { dot: "bg-blue-400", text: "text-blue-400/50", label: "Calendar" },
  github: { dot: "bg-orange-400", text: "text-orange-400/50", label: "GitHub" },
  slack: { dot: "bg-purple-400", text: "text-purple-400/50", label: "Slack" },
  chat: { dot: "bg-le-accent", text: "text-le-accent/50", label: "Chat" },
  agent: { dot: "bg-le-accent", text: "text-le-accent/50", label: "Agent" },
};

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 30) return `${diffDays}d ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

export default function MemoryPanel() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [newMemory, setNewMemory] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const fetchMemories = useCallback(async () => {
    try {
      const res = await fetch("/api/memories");
      if (res.ok) {
        const data: Memory[] = await res.json();
        data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setMemories(data);
      }
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchMemories(); }, [fetchMemories]);

  function handleDelete(memoryId: string) {
    setMemories((prev) => prev.filter((m) => m.id !== memoryId));
    fetch(`/api/memories?id=${encodeURIComponent(memoryId)}`, { method: "DELETE" })
      .catch(() => fetchMemories());
  }

  async function handleAdd() {
    if (!newMemory.trim()) return;
    setIsAdding(true);
    try {
      const res = await fetch("/api/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newMemory.trim(), source: "chat" }),
      });
      if (res.ok) {
        setNewMemory("");
        await fetchMemories();
      }
    } catch {}
    finally { setIsAdding(false); }
  }

  return (
    <motion.section
      className="glass rounded-2xl p-8"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15, duration: 0.4, ease: [0.25, 1, 0.5, 1] }}
    >
      <div className="flex items-center gap-3 mb-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-le-accent/10 text-le-accent">
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
            <path d="M10 2a6 6 0 00-6 6c0 2.04 1.02 3.84 2.57 4.93.19.13.33.33.38.57l.43 2a.5.5 0 00.49.4h4.26a.5.5 0 00.49-.4l.43-2c.05-.24.19-.44.38-.57A5.99 5.99 0 0016 8a6 6 0 00-6-6zm-1.5 15a.5.5 0 00.5.5h2a.5.5 0 000-1H9a.5.5 0 00-.5.5zm.5 2a.5.5 0 000 1h2a.5.5 0 000-1H9z" />
          </svg>
        </div>
        <div>
          <h2 className="text-xl font-semibold">What I&apos;ve Learned</h2>
          <p className="text-xs text-le-muted mt-0.5">Patterns picked up from your services</p>
        </div>
        {memories.length > 0 && (
          <span className="ml-auto rounded-full bg-le-elevated px-2 py-0.5 text-[10px] font-mono text-le-muted">
            {memories.length}
          </span>
        )}
      </div>

      {/* Add memory input */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={newMemory}
          onChange={(e) => setNewMemory(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
          placeholder="Teach the agent something..."
          className="flex-1 rounded-lg bg-le-void/50 border border-le-border/30 px-3 py-2 text-xs text-le-text placeholder:text-le-muted/40 outline-none focus:border-le-accent/40 focus:ring-1 focus:ring-le-accent/20 transition-all"
          disabled={isAdding}
        />
        <button
          onClick={handleAdd}
          disabled={isAdding || !newMemory.trim()}
          className="rounded-lg bg-le-accent/15 px-3 py-2 text-xs font-medium text-le-accent transition-all hover:bg-le-accent/25 disabled:opacity-30"
        >
          {isAdding ? "..." : "Add"}
        </button>
      </div>

      {/* Memory list — scrollable, matching audit log style */}
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-8 animate-pulse rounded bg-le-elevated/40" />
          ))}
        </div>
      ) : memories.length === 0 ? (
        <div className="py-8 text-center text-sm text-le-muted/60">
          No memories yet. Scan your services and the agent will learn your patterns.
        </div>
      ) : (
        <div className="max-h-[420px] overflow-y-auto rounded-lg border border-le-border/10 bg-le-void/30">
          <AnimatePresence mode="popLayout">
            {memories.map((memory) => {
              const style = SOURCE_STYLES[memory.source] ?? SOURCE_STYLES.chat;
              return (
                <motion.div
                  key={memory.id}
                  layout
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="group flex items-center gap-3 px-3.5 py-2.5 border-b border-le-border/6 last:border-b-0 transition-colors hover:bg-le-elevated/10"
                >
                  <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${style.dot}`} />
                  <p className="text-xs text-le-text/80 leading-relaxed flex-1 min-w-0">{memory.content}</p>
                  <span className={`text-[10px] shrink-0 ${style.text}`}>{style.label}</span>
                  <span className="text-[10px] text-le-muted/35 shrink-0 tabular-nums">{relativeTime(memory.createdAt)}</span>
                  <button
                    onClick={() => handleDelete(memory.id)}
                    className="shrink-0 h-5 w-5 flex items-center justify-center rounded text-le-muted/15 opacity-0 transition-all group-hover:opacity-100 hover:bg-le-red/10 hover:text-le-red"
                    aria-label="Delete"
                  >
                    <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                      <path d="M5.28 4.22a.75.75 0 00-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 101.06 1.06L8 9.06l2.72 2.72a.75.75 0 101.06-1.06L9.06 8l2.72-2.72a.75.75 0 00-1.06-1.06L8 6.94 5.28 4.22z" />
                    </svg>
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </motion.section>
  );
}
