"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

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
    "gmail.execute": "Gmail",
    "google_calendar.execute": "Calendar",
    "github.execute": "GitHub",
    "slack.execute": "Slack",
    "gmail.ciba_pending": "Gmail (pending)",
    "google_calendar.ciba_pending": "Calendar (pending)",
    "github.ciba_pending": "GitHub (pending)",
    "slack.ciba_pending": "Slack (pending)",
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

function statusDotClass(entry: AuditEntry): string {
  if (!entry.permitted) return "bg-le-red";
  if (!entry.success) return "bg-amber-400";
  return "bg-emerald-400";
}

export default function RecentActivity() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLog = useCallback(async () => {
    try {
      const res = await fetch("/api/audit");
      if (res.ok) {
        const data = await res.json();
        setEntries((data.entries || []).slice(0, 5));
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

  // Don't render anything if there are no entries and we're done loading
  if (!loading && entries.length === 0) return null;

  return (
    <section className="glass rounded-2xl px-5 py-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-le-text">Recent Activity</h3>
        <Link
          href="/settings"
          className="text-[11px] text-le-accent hover:text-le-accent/80 transition-colors"
        >
          View all
        </Link>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-2.5 animate-pulse">
              <div className="h-1.5 w-1.5 rounded-full bg-le-elevated shrink-0" />
              <div className="h-3 flex-1 rounded bg-le-elevated" />
              <div className="h-3 w-10 rounded bg-le-elevated shrink-0" />
            </div>
          ))}
        </div>
      ) : (
        <ul className="space-y-1.5 max-h-[160px] overflow-y-auto">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-le-elevated/40 transition-colors"
            >
              {/* Status dot */}
              <span
                className={`h-1.5 w-1.5 rounded-full shrink-0 ${statusDotClass(entry)}`}
              />

              {/* Description */}
              <span className="text-xs text-le-text truncate flex-1">
                {actionLabel(entry.action)}
                {entry.details ? (
                  <span className="text-le-muted"> &mdash; {entry.details}</span>
                ) : entry.target ? (
                  <span className="text-le-muted"> &mdash; {entry.target}</span>
                ) : null}
              </span>

              {/* Relative time */}
              <span className="text-[10px] text-le-muted/60 shrink-0 tabular-nums">
                {relativeTime(entry.timestamp)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
