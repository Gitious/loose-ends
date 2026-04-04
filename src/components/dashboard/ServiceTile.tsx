"use client";

import { motion } from "framer-motion";
import type { LooseEnd } from "@/lib/types";

const SERVICE_META: Record<string, { label: string; color: string; gradient: string; icon: React.ReactNode }> = {
  email: {
    label: "Gmail",
    color: "text-red-400",
    gradient: "from-red-500/20 to-red-500/5",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
        <path d="M3 4a2 2 0 00-2 2v1.161l8.441 4.221a1.25 1.25 0 001.118 0L19 7.161V6a2 2 0 00-2-2H3z" />
        <path d="M19 8.839l-7.556 3.778a2.75 2.75 0 01-2.466-.022L1 8.839V14a2 2 0 002 2h14a2 2 0 002-2V8.839z" />
      </svg>
    ),
  },
  calendar: {
    label: "Calendar",
    color: "text-blue-400",
    gradient: "from-blue-500/20 to-blue-500/5",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6">
        <path fillRule="evenodd" d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75z" clipRule="evenodd" />
      </svg>
    ),
  },
  github: {
    label: "GitHub",
    color: "text-gray-300",
    gradient: "from-gray-400/20 to-gray-400/5",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
        <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
      </svg>
    ),
  },
  slack: {
    label: "Slack",
    color: "text-purple-400",
    gradient: "from-purple-500/20 to-purple-500/5",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
        <path d="M5.042 15.165a2.528 2.528 0 01-2.52 2.523A2.528 2.528 0 010 15.165a2.527 2.527 0 012.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 012.521-2.52 2.527 2.527 0 012.521 2.52v6.313A2.528 2.528 0 018.834 24a2.528 2.528 0 01-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 01-2.521-2.52A2.528 2.528 0 018.834 0a2.528 2.528 0 012.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 012.521 2.521 2.528 2.528 0 01-2.521 2.521H2.522A2.528 2.528 0 010 8.834a2.528 2.528 0 012.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 012.522-2.521A2.528 2.528 0 0124 8.834a2.528 2.528 0 01-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 01-2.523 2.521 2.527 2.527 0 01-2.52-2.521V2.522A2.527 2.527 0 0115.163 0a2.528 2.528 0 012.523 2.522v6.312zM15.163 18.956a2.528 2.528 0 012.523 2.522A2.528 2.528 0 0115.163 24a2.527 2.527 0 01-2.52-2.522v-2.522h2.52zM15.163 17.688a2.527 2.527 0 01-2.52-2.523 2.527 2.527 0 012.52-2.52h6.315A2.528 2.528 0 0124 15.163a2.528 2.528 0 01-2.522 2.523h-6.315z" />
      </svg>
    ),
  },
};

const URGENCY_DOT: Record<string, string> = {
  red: "bg-le-red",
  yellow: "bg-le-yellow",
  green: "bg-le-green",
};

export default function ServiceTile({
  type,
  items,
  connected,
  permissionDenied,
  isScanning,
  index,
  junkCount,
  autonomousStatus,
  onClick,
  onScanService,
}: {
  type: string;
  items: LooseEnd[];
  connected: boolean;
  permissionDenied?: boolean;
  isScanning?: boolean;
  index: number;
  junkCount?: number;
  autonomousStatus?: "idle" | "pending" | "done";
  onClick: () => void;
  onScanService?: () => void;
}) {
  const meta = SERVICE_META[type];
  if (!meta) return null;

  const urgentCount = items.filter((i) => i.urgency === "red").length;
  const preview = items.slice(0, 3);

  return (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.06, ease: [0.25, 1, 0.5, 1] }}
      className="glass group relative flex flex-col overflow-hidden rounded-2xl p-6 text-left transition-all duration-150 hover:border-le-accent/30 hover:shadow-[0_0_40px_rgba(232,168,73,0.08)] hover:scale-[1.01] active:scale-[0.985]"
    >
      {/* Gradient background accent */}
      <div className={`absolute inset-0 bg-gradient-to-br ${meta.gradient} opacity-0 transition-opacity duration-300 group-hover:opacity-100`} />

      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-le-elevated ${meta.color}`}>
              {meta.icon}
            </div>
            <div>
              <h3 className="text-base font-semibold text-le-text">{meta.label}</h3>
              {connected ? (
                <span className="flex items-center gap-1.5 text-[11px] text-le-green">
                  <span className="h-1.5 w-1.5 rounded-full bg-le-green" />
                  Connected
                </span>
              ) : (
                <span className="text-[11px] text-le-muted">Not connected</span>
              )}
            </div>
          </div>

          {(items.length > 0 || (junkCount && junkCount > 0)) && (
            <div className="flex items-center gap-2">
              {items.length > 0 && (
                <span className="rounded-full bg-le-elevated px-2.5 py-1 text-xs font-medium text-le-text">
                  {items.length}
                </span>
              )}
              {urgentCount > 0 && (
                <span className="rounded-full bg-le-red/15 px-2.5 py-1 text-xs font-medium text-le-red">
                  {urgentCount} urgent
                </span>
              )}
            </div>
          )}
        </div>

        {/* Permission denied indicator */}
        {permissionDenied && connected && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-le-yellow/20 bg-le-yellow/5 px-3 py-2">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 shrink-0 text-le-yellow">
              <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
            </svg>
            <span className="text-[11px] text-le-yellow">Scan blocked by permissions</span>
          </div>
        )}

        {/* Preview items */}
        {isScanning && items.length === 0 ? (
          <div className="mt-4 space-y-2">
            {[70, 55, 45].map((w, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg bg-le-void/40 px-3 py-2">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-le-muted/30 animate-pulse" />
                <div className="h-3 rounded bg-le-elevated animate-pulse" style={{ width: `${w}%`, animationDelay: `${i * 120}ms` }} />
              </div>
            ))}
          </div>
        ) : preview.length > 0 ? (
          <div className="mt-4 space-y-2">
            {preview.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-2 rounded-lg bg-le-void/40 px-3 py-2"
              >
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${URGENCY_DOT[item.urgency]}`} />
                <span className="truncate text-xs text-le-text">{item.title}</span>
                <span className="ml-auto shrink-0 text-[10px] text-le-muted">{item.age}</span>
              </div>
            ))}
            {items.length > 3 && (
              <p className="text-center text-[11px] text-le-muted">
                +{items.length - 3} more
              </p>
            )}
          </div>
        ) : connected ? (
          <div className="mt-4 flex flex-col items-center py-3">
            <div className="relative mb-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-le-green/10">
                <svg viewBox="0 0 16 16" fill="currentColor" className="h-4.5 w-4.5 text-le-green">
                  <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 01.208 1.04l-5 7.5a.75.75 0 01-1.154.114l-3-3a.75.75 0 011.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 011.04-.207z" clipRule="evenodd" />
                </svg>
              </div>
              <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-le-surface bg-le-green" />
            </div>
            <span className="text-sm font-medium text-le-text/90">All caught up</span>
            <span className="mt-0.5 text-[11px] text-le-muted">
              {type === "email" ? "Inbox clear for the last 14 days" :
               type === "calendar" ? "No conflicts in the next 48h" :
               type === "github" ? "No pending reviews or stale issues" :
               "No unanswered messages"}
            </span>
            {onScanService && (
              <span
                role="link"
                tabIndex={0}
                onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); onScanService(); }}
                className="mt-2 text-[11px] text-le-accent/70 hover:text-le-accent transition-colors cursor-pointer"
              >
                Scan again
              </span>
            )}
          </div>
        ) : (
          <div className="mt-4 flex flex-col items-center rounded-xl border border-dashed border-le-border/40 py-4">
            <div className="mb-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-le-elevated">
              <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5 text-le-muted">
                <path d="M8.75 3.75a.75.75 0 00-1.5 0v3.5h-3.5a.75.75 0 000 1.5h3.5v3.5a.75.75 0 001.5 0v-3.5h3.5a.75.75 0 000-1.5h-3.5v-3.5z" />
              </svg>
            </div>
            <span className="text-xs font-medium text-le-muted">Connect {meta.label}</span>
          </div>
        )}

        {/* Junk email indicator — transforms during autonomous cleanup */}
        {autonomousStatus === "done" ? (
          <div className="mt-3 rounded-lg bg-le-green/8 border border-le-green/15 px-3 py-2">
            <div className="flex items-center gap-2">
              <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5 text-le-green">
                <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 01.208 1.04l-5 7.5a.75.75 0 01-1.154.114l-3-3a.75.75 0 011.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 011.04-.207z" clipRule="evenodd" />
              </svg>
              <span className="text-[11px] font-medium text-le-green">Junk emails cleaned autonomously</span>
            </div>
            <p className="text-[10px] text-le-green/60 mt-0.5 pl-5">Approved via Auth0 Guardian</p>
          </div>
        ) : autonomousStatus === "pending" ? (
          <div className="mt-3 rounded-lg bg-le-accent/5 border border-le-accent/15 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-le-accent/50" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-le-accent" />
              </span>
              <span className="text-[11px] font-medium text-le-accent">Agent wants to trash junk emails</span>
            </div>
            <p className="text-[10px] text-le-muted mt-1 pl-4.5">Waiting for your approval on Auth0 Guardian</p>
            <div className="flex items-center gap-1 mt-1.5 pl-4.5">
              <svg viewBox="0 0 16 16" fill="currentColor" className="h-2.5 w-2.5 text-le-muted/40">
                <path d="M8 1a4.5 4.5 0 00-4.5 4.5V8H3a1 1 0 00-1 1v5a1 1 0 001 1h10a1 1 0 001-1V9a1 1 0 00-1-1h-.5V5.5A4.5 4.5 0 008 1zm2.5 4.5V8h-5V5.5a2.5 2.5 0 015 0z" />
              </svg>
              <span className="text-[10px] text-le-muted/40">CIBA step-up authentication</span>
            </div>
          </div>
        ) : junkCount != null && junkCount > 0 ? (
          <div className="mt-2 flex items-center gap-1.5 px-1">
            <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 text-le-accent/60">
              <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 000 1.5h.3l.815 8.15A1.5 1.5 0 005.357 15h5.285a1.5 1.5 0 001.493-1.35l.815-8.15h.3a.75.75 0 000-1.5H11V3.25A2.25 2.25 0 008.75 1h-1.5A2.25 2.25 0 005 3.25zm2.25-.75a.75.75 0 00-.75.75V4h3V3.25a.75.75 0 00-.75-.75h-1.5z" clipRule="evenodd" />
            </svg>
            <span className="text-[11px] text-le-accent/70">{junkCount} junk detected</span>
          </div>
        ) : null}

        {/* Arrow indicator */}
        {connected && (items.length > 0 || (junkCount != null && junkCount > 0)) && (
          <div className="mt-3 flex items-center justify-end text-le-muted transition-colors group-hover:text-le-accent">
            <span className="text-xs">View all</span>
            <svg viewBox="0 0 16 16" fill="currentColor" className="ml-1 h-3 w-3 transition-transform group-hover:translate-x-0.5">
              <path fillRule="evenodd" d="M6.22 4.22a.75.75 0 011.06 0l3.25 3.25a.75.75 0 010 1.06l-3.25 3.25a.75.75 0 01-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 010-1.06z" clipRule="evenodd" />
            </svg>
          </div>
        )}
      </div>
    </motion.button>
  );
}
