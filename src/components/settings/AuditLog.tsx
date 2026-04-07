"use client";

import { motion } from "framer-motion";
import { useEffect, useState, useCallback } from "react";

interface AuditEntry {
  id: string;
  timestamp: string;
  action: string;
  service: string;
  target?: string;
  details?: string;
  permitted: boolean;
  success: boolean;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function getStatus(entry: AuditEntry): { label: string; dot: string; text: string } {
  if (!entry.permitted) return { label: "DENIED", dot: "bg-le-red", text: "text-le-red" };
  if (!entry.success) return { label: "FAILED", dot: "bg-le-red", text: "text-le-red" };
  return { label: "OK", dot: "bg-emerald-400", text: "text-emerald-400" };
}

export default function AuditLog() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLog = useCallback(async () => {
    try {
      const res = await fetch("/api/audit");
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries || []);
      }
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchLog(); }, [fetchLog]);

  // Group entries by date
  const grouped = entries.reduce<Record<string, AuditEntry[]>>((acc, entry) => {
    const date = formatDate(entry.timestamp);
    if (!acc[date]) acc[date] = [];
    acc[date].push(entry);
    return acc;
  }, {});

  return (
    <motion.section
      className="glass rounded-2xl p-8"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15, duration: 0.25, ease: [0.25, 1, 0.5, 1] }}
    >
      <div className="flex items-center gap-3 mb-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-le-accent/10 text-le-accent">
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clipRule="evenodd" />
          </svg>
        </div>
        <div>
          <h2 className="text-xl font-semibold">Activity Log</h2>
          <p className="text-xs text-le-muted mt-0.5">Agent actions and permission events</p>
        </div>
        {entries.length > 0 && (
          <span className="ml-auto rounded-full bg-le-elevated px-2 py-0.5 text-[10px] font-mono text-le-muted">
            {entries.length}
          </span>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-8 animate-pulse rounded bg-le-elevated/40" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="py-8 text-center text-sm text-le-muted/60">
          No actions taken yet.
        </div>
      ) : (
        <div className="max-h-96 overflow-y-auto rounded-lg border border-le-border/20 bg-le-void/60">
          {Object.entries(grouped).map(([date, items]) => (
            <div key={date}>
              <div className="sticky top-0 z-10 bg-le-surface/90 backdrop-blur-sm px-3 py-2 border-b border-le-border/15">
                <span className="text-[10px] font-mono uppercase tracking-wider text-le-muted/50">{date}</span>
              </div>
              {items.map((entry, i) => {
                const status = getStatus(entry);
                return (
                  <div
                    key={entry.id}
                    className={`flex items-center gap-3 px-3 py-2 text-xs border-b border-le-border/8 transition-colors hover:bg-le-elevated/20 ${
                      i % 2 === 0 ? "" : "bg-le-elevated/8"
                    }`}
                  >
                    <span className={`h-2.5 w-2.5 rounded-full shrink-0 ring-2 ${status.dot} ${status.dot === "bg-le-red" ? "ring-le-red/20" : "ring-emerald-400/20"}`} />
                    <span className="font-mono text-le-muted/60 shrink-0 tabular-nums w-16">{formatTime(entry.timestamp)}</span>
                    <span className="font-mono text-le-text/90 shrink-0 font-medium">{entry.action}</span>
                    <span className="text-le-muted/50 truncate flex-1 min-w-0">{entry.details || entry.target || ""}</span>
                    <span className={`font-mono text-[10px] font-semibold uppercase tracking-wide shrink-0 rounded-full px-2 py-0.5 ${
                      status.dot === "bg-le-red" ? "bg-le-red/10 text-le-red" : "bg-emerald-400/10 text-emerald-400"
                    }`}>{status.label}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-center mt-5 pt-3 border-t border-le-border/15">
        <span className="inline-flex items-center gap-1.5 text-[10px] text-le-muted/40">
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3">
            <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
          </svg>
          Powered by Auth0 FGA
        </span>
      </div>
    </motion.section>
  );
}
