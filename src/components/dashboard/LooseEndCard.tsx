"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { LooseEnd, ScheduleCheckResult, ProposedEvent, FreeSlot } from "@/lib/types";
import Badge from "@/components/ui/Badge";
import ActionConfirmSheet from "./ActionConfirmSheet";
import ScheduleSheet from "./ScheduleSheet";
import EventReplySheet from "./EventReplySheet";

const typeIcons: Record<
  LooseEnd["type"],
  { label: string; icon: React.ReactNode }
> = {
  email: {
    label: "Email",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
        <path d="M3 4a2 2 0 00-2 2v1.161l8.441 4.221a1.25 1.25 0 001.118 0L19 7.161V6a2 2 0 00-2-2H3z" />
        <path d="M19 8.839l-7.556 3.778a2.75 2.75 0 01-2.466-.022L1 8.839V14a2 2 0 002 2h14a2 2 0 002-2V8.839z" />
      </svg>
    ),
  },
  calendar: {
    label: "Calendar",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
        <path
          fillRule="evenodd"
          d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75z"
          clipRule="evenodd"
        />
      </svg>
    ),
  },
  github: {
    label: "GitHub",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
        <path
          fillRule="evenodd"
          d="M6.28 5.22a.75.75 0 010 1.06L2.56 10l3.72 3.72a.75.75 0 01-1.06 1.06L.97 10.53a.75.75 0 010-1.06l4.25-4.25a.75.75 0 011.06 0zm7.44 0a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L17.44 10l-3.72-3.72a.75.75 0 010-1.06zM11.377 2.011a.75.75 0 01.612.867l-2.5 14.5a.75.75 0 01-1.478-.255l2.5-14.5a.75.75 0 01.866-.612z"
          clipRule="evenodd"
        />
      </svg>
    ),
  },
  slack: {
    label: "Slack",
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
        <path d="M7.5 2a1.5 1.5 0 100 3H9V3.5A1.5 1.5 0 007.5 2zM9 6H4.5A1.5 1.5 0 003 7.5 1.5 1.5 0 004.5 9H9V6zm2 0v3h4.5A1.5 1.5 0 0017 7.5 1.5 1.5 0 0015.5 6H11zm3.5-1A1.5 1.5 0 0013 3.5V5h1.5a1.5 1.5 0 000-3zM13 11v4.5a1.5 1.5 0 003 0A1.5 1.5 0 0014.5 14H13v-3zm-2 0H9v3H7.5a1.5 1.5 0 000 3A1.5 1.5 0 009 15.5V14h2v-3zm0-2V6H9v3h2zM5 11h3.999v3H5.5A1.5 1.5 0 014 12.5 1.5 1.5 0 015.5 11z" />
      </svg>
    ),
  },
};

const URGENCY_BAR: Record<string, string> = {
  red: "bg-le-red",
  yellow: "bg-le-yellow",
  green: "bg-le-green",
};

const ACTION_STYLES = {
  primary: "bg-le-accent/15 text-le-accent hover:bg-le-accent/25",
  secondary: "bg-le-elevated text-le-text hover:bg-le-elevated/80",
  ghost: "text-le-muted hover:text-le-text hover:bg-le-elevated/50",
};

const BODY_TRUNCATE_LENGTH = 500;

export default function LooseEndCard({
  item,
  index,
  suggestionsLoading,
  isPending,
  onAction,
  onDismiss,
  isExpanded,
  onToggleExpand,
  confirmAction,
  onConfirm,
  onCancelConfirm,
  scheduleCheck,
  onScheduleCreate,
  onScheduleSlot,
  onScheduleReply,
  onScheduleCancel,
  cibaWaiting,
  preGeneratedReply,
  eventReplySheet,
  onEventReplyConfirm,
  onEventReplyCancel,
}: {
  item: LooseEnd;
  index: number;
  suggestionsLoading?: boolean;
  isPending?: boolean;
  onAction?: (actionId: string) => void;
  onDismiss?: () => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  confirmAction?: { item: LooseEnd; actionId: string } | null;
  onConfirm?: (payload: { body: string }) => void;
  onCancelConfirm?: () => void;
  scheduleCheck?: { item: LooseEnd; result: ScheduleCheckResult } | null;
  onScheduleCreate?: (proposed: ProposedEvent) => void;
  onScheduleSlot?: (slot: FreeSlot) => void;
  onScheduleReply?: (freeSlots: FreeSlot[]) => void;
  onScheduleCancel?: () => void;
  cibaWaiting?: boolean;
  preGeneratedReply?: string | null;
  eventReplySheet?: { item: LooseEnd; checkResult: import("@/lib/types").ScheduleCheckResult; initialReply: string | null } | null;
  onEventReplyConfirm?: (payload: { proposed: import("@/lib/types").ProposedEvent; replyBody: string }) => void;
  onEventReplyCancel?: () => void;
}) {
  const { icon, label } = typeIcons[item.type];
  const [itemBody, setItemBody] = useState<string | null>(null);
  const [isLoadingBody, setIsLoadingBody] = useState(false);
  const [isBodyExpanded, setIsBodyExpanded] = useState(false);

  const importanceScore = item.meta?.importanceScore;

  const fetchBody = useCallback(async () => {
    setItemBody(null);
    setIsLoadingBody(true);
    setIsBodyExpanded(false);
    try {
      const res = await fetch("/api/actions/get-body", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item }),
      });
      if (res.ok) {
        const data = await res.json();
        setItemBody(data.body || null);
      } else {
        setItemBody(null);
      }
    } catch {
      setItemBody(null);
    } finally {
      setIsLoadingBody(false);
    }
  }, [item]);

  useEffect(() => {
    if (isExpanded) {
      fetchBody();
    } else {
      setItemBody(null);
      setIsLoadingBody(false);
      setIsBodyExpanded(false);
    }
  }, [isExpanded, fetchBody]);

  // Escape key collapses
  useEffect(() => {
    if (!isExpanded) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && onToggleExpand) {
        onToggleExpand();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isExpanded, onToggleExpand]);

  const bodyIsTruncated = itemBody != null && itemBody.length > BODY_TRUNCATE_LENGTH;
  const displayBody = itemBody != null
    ? isBodyExpanded || !bodyIsTruncated
      ? itemBody
      : itemBody.slice(0, BODY_TRUNCATE_LENGTH) + "..."
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.04, ease: [0.25, 1, 0.5, 1] }}
      className={`glass group relative rounded-xl transition-all duration-200 ${
        isExpanded ? "ring-1 ring-le-accent/30 overflow-visible" : "overflow-hidden glass-hover"
      }`}
    >
      {/* Urgency color bar */}
      <div
        className={`absolute left-0 top-0 bottom-0 w-[3px] ${URGENCY_BAR[item.urgency] ?? "bg-le-muted"}`}
      />

      <div className="p-4 pl-5">
        {/* Clickable header area */}
        <div
          className={onToggleExpand ? "cursor-pointer" : undefined}
          onClick={onToggleExpand}
          role={onToggleExpand ? "button" : undefined}
          tabIndex={onToggleExpand ? 0 : undefined}
          onKeyDown={onToggleExpand ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggleExpand(); } } : undefined}
        >
          <div className="flex items-start gap-3">
            {/* Type icon */}
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-le-elevated text-le-muted">
              {icon}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="truncate text-sm font-medium text-le-text">
                  {item.title}
                </h3>
                {/* Importance score badge for emails */}
                {importanceScore && (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-le-accent/15 px-1.5 text-[10px] font-bold tabular-nums text-le-accent">
                    {importanceScore}
                  </span>
                )}
                <Badge urgency={item.urgency} />
              </div>

              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-le-muted">
                {item.description}
              </p>

              {/* AI Suggestion */}
              {item.aiSuggestion && (
                <p className="mt-2 text-xs italic text-le-accent/80">
                  {item.aiSuggestion}
                </p>
              )}
              {suggestionsLoading && !item.aiSuggestion && (
                <div className="mt-2 h-3 w-2/3 animate-pulse rounded bg-le-accent/10" />
              )}

              {/* Meta info */}
              <div className="mt-2 flex items-center gap-3">
                <span className="text-[11px] text-le-muted/60">{label}</span>
                <span className="text-le-border">|</span>
                <span className="text-[11px] text-le-muted/60">{item.age}</span>
                {isExpanded && (
                  <span className="ml-auto text-[10px] text-le-muted/40">
                    Press Esc to collapse
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {/* Dismiss button — visible on hover */}
              {onDismiss && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDismiss(); }}
                  className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-md text-le-muted/0 transition-all duration-150 hover:bg-le-elevated hover:text-le-muted group-hover:text-le-muted/40"
                  title="Dismiss — won't show again"
                >
                  <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                    <path d="M5.28 4.22a.75.75 0 00-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 101.06 1.06L8 9.06l2.72 2.72a.75.75 0 101.06-1.06L9.06 8l2.72-2.72a.75.75 0 00-1.06-1.06L8 6.94 5.28 4.22z" />
                  </svg>
                </button>
              )}

              {/* Expand chevron */}
              {onToggleExpand && (
                <div className="mt-1 text-le-muted/40 transition-transform duration-200">
                  <svg
                    viewBox="0 0 16 16"
                    fill="currentColor"
                    className={`h-3.5 w-3.5 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                  >
                    <path
                      fillRule="evenodd"
                      d="M4.22 6.22a.75.75 0 011.06 0L8 8.94l2.72-2.72a.75.75 0 111.06 1.06l-3.25 3.25a.75.75 0 01-1.06 0L4.22 7.28a.75.75 0 010-1.06z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        {item.actions && item.actions.length > 0 && onAction && (
          <div className="mt-3 flex flex-wrap items-center gap-2 pl-0 sm:pl-11 pt-2 border-t border-le-border/10">
            {item.actions.map((action) => (
              <button
                key={action.id}
                onClick={() => onAction(action.id)}
                disabled={isPending}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-all duration-150 active:scale-[0.97] disabled:opacity-50 ${ACTION_STYLES[action.variant]}`}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}

        {/* Expanded body content */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="mt-4 border-t border-le-border/30 pt-4">
                {/* Body content */}
                <div className="max-h-60 overflow-y-auto overscroll-contain rounded-lg border border-le-border/20 bg-le-void/60 p-3.5">
                  {isLoadingBody ? (
                    <div className="space-y-2">
                      <div className="h-3 w-full animate-pulse rounded bg-le-elevated/60" />
                      <div className="h-3 w-4/5 animate-pulse rounded bg-le-elevated/60" />
                      <div className="h-3 w-3/5 animate-pulse rounded bg-le-elevated/60" />
                      <div className="h-3 w-2/3 animate-pulse rounded bg-le-elevated/60" />
                    </div>
                  ) : displayBody ? (
                    item.type === "slack" ? (
                      <div className="max-h-48 space-y-1.5 overflow-y-auto overscroll-contain rounded pr-1">
                        {displayBody.split("\n").filter(Boolean).map((line, i) => {
                          const boldMatch = line.match(/^\*\*(.+?)\*\*:\s*(.*)/);
                          if (boldMatch) {
                            return (
                              <div key={i} className="rounded-md bg-le-elevated/40 px-2.5 py-1.5">
                                <span className="text-xs font-semibold text-le-text">{boldMatch[1]}</span>
                                <span className="ml-1.5 text-xs text-le-text/80">{boldMatch[2]}</span>
                              </div>
                            );
                          }
                          return (
                            <p key={i} className="text-xs text-le-text/70">{line}</p>
                          );
                        })}
                        {bodyIsTruncated && (
                          <button
                            onClick={() => setIsBodyExpanded((v) => !v)}
                            className="mt-1 text-[10px] font-medium text-le-accent hover:text-le-accent/80 transition-colors"
                          >
                            {isBodyExpanded ? "Show less" : "Show more"}
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="max-h-48 overflow-y-auto overscroll-contain rounded pr-1">
                        <p className="whitespace-pre-wrap text-xs leading-relaxed text-le-text/70">
                          {displayBody}
                        </p>
                        {bodyIsTruncated && (
                          <button
                            onClick={() => setIsBodyExpanded((v) => !v)}
                            className="mt-1 text-[10px] font-medium text-le-accent hover:text-le-accent/80 transition-colors"
                          >
                            {isBodyExpanded ? "Show less" : "Show more"}
                          </button>
                        )}
                      </div>
                    )
                  ) : (
                    <p className="text-xs italic text-le-muted">No content available.</p>
                  )}
                </div>

                {/* Source info */}
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-[11px] text-le-muted">Source:</span>
                  <span className="text-[11px] text-le-text">{item.source}</span>
                </div>

                {/* CIBA approval pending indicator */}
                {cibaWaiting && (
                  <div className="mt-4 flex items-center gap-3 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] px-4 py-3.5">
                    <div className="relative flex h-5 w-5 items-center justify-center">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400/20" />
                      <svg viewBox="0 0 16 16" fill="currentColor" className="relative h-4 w-4 text-amber-400">
                        <path fillRule="evenodd" d="M8 1a3.5 3.5 0 00-3.5 3.5V8H4a2 2 0 00-2 2v4a2 2 0 002 2h8a2 2 0 002-2v-4a2 2 0 00-2-2h-.5V4.5A3.5 3.5 0 008 1zm2 7V4.5a2 2 0 10-4 0V8h4z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-amber-400">Approve on your phone</p>
                      <p className="text-[10px] text-le-muted/60 mt-0.5">Booking event + generating reply...</p>
                    </div>
                  </div>
                )}

                {/* Inline ActionConfirmSheet */}
                <AnimatePresence>
                  {confirmAction && confirmAction.item.id === item.id && onConfirm && onCancelConfirm && !cibaWaiting && (
                    <ActionConfirmSheet
                      item={confirmAction.item}
                      actionId={confirmAction.actionId}
                      onConfirm={onConfirm}
                      onCancel={onCancelConfirm}
                      isPending={isPending || false}
                      initialReply={preGeneratedReply}
                    />
                  )}
                </AnimatePresence>

                {/* Inline ScheduleSheet (for conflict resolution) */}
                <AnimatePresence>
                  {scheduleCheck && scheduleCheck.item.id === item.id && onScheduleCreate && onScheduleCancel && (
                    <ScheduleSheet
                      item={item}
                      checkResult={scheduleCheck.result}
                      onCreateEvent={(proposed) => onScheduleCreate(proposed)}
                      onCreateAtSlot={(slot) => onScheduleSlot?.(slot)}
                      onReplyWithAlternatives={(slots) => onScheduleReply?.(slots)}
                      onCancel={onScheduleCancel}
                      isPending={isPending || false}
                    />
                  )}
                </AnimatePresence>

                {/* Combined Book & Reply form */}
                <AnimatePresence>
                  {eventReplySheet && eventReplySheet.item.id === item.id && onEventReplyConfirm && onEventReplyCancel && (
                    <EventReplySheet
                      item={item}
                      checkResult={eventReplySheet.checkResult}
                      initialReply={eventReplySheet.initialReply}
                      onConfirm={onEventReplyConfirm}
                      onCancel={onEventReplyCancel}
                      isPending={isPending || false}
                    />
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
