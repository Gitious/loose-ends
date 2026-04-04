"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { LooseEnd, JunkEmail } from "@/lib/types";

/* ── Unified suggestion type ── */

export interface Suggestion {
  id: string;
  kind: "junk_cleanup" | "urgent_reply" | "meeting_prep" | "stale_review" | "ai_tip" | "slack_followup" | "schedule_event";
  title: string;
  description: string;
  service: "gmail" | "calendar" | "github" | "slack";
  tier: "auto" | "confirm" | "ciba";
  priority: number; // higher = more important
  meta?: Record<string, string>;
}

/* ── Service visual config ── */

const SERVICE_ICON: Record<string, { color: string; bg: string; icon: React.ReactNode }> = {
  gmail: {
    color: "text-red-400",
    bg: "bg-red-400/10",
    icon: <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5"><path d="M2 4.5A1.5 1.5 0 013.5 3h9A1.5 1.5 0 0114 4.5v7a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 11.5v-7zm1.5-.2L8 7.9l4.5-3.6V4.5h-9v-.2zM3.5 6l4.15 3.3a.5.5 0 00.7 0L12.5 6v5.5h-9V6z" /></svg>,
  },
  calendar: {
    color: "text-blue-400",
    bg: "bg-blue-400/10",
    icon: <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5"><path fillRule="evenodd" d="M4 1.5a.5.5 0 01.5.5v1h7V2a.5.5 0 011 0v1h.5A2 2 0 0115 5v8a2 2 0 01-2 2H3a2 2 0 01-2-2V5a2 2 0 012-2h.5V2a.5.5 0 01.5-.5zM3 7v6h10V7H3z" clipRule="evenodd" /></svg>,
  },
  github: {
    color: "text-gray-400",
    bg: "bg-gray-400/10",
    icon: <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5"><path d="M8 .2A8 8 0 005.47 15.79c.4.07.55-.17.55-.38l-.01-1.49c-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.42 7.42 0 014 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48l-.01 2.2c0 .21.15.46.55.38A8.01 8.01 0 008 .2z" /></svg>,
  },
  slack: {
    color: "text-purple-400",
    bg: "bg-purple-400/10",
    icon: <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5"><path d="M3.5 9a1.5 1.5 0 110-3H5v1.5A1.5 1.5 0 013.5 9zm3-6A1.5 1.5 0 118 4.5V3H6.5zM12.5 7a1.5 1.5 0 110 3H11V8.5A1.5 1.5 0 0112.5 7zm-3 6A1.5 1.5 0 118 11.5V13h1.5zM5 6.5A1.5 1.5 0 016.5 5H8v3H6.5A1.5 1.5 0 015 6.5zM8 8h3v1.5A1.5 1.5 0 019.5 11H8V8zM8 5V3h1.5A1.5 1.5 0 0111 4.5V5H8zM5 11V8H3.5A1.5 1.5 0 002 9.5v.01A1.5 1.5 0 003.5 11H5z" /></svg>,
  },
};

const TIER_ACCENT = {
  auto: "from-emerald-500/60 to-emerald-500/0",
  confirm: "from-le-accent/60 to-le-accent/0",
  ciba: "from-amber-500/60 to-amber-500/0",
};

const TIER_BADGE = {
  auto: { bg: "bg-emerald-500/10 text-emerald-400", label: "Auto" },
  confirm: { bg: "bg-le-accent/10 text-le-accent", label: "Confirm" },
  ciba: { bg: "bg-amber-500/10 text-amber-400", label: "Approve" },
};

const KIND_ICON: Record<string, React.ReactNode> = {
  junk_cleanup: (
    <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
      <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 000 1.5h.3l.815 8.15A1.5 1.5 0 005.357 15h5.285a1.5 1.5 0 001.493-1.35l.815-8.15h.3a.75.75 0 000-1.5H11V3.25A2.25 2.25 0 008.75 1h-1.5A2.25 2.25 0 005 3.25zm2.25-.75a.75.75 0 00-.75.75V4h3V3.25a.75.75 0 00-.75-.75h-1.5z" clipRule="evenodd" />
    </svg>
  ),
  urgent_reply: (
    <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
      <path d="M1 8.74c0 .983.713 1.825 1.69 1.943.764.092 1.534.164 2.31.216v2.35a.75.75 0 001.238.57L9.05 11.2c.315-.024.63-.05.945-.08.976-.117 1.689-.96 1.689-1.942V5.562c0-.983-.713-1.825-1.69-1.943a44.5 44.5 0 00-7.989 0C1.713 3.737 1 4.58 1 5.562v3.178z" />
    </svg>
  ),
  meeting_prep: (
    <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clipRule="evenodd" />
    </svg>
  ),
  stale_review: (
    <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
      <path d="M5.75 1a.75.75 0 00-.75.75v3c0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75v-3a.75.75 0 00-.75-.75h-4.5zm-2.5 3v-.25a.25.25 0 01.25-.25H4v1.25A2.25 2.25 0 006.25 7h3.5A2.25 2.25 0 0012 4.75V3.5h.5a.25.25 0 01.25.25V13a.25.25 0 01-.25.25h-9a.25.25 0 01-.25-.25V4z" />
    </svg>
  ),
  ai_tip: (
    <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
      <path d="M10 2a6 6 0 00-6 6c0 2.04 1.02 3.84 2.57 4.93.19.13.33.33.38.57l.43 2a.5.5 0 00.49.4h4.26a.5.5 0 00.49-.4l.43-2c.05-.24.19-.44.38-.57A5.99 5.99 0 0016 8a6 6 0 00-6-6z" />
    </svg>
  ),
  slack_followup: (
    <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
      <path d="M1 8.74c0 .983.713 1.825 1.69 1.943.764.092 1.534.164 2.31.216v2.35a.75.75 0 001.238.57L9.05 11.2c.315-.024.63-.05.945-.08.976-.117 1.689-.96 1.689-1.942V5.562c0-.983-.713-1.825-1.69-1.943a44.5 44.5 0 00-7.989 0C1.713 3.737 1 4.58 1 5.562v3.178z" />
    </svg>
  ),
  schedule_event: (
    <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
      <path fillRule="evenodd" d="M4 1.5a.5.5 0 01.5.5v1h7V2a.5.5 0 011 0v1h.5A2 2 0 0115 5v8a2 2 0 01-2 2H3a2 2 0 01-2-2V5a2 2 0 012-2h.5V2a.5.5 0 01.5-.5zM3 7v6h10V7H3zm5 1.75a.75.75 0 01.75.75v1.25H10a.75.75 0 010 1.5H8.75V13.5a.75.75 0 01-1.5 0v-1.25H6a.75.75 0 010-1.5h1.25V9.5A.75.75 0 018 8.75z" clipRule="evenodd" />
    </svg>
  ),
};

/* ── Derive suggestions from app data ── */

export function deriveSuggestions(
  looseEnds: LooseEnd[],
  junkEmails: JunkEmail[],
  _suggestions: Record<string, string>,
): Suggestion[] {
  const result: Suggestion[] = [];

  // 1. Junk cleanup — single card for batch operation
  if (junkEmails.length >= 2) {
    result.push({
      id: "junk-cleanup",
      kind: "junk_cleanup",
      title: `Clean up ${junkEmails.length} junk emails`,
      description: `${junkEmails.slice(0, 2).map((j) => j.from.split("@")[0]).join(", ")}${junkEmails.length > 2 ? ` +${junkEmails.length - 2} more` : ""}`,
      service: "gmail",
      tier: "auto",
      priority: 70,
      meta: { count: String(junkEmails.length) },
    });
  }

  // 2. Urgent reply removed — the email is already visible in the timeline
  // with a reply button. Suggesting "reply" without content is not actionable.

  // 3. Stale GitHub review (only 1, most stale)
  const staleReview = looseEnds.find(
    (le) => le.type === "github" && le.urgency === "red"
  );
  if (staleReview) {
    result.push({
      id: `review-${staleReview.id}`,
      kind: "stale_review",
      title: `Review: ${staleReview.title}`,
      description: staleReview.age,
      service: "github",
      tier: "auto",
      priority: 75,
      meta: { itemId: staleReview.id, deepLink: staleReview.deepLink || "" },
    });
  }

  // 4. Meeting prep (only 1, soonest)
  const nextMeeting = looseEnds.find(
    (le) => le.type === "calendar" && le.urgency === "red"
  );
  if (nextMeeting) {
    result.push({
      id: `prep-${nextMeeting.id}`,
      kind: "meeting_prep",
      title: nextMeeting.title,
      description: nextMeeting.description,
      service: "calendar",
      tier: "auto",
      priority: 80,
      meta: { itemId: nextMeeting.id },
    });
  }

  // 5. Scheduling detected — suggest creating a calendar event (only 1, highest urgency first)
  const SCHED_RE = /\b(meet|meeting|call|catch up|sync|1[:\-]?on[:\-]?1|coffee|lunch|dinner|schedule|available|availability|let'?s (talk|chat|connect)|(?:at|by|around)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?|tomorrow|next\s+(?:week|monday|tuesday|wednesday|thursday|friday))\b/i;
  const schedulingEmail = looseEnds.find(
    (le) => (le.type === "email" || le.type === "slack") && le.actions?.some((a) => a.id === "create-event") && SCHED_RE.test(le.meta?.subject || le.title || "")
  );
  if (schedulingEmail) {
    const sender = (schedulingEmail.meta?.from || schedulingEmail.source || "").split("<")[0].trim();
    result.push({
      id: `schedule-${schedulingEmail.id}`,
      kind: "schedule_event",
      title: `Meeting with ${sender}`,
      description: schedulingEmail.title,
      service: schedulingEmail.type === "slack" ? "slack" : "gmail",
      tier: "confirm",
      priority: 85,
      meta: { itemId: schedulingEmail.id },
    });
  }

  // Sort by priority descending, hard cap at 4
  result.sort((a, b) => b.priority - a.priority);
  return result.slice(0, 4);
}

/* ── Suggestion Card ── */

const AUTO_CLEAN_DELAY = 8; // seconds

function SuggestionChip({
  suggestion,
  junkEmails,
  autoActEnabled,
  cibaWaiting,
  onAct,
  onDismiss,
  onRescue,
  index,
}: {
  suggestion: Suggestion;
  junkEmails?: JunkEmail[];
  autoActEnabled?: boolean;
  cibaWaiting?: boolean;
  onAct: (s: Suggestion) => void;
  onDismiss: (id: string) => void;
  onRescue?: (j: JunkEmail) => void;
  index: number;
}) {
  const [showPreview, setShowPreview] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval>>(null);
  const isJunk = suggestion.kind === "junk_cleanup";
  const isAutoActable = isJunk || suggestion.kind === "schedule_event";

  // Auto-act countdown — fires once per suggestion kind per session.
  // sessionStorage key prevents re-triggering after cancel, dismiss, or page nav.
  useEffect(() => {
    if (!isAutoActable || !autoActEnabled) return;
    const key = `le-autoact-${suggestion.kind}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");

    setCountdown(AUTO_CLEAN_DELAY);
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [isAutoActable, autoActEnabled, suggestion.kind]);

  // Fire cleanup when countdown hits 0
  useEffect(() => {
    if (countdown === 0) {
      onAct(suggestion);
    }
  }, [countdown, onAct, suggestion]);

  function cancelCountdown() {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setCountdown(null);
    // Don't clear sessionStorage — stays cancelled until next full page load
  }
  const svc = SERVICE_ICON[suggestion.service];
  const tier = TIER_BADGE[suggestion.tier];
  const accent = TIER_ACCENT[suggestion.tier];
  const kindIcon = KIND_ICON[suggestion.kind];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
      transition={{ duration: 0.35, delay: index * 0.06, ease: [0.25, 1, 0.5, 1] }}
      className={`group relative flex-shrink-0 rounded-xl border border-le-border/20 bg-le-surface/80 backdrop-blur-sm overflow-hidden transition-all hover:border-le-border/40 hover:shadow-lg hover:shadow-black/10 ${
        isJunk && showPreview ? "w-[340px]" : "w-[280px]"
      }`}
    >
      {/* Tier accent line */}
      <div className={`absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b ${accent}`} />

      {/* Content */}
      <div className="pl-4 pr-3 py-3">
        {/* Top row: service + kind + tier */}
        <div className="flex items-center gap-2 mb-1.5">
          <span className={`flex items-center justify-center h-5 w-5 rounded-md ${svc?.bg}`}>
            <span className={svc?.color}>{svc?.icon}</span>
          </span>
          <span className="text-le-muted/50">{kindIcon}</span>
          <span className={`ml-auto rounded-full px-1.5 py-px text-[9px] font-mono font-medium ${tier.bg}`}>
            {tier.label}
          </span>
        </div>

        {/* Title */}
        <p className="text-xs font-medium text-le-text leading-snug line-clamp-1">{suggestion.title}</p>

        {/* Description */}
        <p className="mt-0.5 text-[11px] text-le-muted/60 leading-snug line-clamp-1">{suggestion.description}</p>

        {/* Junk email preview list */}
        {isJunk && junkEmails && junkEmails.length > 0 && (
          <AnimatePresence>
            {showPreview && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <div className="mt-2 max-h-32 space-y-1 overflow-y-auto">
                  {junkEmails.map((j) => (
                    <div key={j.id} className="flex items-center gap-1.5 rounded-md bg-le-void/40 px-2 py-1.5">
                      <span className="h-1 w-1 shrink-0 rounded-full bg-le-muted/30" />
                      <span className="truncate text-[10px] text-le-muted/60 max-w-[60px]">{j.from.split("@")[0]}</span>
                      <span className="truncate flex-1 text-[10px] text-le-text/50">{j.subject}</span>
                      {onRescue && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onRescue(j); }}
                          className="shrink-0 text-[10px] text-le-accent/60 hover:text-le-accent"
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
        )}

        {/* Countdown bar for auto-clean */}
        {isAutoActable && countdown !== null && countdown > 0 && (
          <div className="mt-2 relative h-1 rounded-full bg-le-border/20 overflow-hidden">
            <motion.div
              className="absolute inset-y-0 left-0 bg-amber-400/60 rounded-full"
              initial={{ width: "100%" }}
              animate={{ width: "0%" }}
              transition={{ duration: AUTO_CLEAN_DELAY, ease: "linear" }}
            />
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1.5 mt-2.5">
          {cibaWaiting ? (
            /* CIBA Guardian approval pending */
            <span className="flex items-center gap-2 text-[11px] text-amber-400/80 font-medium">
              <span className="relative flex h-3 w-3 items-center justify-center">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-30" />
                <svg viewBox="0 0 16 16" fill="currentColor" className="relative h-2.5 w-2.5">
                  <path fillRule="evenodd" d="M8 1a3.5 3.5 0 00-3.5 3.5V8H4a2 2 0 00-2 2v4a2 2 0 002 2h8a2 2 0 002-2v-4a2 2 0 00-2-2h-.5V4.5A3.5 3.5 0 008 1zm2 7V4.5a2 2 0 10-4 0V8h4z" clipRule="evenodd" />
                </svg>
              </span>
              Approve on your phone
            </span>
          ) : isAutoActable && countdown !== null && countdown > 0 ? (
            /* Auto-act countdown active */
            <>
              <span className="text-[11px] text-amber-400/80 font-medium tabular-nums">
                Auto-acting in {countdown}s
              </span>
              <button
                onClick={cancelCountdown}
                className="rounded-lg px-2.5 py-1 text-[11px] font-medium text-le-text bg-le-elevated/50 hover:bg-le-elevated/80 transition-all active:scale-[0.97]"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => onAct(suggestion)}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition-all active:scale-[0.97] ${
                suggestion.tier === "ciba"
                  ? "bg-amber-500/15 text-amber-300 hover:bg-amber-500/25"
                  : suggestion.tier === "confirm"
                    ? "bg-le-accent/15 text-le-accent hover:bg-le-accent/25"
                    : "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
              }`}
            >
              {isJunk
                ? "Clean Up"
                : suggestion.kind === "schedule_event"
                  ? "Create Event"
                  : suggestion.kind === "stale_review"
                    ? "Open"
                    : suggestion.kind === "meeting_prep"
                      ? "View"
                      : "Act"}
            </button>
          )}
          {isJunk && junkEmails && junkEmails.length > 0 && (
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="rounded-lg px-2 py-1 text-[11px] text-le-muted/50 hover:text-le-muted hover:bg-le-elevated/30 transition-all"
            >
              {showPreview ? "Hide" : "Preview"}
            </button>
          )}
          {!(isAutoActable && countdown !== null && countdown > 0) && (
            <button
              onClick={() => { cancelCountdown(); onDismiss(suggestion.id); }}
              className="rounded-lg px-2 py-1 text-[11px] text-le-muted/40 hover:text-le-muted hover:bg-le-elevated/30 transition-all opacity-0 group-hover:opacity-100"
            >
              Dismiss
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/* ── Main Tray ── */

export default function SuggestionTray({
  looseEnds,
  junkEmails,
  suggestions,
  onJunkCleanup,
  onItemAction,
  onOpenItem,
  onRescueJunk,
  autoActEnabled,
  eventCreatedIds,
}: {
  looseEnds: LooseEnd[];
  junkEmails: JunkEmail[];
  suggestions: Record<string, string>;
  onJunkCleanup: () => Promise<void>;
  onItemAction: (actionId: string, item: LooseEnd) => void;
  onOpenItem: (itemId: string) => void;
  onRescueJunk?: (j: JunkEmail) => void;
  autoActEnabled?: boolean;
  eventCreatedIds?: Set<string>;
}) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [cleaningJunk, setCleaningJunk] = useState(false);

  const allSuggestions = useMemo(
    () => deriveSuggestions(looseEnds, junkEmails, suggestions),
    [looseEnds, junkEmails, suggestions],
  );

  const visible = useMemo(
    () => allSuggestions.filter((s) => {
      if (dismissed.has(s.id)) return false;
      // Hide schedule_event suggestions for items that already have events created
      if (s.kind === "schedule_event" && s.meta?.itemId && eventCreatedIds?.has(s.meta.itemId)) return false;
      return true;
    }),
    [allSuggestions, dismissed, eventCreatedIds],
  );

  const handleDismiss = useCallback((id: string) => {
    setDismissed((prev) => new Set(prev).add(id));
  }, []);

  const handleAct = useCallback(async (s: Suggestion) => {
    if (s.kind === "junk_cleanup") {
      setCleaningJunk(true);
      try {
        await onJunkCleanup();
        handleDismiss(s.id);
      } finally {
        setCleaningJunk(false);
      }
      return;
    }

    if (s.kind === "stale_review" && s.meta?.deepLink) {
      window.open(s.meta.deepLink, "_blank");
      handleDismiss(s.id);
      return;
    }

    if (s.meta?.itemId) {
      const item = looseEnds.find((le) => le.id === s.meta?.itemId);
      if (item) {
        if (s.kind === "schedule_event") {
          onItemAction("create-event", item);
        } else if (s.kind === "urgent_reply" || s.kind === "slack_followup") {
          onItemAction("reply", item);
        } else {
          onOpenItem(item.id);
        }
      }
    }

    handleDismiss(s.id);
  }, [looseEnds, onJunkCleanup, onItemAction, onOpenItem, handleDismiss]);

  if (visible.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.25, 1, 0.5, 1] }}
      className="mb-5"
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex h-5 w-5 items-center justify-center rounded-md bg-le-accent/10">
          <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3 text-le-accent">
            <path d="M8 1l1.54 4.74h4.98l-4.03 2.93 1.54 4.74L8 10.48l-4.03 2.93 1.54-4.74L1.48 5.74h4.98L8 1z" fill="currentColor" />
          </svg>
        </div>
        <span className="text-xs font-medium text-le-muted/70 uppercase tracking-wider">
          Agent Suggestions
        </span>
        <span className="rounded-full bg-le-elevated px-1.5 py-0.5 text-[10px] font-mono text-le-muted/50">
          {visible.length}
        </span>
        {visible.length > 1 && (
          <button
            onClick={() => visible.forEach((s) => handleDismiss(s.id))}
            className="ml-auto text-[10px] text-le-muted/40 hover:text-le-muted transition-colors"
          >
            Dismiss all
          </button>
        )}
      </div>

      {/* Scrollable card row */}
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-thin scrollbar-thumb-le-border/20 scrollbar-track-transparent">
        <AnimatePresence mode="popLayout">
          {visible.map((s, i) => (
            <SuggestionChip
              key={s.id}
              suggestion={s}
              junkEmails={s.kind === "junk_cleanup" ? junkEmails : undefined}
              autoActEnabled={(s.kind === "junk_cleanup" || s.kind === "schedule_event") ? autoActEnabled : undefined}
              cibaWaiting={(s.kind === "junk_cleanup" || s.kind === "schedule_event") ? cleaningJunk : false}
              onAct={cleaningJunk && (s.kind === "junk_cleanup" || s.kind === "schedule_event") ? () => {} : handleAct}
              onDismiss={handleDismiss}
              onRescue={s.kind === "junk_cleanup" ? onRescueJunk : undefined}
              index={i}
            />
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
