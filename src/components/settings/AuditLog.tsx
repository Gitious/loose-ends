"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState, useCallback } from "react";

interface AuditEntry {
  id: string;
  timestamp: string;
  userId: string;
  action: string;
  service: string;
  target?: string;
  details?: string;
  permitted: boolean;
  success: boolean;
}

function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = now - then;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

function actionLabel(action: string): string {
  const labels: Record<string, string> = {
    "email.reply": "Email Reply",
    "email.trash": "Email Trash",
    "email.bulk_trash": "Bulk Trash",
    "github.comment": "GitHub Comment",
    "slack.send": "Slack Message",
    "permission.update": "Permission Change",
    scan: "Scan",
  };
  return labels[action] || action;
}

function ServiceIcon({ service }: { service: string }) {
  switch (service) {
    case "gmail":
      return (
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
        </svg>
      );
    case "github":
      return (
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor">
          <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
        </svg>
      );
    case "slack":
      return (
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none">
          <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52z" fill="#E01E5A" />
          <path d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834z" fill="#36C5F0" />
          <path d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834z" fill="#2EB67D" />
          <path d="M15.163 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.163 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52z" fill="#ECB22E" />
        </svg>
      );
    case "system":
      return (
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-le-muted">
          <path fillRule="evenodd" d="M10 2a1 1 0 00-1 1v1.323l-3.954 1.582-.16-.08a1 1 0 00-1.205.273l-.91 1.093A1 1 0 003 8.191v3.618a1 1 0 00.77 1l.91.227a1 1 0 001.205.273l.16-.08L10 14.81V16.132a1 1 0 002 0V14.81l3.954-1.582.16.08a1 1 0 001.205-.273l.91-1.093A1 1 0 0018 11.81V8.19a1 1 0 00-.77-1l-.91-.227a1 1 0 00-1.205-.273l-.16.08L11 5.188V3a1 1 0 00-1-1zM8 10a2 2 0 114 0 2 2 0 01-4 0z" clipRule="evenodd" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-le-muted">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
        </svg>
      );
  }
}

function StatusBadge({ permitted, success }: { permitted: boolean; success: boolean }) {
  if (!permitted) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-le-red/10 px-2 py-0.5 text-[10px] font-medium text-le-red">
        <span className="h-1.5 w-1.5 rounded-full bg-le-red" />
        Denied
      </span>
    );
  }
  if (!success) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
        Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
      Success
    </span>
  );
}

const COLLAPSED_COUNT = 5;

export default function AuditLog() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const fetchLog = useCallback(async () => {
    try {
      const res = await fetch("/api/audit");
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries || []);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLog();
  }, [fetchLog]);

  const visibleEntries = expanded ? entries : entries.slice(0, COLLAPSED_COUNT);
  const hasMore = entries.length > COLLAPSED_COUNT;

  return (
    <motion.section
      className="glass rounded-2xl p-8"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15, duration: 0.25, ease: [0.25, 1, 0.5, 1] }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-le-accent/10 text-le-accent">
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clipRule="evenodd" />
          </svg>
        </div>
        <div>
          <h2 className="text-xl font-semibold">Activity Log</h2>
          <p className="text-xs text-le-muted mt-0.5">
            Everything the agent has done on your behalf
          </p>
        </div>
        {entries.length > 0 && (
          <span className="ml-auto text-xs text-le-muted/60 tabular-nums">
            {entries.length} {entries.length === 1 ? "entry" : "entries"}
          </span>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 animate-pulse">
              <div className="h-8 w-8 rounded-lg bg-le-elevated" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-32 rounded bg-le-elevated" />
                <div className="h-2.5 w-48 rounded bg-le-elevated" />
              </div>
              <div className="h-5 w-16 rounded-full bg-le-elevated" />
            </div>
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-le-muted/60">
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-8 w-8 mb-2 opacity-40">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clipRule="evenodd" />
          </svg>
          <p className="text-sm">No actions taken yet.</p>
          <p className="text-xs mt-1">Actions will appear here once the agent starts working.</p>
        </div>
      ) : (
        <>
          <div className="space-y-1">
            <AnimatePresence initial={false}>
              {visibleEntries.map((entry, i) => (
                <motion.div
                  key={entry.id}
                  className="flex items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-le-elevated/40 transition-colors"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.15, delay: i < COLLAPSED_COUNT ? 0 : 0.02 * (i - COLLAPSED_COUNT) }}
                >
                  {/* Timeline dot + service icon */}
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-le-elevated mt-0.5">
                    <ServiceIcon service={entry.service} />
                  </div>

                  {/* Main content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-le-text truncate">
                        {actionLabel(entry.action)}
                      </span>
                      <StatusBadge permitted={entry.permitted} success={entry.success} />
                    </div>
                    {entry.details && (
                      <p className="text-xs text-le-muted mt-0.5 truncate">{entry.details}</p>
                    )}
                    {entry.target && (
                      <p className="text-[11px] text-le-muted/50 mt-0.5 truncate font-mono">
                        {entry.target}
                      </p>
                    )}
                  </div>

                  {/* Timestamp */}
                  <span className="text-[11px] text-le-muted/60 shrink-0 mt-1 tabular-nums">
                    {relativeTime(entry.timestamp)}
                  </span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {/* Show more / less */}
          {hasMore && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="mt-3 w-full rounded-lg border border-le-border/20 py-2 text-xs text-le-muted hover:text-le-text hover:border-le-border/40 transition-colors"
            >
              {expanded ? "Show less" : `Show all ${entries.length} entries`}
            </button>
          )}
        </>
      )}

      {/* FGA badge */}
      <div className="flex items-center justify-center mt-6 pt-4 border-t border-le-border/20">
        <span className="inline-flex items-center gap-1.5 text-[11px] text-le-muted/60">
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3">
            <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
          </svg>
          Audit trail powered by Auth0 FGA
        </span>
      </div>
    </motion.section>
  );
}
