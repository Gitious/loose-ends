"use client";

import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useScan } from "@/lib/hooks/useScan";
// Suggestions now come from useScan (fetched after scan completes)
import type { LooseEnd, LooseEndAction, JunkEmail, ScheduleCheckResult, ProposedEvent, FreeSlot } from "@/lib/types";
import type { UserPermissions } from "@/lib/fga";
import DashboardHeader from "./DashboardHeader";
import FilterTabs from "./FilterTabs";
import Sidebar from "./Sidebar";
import LooseEndCard from "./LooseEndCard";
import SuggestionTray from "./SuggestionTray";
import ServiceTile from "./ServiceTile";
import ChatDrawer from "./ChatDrawer";

type FilterType = "all" | "email" | "github" | "calendar" | "slack";

/* ─── Timeline sub-components ─── */

function TimelineSkeleton() {
  return (
    <div className="relative">
      <div className="absolute left-[11px] top-0 bottom-0 w-px bg-le-border/20 animate-pulse" />
      {(["Urgent", "Needs Attention", "Low Priority"] as const).map((label, i) => (
        <div key={label} className="mb-8">
          <div
            className="flex items-center gap-3 mb-4"
            style={{ animationDelay: `${i * 150}ms` }}
          >
            <div className="h-[22px] w-[22px] rounded-full bg-le-elevated animate-pulse" />
            <div className="h-4 w-20 rounded bg-le-elevated animate-pulse" />
          </div>
          <div className="ml-7 space-y-3">
            {Array.from({ length: 2 - Math.min(i, 1) }).map((_, j) => (
              <div
                key={j}
                className="glass rounded-xl p-4 animate-pulse"
                style={{ animationDelay: `${(i * 2 + j) * 80}ms` }}
              >
                <div className="flex gap-3">
                  <div className="h-8 w-8 rounded-lg bg-le-elevated" />
                  <div className="flex-1 space-y-2">
                    <div
                      className="h-4 rounded bg-le-elevated"
                      style={{ width: `${70 - j * 12}%` }}
                    />
                    <div
                      className="h-3 rounded bg-le-elevated/60"
                      style={{ width: `${45 - j * 8}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function AllClearState() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.25, 1, 0.5, 1] }}
      className="relative flex flex-col items-center py-20 text-center"
    >
      {/* Spine fades into nothing */}
      <div className="absolute left-[11px] top-0 h-20 w-px bg-gradient-to-b from-le-border/40 to-transparent" />
      <div className="relative z-10 mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-le-green/10 ring-1 ring-le-green/20">
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-8 w-8 text-le-green"
        >
          <path
            fillRule="evenodd"
            d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
            clipRule="evenodd"
          />
        </svg>
      </div>
      <h3 className="font-display text-xl text-le-text">All threads tied</h3>
      <p className="mt-1 text-sm text-le-muted">
        Nothing needs your attention right now.
      </p>
    </motion.div>
  );
}

function TimelineBucket({
  label,
  color,
  count,
  items,
  expandedItemId,
  onToggleExpand,
  suggestionsLoading,
  actionPending,
  onAction,
  onDismiss,
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
  defaultCollapsed = false,
}: {
  label: string;
  color: "red" | "yellow" | "green";
  count: number;
  items: LooseEnd[];
  expandedItemId: string | null;
  onToggleExpand: (id: string) => void;
  suggestionsLoading: boolean;
  actionPending: Record<string, boolean>;
  onAction: (actionId: string, item: LooseEnd) => void;
  onDismiss: (item: LooseEnd) => void;
  confirmAction: { item: LooseEnd; actionId: string } | null;
  onConfirm: (payload: { body: string }) => void;
  onCancelConfirm: () => void;
  scheduleCheck: { item: LooseEnd; result: ScheduleCheckResult } | null;
  onScheduleCreate: (item: LooseEnd, proposed: ProposedEvent) => void;
  onScheduleSlot: (item: LooseEnd, slot: FreeSlot) => void;
  onScheduleReply: (item: LooseEnd, freeSlots: FreeSlot[]) => void;
  onScheduleCancel: () => void;
  cibaWaiting?: string | null;
  preGeneratedReply?: string | null;
  eventReplySheet?: { item: LooseEnd; checkResult: ScheduleCheckResult; initialReply: string | null } | null;
  onEventReplyConfirm?: (payload: { proposed: ProposedEvent; replyBody: string }) => void;
  onEventReplyCancel?: () => void;
  defaultCollapsed?: boolean;
}) {
  const PREVIEW_COUNT = 2;
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const hasOverflow = items.length > PREVIEW_COUNT;
  const visibleItems = collapsed ? items.slice(0, PREVIEW_COUNT) : items;
  const hiddenCount = items.length - PREVIEW_COUNT;

  const dotColor =
    color === "red"
      ? "bg-le-red"
      : color === "yellow"
        ? "bg-le-yellow"
        : "bg-le-green";
  const glowColor =
    color === "red"
      ? "shadow-le-red/30"
      : color === "yellow"
        ? "shadow-le-yellow/20"
        : "shadow-le-green/15";
  const textColor =
    color === "red"
      ? "text-le-red"
      : color === "yellow"
        ? "text-le-yellow"
        : "text-le-green";
  const badgeBg =
    color === "red"
      ? "bg-le-red/15"
      : color === "yellow"
        ? "bg-le-yellow/15"
        : "bg-le-green/15";

  return (
    <motion.div
      className="mb-8"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.25, 1, 0.5, 1] }}
    >
      {/* Bucket header with timeline node */}
      <div className="flex items-center gap-3 mb-4">
        <div
          className={`relative z-10 flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-le-surface ${dotColor} shadow-lg ${glowColor} ${color === "red" ? "timeline-node-urgent" : ""}`}
        >
          <div
            className={`h-2 w-2 rounded-full bg-white/80 ${color === "red" ? "animate-pulse" : ""}`}
          />
        </div>
        <span
          className={`text-sm font-semibold uppercase tracking-wider ${textColor}`}
        >
          {label}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${badgeBg} ${textColor}`}
        >
          {count}
        </span>
      </div>

      {/* Items connected to the spine */}
      <div className="ml-7 space-y-3">
        <AnimatePresence mode="popLayout">
          {visibleItems.map((item, i) => (
            <motion.div
              key={item.id}
              className="relative"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8, transition: { duration: 0.2 } }}
              transition={{
                duration: 0.25,
                delay: i * 0.04,
                ease: [0.25, 1, 0.5, 1],
              }}
            >
              {/* Connection line from spine to card */}
              <div className="absolute -left-[18px] top-5 w-[14px] h-px bg-le-border/30" />
              <div
                className={`absolute -left-[19px] top-[17px] h-2 w-2 rounded-full ${dotColor}/60`}
              />

              <LooseEndCard
                item={item}
                index={i}
                isExpanded={expandedItemId === item.id}
                onToggleExpand={() => onToggleExpand(item.id)}
                suggestionsLoading={suggestionsLoading}
                isPending={actionPending[item.id]}
                onAction={(actionId) => onAction(actionId, item)}
                onDismiss={() => onDismiss(item)}
                confirmAction={
                  confirmAction?.item.id === item.id ? confirmAction : null
                }
                onConfirm={onConfirm}
                onCancelConfirm={onCancelConfirm}
                scheduleCheck={
                  scheduleCheck?.item.id === item.id ? scheduleCheck : null
                }
                onScheduleCreate={(proposed) => onScheduleCreate(item, proposed)}
                onScheduleSlot={(slot) => onScheduleSlot(item, slot)}
                onScheduleReply={(slots) => onScheduleReply(item, slots)}
                onScheduleCancel={onScheduleCancel}
                cibaWaiting={cibaWaiting === item.id}
                preGeneratedReply={confirmAction?.item.id === item.id ? preGeneratedReply : null}
                eventReplySheet={eventReplySheet?.item.id === item.id ? eventReplySheet : null}
                onEventReplyConfirm={onEventReplyConfirm}
                onEventReplyCancel={onEventReplyCancel}
              />
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Show more / show less toggle */}
        {hasOverflow && (
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="relative flex items-center gap-2 pl-1 py-1.5 text-xs text-le-muted/50 hover:text-le-muted transition-colors"
          >
            <div className="absolute -left-[18px] top-1/2 w-[14px] h-px bg-le-border/20" />
            <svg
              viewBox="0 0 16 16"
              fill="currentColor"
              className={`h-3 w-3 transition-transform duration-200 ${collapsed ? "" : "rotate-180"}`}
            >
              <path
                fillRule="evenodd"
                d="M4.22 6.22a.75.75 0 011.06 0L8 8.94l2.72-2.72a.75.75 0 111.06 1.06l-3.25 3.25a.75.75 0 01-1.06 0L4.22 7.28a.75.75 0 010-1.06z"
                clipRule="evenodd"
              />
            </svg>
            {collapsed ? `Show ${hiddenCount} more` : "Show less"}
          </button>
        )}
      </div>
    </motion.div>
  );
}

/* ─── Main shell ─── */

export default function DashboardShell({
  firstName,
}: {
  firstName: string;
}) {
  const {
    looseEnds,
    junkEmails,
    isScanning,
    errors,
    services,
    servicesLoaded,
    denied,
    scan,
    lastScannedAt,
    dismissItem,
    clearJunk,
    rescueJunkEmail,
    agentSuggestions,
    textSuggestions: suggestions,
    suggestionsLoading,
  } = useScan();
  const [autoActEnabled, setAutoCleanEnabled] = useState(false);
  const [permissions, setPermissions] = useState<UserPermissions | null>(null);

  // Load FGA permissions (used for autonomy toggle + filtering card actions)
  useEffect(() => {
    fetch("/api/permissions")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) {
          setPermissions(data as UserPermissions);
          if (data.autonomy?.auto_act) setAutoCleanEnabled(true);
        }
      })
      .catch(() => {});
  }, []);

  const [filter, setFilter] = useState<FilterType>("all");
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState<
    Record<string, boolean>
  >({});
  const [confirmAction, setConfirmAction] = useState<{
    item: LooseEnd;
    actionId: string;
  } | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(
    null,
  );
  const [eventCreated, setEventCreated] = useState<Set<string>>(new Set());
  const [scheduleCheck, setScheduleCheck] = useState<{ item: LooseEnd; result: ScheduleCheckResult } | null>(null);
  const [_pendingReschedule, setPendingReschedule] = useState<{
    item: LooseEnd;
    context: { proposedTime: string; conflictNames: string[]; freeSlots: Array<{ label: string }> };
  } | null>(null);
  const [cibaWaiting, setCibaWaiting] = useState<string | null>(null); // item ID waiting for CIBA
  const [preGeneratedReply, _setPreGeneratedReply] = useState<string | null>(null);
  const [eventReplySheet, setEventReplySheet] = useState<{
    item: LooseEnd;
    checkResult: ScheduleCheckResult;
    initialReply: string | null;
  } | null>(null);
  const [viewMode, setViewMode] = useState<"timeline" | "tiles">(() => {
    if (typeof window !== "undefined") {
      return (sessionStorage.getItem("le-view-mode") as "timeline" | "tiles") || "timeline";
    }
    return "timeline";
  });

  // Group items by service type (for tiles view)
  const byService = useMemo<Record<"email" | "calendar" | "github" | "slack", LooseEnd[]>>(() => ({
    email: looseEnds.filter((le) => le.type === "email"),
    calendar: looseEnds.filter((le) => le.type === "calendar"),
    github: looseEnds.filter((le) => le.type === "github"),
    slack: looseEnds.filter((le) => le.type === "slack"),
  }), [looseEnds]);

  const connectionMap = useMemo<Record<string, boolean>>(() => ({
    email: services.google || false,
    calendar: services.google || false,
    github: services.github || false,
    slack: services.slack || false,
  }), [services]);

  const deniedMap = useMemo<Record<string, boolean>>(() => ({
    email: denied.includes("gmail"),
    calendar: denied.includes("calendar"),
    github: denied.includes("github"),
    slack: denied.includes("slack"),
  }), [denied]);

  /**
   * Map (item.type, action.id) → FGA permission key.
   * Actions not listed here (e.g. "open") are always shown.
   */
  function isActionPermitted(
    itemType: LooseEnd["type"],
    action: LooseEndAction,
  ): boolean {
    if (!permissions) return true; // permissions not loaded yet — show all
    const key = `${itemType}:${action.id}`;
    switch (key) {
      case "email:reply":
        return permissions.gmail.can_reply;
      case "email:trash":
        return permissions.gmail.can_delete;
      case "github:comment":
        return permissions.github.can_comment;
      case "github:approve":
        return permissions.github.can_approve;
      case "slack:reply":
        return permissions.slack.can_send;
      case "calendar:create-event":
        return permissions.calendar.can_create;
      default:
        return true; // "open", "dismiss", etc. are always allowed
    }
  }

  // Enrich with suggestions + swap "Create Event" to done state + filter by FGA permissions
  function enrichItems(items: LooseEnd[]): LooseEnd[] {
    return items.map((le) => {
      const enriched = {
        ...le,
        aiSuggestion: suggestions[le.id] || le.aiSuggestion || null,
      };
      if (eventCreated.has(le.id) && enriched.actions) {
        enriched.actions = enriched.actions.map((a) =>
          a.id === "create-event"
            ? { ...a, id: "event-created", label: "Event Created", variant: "ghost" as const }
            : a
        );
      }
      // Filter out actions the user doesn't have FGA permission for
      if (enriched.actions) {
        enriched.actions = enriched.actions.filter((a) =>
          isActionPermitted(le.type, a),
        );
      }
      return enriched;
    });
  }

  // Filter items, then bucket by urgency/priority
  const { urgent, needsAttention, lowPriority, enrichedAll } = useMemo(() => {
    const all = enrichItems(looseEnds);
    const filtered =
      filter === "all" ? all : all.filter((le) => le.type === filter);

    return {
      urgent: filtered.filter((le) => le.urgency === "red"),
      needsAttention: filtered.filter((le) => le.urgency === "yellow"),
      lowPriority: filtered.filter((le) => le.urgency === "green"),
      enrichedAll: filtered,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [looseEnds, suggestions, filter, eventCreated, permissions]);

  // Counts for FilterTabs
  const counts = useMemo<Record<FilterType, number>>(
    () => ({
      all: looseEnds.length,
      email: looseEnds.filter((le) => le.type === "email").length,
      calendar: looseEnds.filter((le) => le.type === "calendar").length,
      github: looseEnds.filter((le) => le.type === "github").length,
      slack: looseEnds.filter((le) => le.type === "slack").length,
    }),
    [looseEnds],
  );

  // Urgent counts per filter
  const urgentCounts = useMemo<Record<FilterType, number>>(
    () => ({
      all: looseEnds.filter((le) => le.urgency === "red").length,
      email: looseEnds.filter(
        (le) => le.type === "email" && le.urgency === "red",
      ).length,
      calendar: looseEnds.filter(
        (le) => le.type === "calendar" && le.urgency === "red",
      ).length,
      github: looseEnds.filter(
        (le) => le.type === "github" && le.urgency === "red",
      ).length,
      slack: looseEnds.filter(
        (le) => le.type === "slack" && le.urgency === "red",
      ).length,
    }),
    [looseEnds],
  );

  /* ─── Action handlers (preserved exactly) ─── */

  async function handleTrash(item: LooseEnd) {
    const messageId = item.meta?.messageId || item.id.replace("gmail-", "");
    setActionPending((prev) => ({ ...prev, [item.id]: true }));
    try {
      const res = await fetch("/api/actions/trash-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId }),
      });
      if (res.ok) {
        dismissItem(item);
      } else if (res.status === 403) {
        setPermissionError(
          "Permission denied: enable Gmail Delete in Settings > Agent Permissions.",
        );
      } else {
        console.error("Failed to trash email");
      }
    } catch (err) {
      console.error("Trash action failed:", err);
    } finally {
      setActionPending((prev) => ({ ...prev, [item.id]: false }));
    }
  }

  async function handleBulkTrash() {
    const messageIds = junkEmails.map((j: JunkEmail) => j.messageId);
    const senders = junkEmails.map((j: JunkEmail) => j.from);
    // Route through CIBA-protected autonomous cleanup — sends Guardian push
    const res = await fetch("/api/autonomous/cleanup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageIds, senders }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.approved && data.success) {
        clearJunk();
      } else if (!data.approved) {
        setPermissionError(
          data.error || "Action not approved. Check Auth0 Guardian on your phone.",
        );
      }
    } else if (res.status === 403) {
      setPermissionError(
        "Permission denied: enable Gmail Delete in Settings > Agent Permissions.",
      );
    } else {
      console.error("Failed to bulk trash emails");
    }
  }

  // Mode 1 (manual): Check schedule + generate reply in parallel → show combined form
  async function handleCreateEvent(item: LooseEnd) {
    setActionPending((prev) => ({ ...prev, [item.id]: true }));
    setExpandedItemId(item.id);

    try {
      // Fire both in parallel — both are fast, no CIBA
      const [checkResult, replyResult] = await Promise.allSettled([
        fetch("/api/actions/check-schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ item }),
        }).then((r) => r.json()),
        fetch("/api/actions/generate-reply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ item }),
        }).then((r) => r.json()),
      ]);

      const check = checkResult.status === "fulfilled" ? checkResult.value : null;
      const reply = replyResult.status === "fulfilled" ? replyResult.value : null;

      if (check) {
        // Show the combined EventReplySheet
        setEventReplySheet({
          item,
          checkResult: check,
          initialReply: reply?.reply || null,
        });
      }
    } catch (err) {
      console.error("Book & Reply check failed:", err);
    } finally {
      setActionPending((prev) => ({ ...prev, [item.id]: false }));
    }
  }

  // When user confirms in EventReplySheet — create event + send reply, no CIBA
  async function handleEventReplyConfirm(payload: { proposed: ProposedEvent; replyBody: string }) {
    if (!eventReplySheet) return;
    const { item } = eventReplySheet;
    setActionPending((prev) => ({ ...prev, [item.id]: true }));

    try {
      // Fire both in parallel — skipCiba since user confirmed in-app
      const [eventRes] = await Promise.allSettled([
        fetch("/api/actions/create-event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ item, force: true, proposed: payload.proposed, skipCiba: true }),
        }).then((r) => r.json()),
        fetch("/api/actions/reply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            threadId: item.meta?.threadId,
            to: item.meta?.from || item.source,
            subject: item.meta?.subject || item.title,
            body: payload.replyBody,
            messageId: item.meta?.rfcMessageId,
            sendDirectly: true,
          }),
        }),
      ]);

      const eventData = eventRes.status === "fulfilled" ? eventRes.value : null;
      if (eventData?.success) {
        setEventCreated((prev) => new Set(prev).add(item.id));
      }

      setEventReplySheet(null);
      dismissItem(item);
    } catch (err) {
      console.error("Book & Reply confirm failed:", err);
    } finally {
      setActionPending((prev) => ({ ...prev, [item.id]: false }));
    }
  }

  // Mode 2 (auto-act): Agent autonomously books + replies via CIBA
  async function handleAutoBookAndReply(item: LooseEnd) {
    setCibaWaiting(item.id);
    try {
      const res = await fetch("/api/autonomous/book-and-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item }),
      });
      const data = await res.json();
      if (data.conflict) return; // conflict found, don't auto-act
      if (data.approved && data.success) {
        setEventCreated((prev) => new Set(prev).add(item.id));
        dismissItem(item);
      }
    } catch (err) {
      console.error("Auto book & reply failed:", err);
    } finally {
      setCibaWaiting(null);
    }
  }

  // Mode 2 (auto-act): Agent autonomously sends email/comment/slack via CIBA
  async function handleAutoAction(
    action: "send_email" | "post_comment" | "send_slack",
    item: LooseEnd,
    params: Record<string, string>,
  ) {
    const endpointMap = {
      send_email: "/api/autonomous/send-email",
      post_comment: "/api/autonomous/post-comment",
      send_slack: "/api/autonomous/send-slack",
    };
    setCibaWaiting(item.id);
    try {
      const res = await fetch(endpointMap[action], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item, params }),
      });
      const data = await res.json();
      if (data.approved && data.success) {
        dismissItem(item);
      } else if (data.approved === false) {
        setPermissionError(data.error || "Action not approved on phone.");
      }
    } catch (err) {
      console.error(`Auto ${action} failed:`, err);
    } finally {
      setCibaWaiting(null);
    }
  }

  // Phase 2: Actually create the event (called from ScheduleSheet)
  async function doCreateEvent(item: LooseEnd, proposed: ProposedEvent) {
    setActionPending((prev) => ({ ...prev, [item.id]: true }));
    try {
      const res = await fetch("/api/actions/create-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item, force: true, proposed }),
      });
      if (!res.ok) {
        if (res.status === 403) setPermissionError("Permission denied: enable Calendar Create in Settings.");
        return;
      }
      const data = await res.json();
      if (data.approved === false) {
        setPermissionError(data.error || "Action not approved. Check Auth0 Guardian on your phone.");
        return;
      }
      if (data.success) {
        setEventCreated((prev) => new Set(prev).add(item.id));
        setScheduleCheck(null);
        if (data.event?.htmlLink) window.open(data.event.htmlLink, "_blank");
      }
    } catch (err) {
      console.error("Create event failed:", err);
    } finally {
      setActionPending((prev) => ({ ...prev, [item.id]: false }));
    }
  }

  // Create event at a specific free slot
  function handleCreateAtSlot(item: LooseEnd, slot: FreeSlot) {
    if (!scheduleCheck) return;
    const proposed: ProposedEvent = {
      ...scheduleCheck.result.proposed,
      date: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
    };
    doCreateEvent(item, proposed);
  }

  // Reply with reschedule alternatives
  function handleReplyWithAlternatives(item: LooseEnd, freeSlots: FreeSlot[]) {
    setScheduleCheck(null);
    setConfirmAction({ item, actionId: "reply" });
    setExpandedItemId(item.id);
    // Store reschedule context so ActionConfirmSheet can auto-generate with it
    setPendingReschedule({
      item,
      context: {
        proposedTime: `${scheduleCheck?.result.proposed.startTime}–${scheduleCheck?.result.proposed.endTime}`,
        conflictNames: scheduleCheck?.result.conflicts.map((c) => c.summary) || [],
        freeSlots: freeSlots.map((s) => ({ label: s.label })),
      },
    });
  }

  function handleAction(actionId: string, item: LooseEnd) {
    if (actionId === "open" && item.deepLink) {
      window.open(item.deepLink, "_blank");
      return;
    }

    if (actionId === "trash" && item.type === "email") {
      handleTrash(item);
      return;
    }

    if (actionId === "create-event") {
      handleCreateEvent(item);
      return;
    }

    // Show inline confirmation sheet
    if (actionId === "reply" || actionId === "comment") {
      setConfirmAction({ item, actionId });
      setExpandedItemId(item.id);
      return;
    }
  }

  async function handleConfirm(payload: { body: string }) {
    if (!confirmAction) return;
    const { item, actionId } = confirmAction;

    setActionPending((prev) => ({ ...prev, [item.id]: true }));
    try {
      if (actionId === "reply" && item.type === "email") {
        const res = await fetch("/api/actions/reply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            threadId: item.meta?.threadId,
            to: item.meta?.from || item.source,
            subject: item.meta?.subject || item.title,
            body: payload.body,
            messageId: item.meta?.rfcMessageId,
            sendDirectly: true,
          }),
        });
        if (res.status === 403) {
          setPermissionError(
            "Permission denied: enable Gmail Reply in Settings > Agent Permissions.",
          );
        } else if (res.ok) {
          dismissItem(item);
        }
      } else if (actionId === "reply" && item.type === "slack") {
        const res = await fetch("/api/actions/slack-reply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channel: item.meta?.channel,
            text: payload.body,
            threadTs: item.meta?.ts,
          }),
        });
        if (res.status === 403) {
          setPermissionError(
            "Permission denied: enable Slack Send in Settings > Agent Permissions.",
          );
        } else if (res.ok) {
          dismissItem(item);
        }
      } else if (actionId === "comment" && item.type === "github") {
        const res = await fetch("/api/actions/github-comment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            owner: item.meta?.owner,
            repo: item.meta?.repo,
            number: item.meta?.number,
            body: payload.body,
          }),
        });
        if (res.status === 403) {
          setPermissionError(
            "Permission denied: enable GitHub Comment in Settings > Agent Permissions.",
          );
        } else if (res.ok) {
          dismissItem(item);
        }
      }
    } catch (err) {
      console.error("Action failed:", err);
    } finally {
      setActionPending((prev) => ({ ...prev, [item.id]: false }));
      setConfirmAction(null);
    }
  }

  function handleCancelConfirm() {
    setConfirmAction(null);
  }

  function handleToggleExpand(id: string) {
    setExpandedItemId((prev) => (prev === id ? null : id));
  }

  return (
    <div className="mx-auto flex h-full max-w-7xl gap-6 px-4 lg:px-6 py-6">
      {/* Main timeline column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <DashboardHeader
          firstName={firstName}
          onScan={() => scan(filter === "all" ? undefined : filter)}
          isScanning={isScanning}
          lastScannedAt={lastScannedAt}
          totalItems={looseEnds.length}
          urgentCount={
            looseEnds.filter((le) => le.urgency === "red").length
          }
          scanScope={filter === "all" ? undefined : filter}
        />

        <div className="mt-5 flex items-center gap-2">
          <div className="flex-1">
            <FilterTabs
              active={filter}
              onChange={setFilter}
              counts={counts}
              urgentCounts={urgentCounts}
            />
          </div>
          {/* View toggle */}
          <div className="flex items-center rounded-lg bg-le-surface/40 p-0.5">
            <button
              onClick={() => { setViewMode("timeline"); sessionStorage.setItem("le-view-mode", "timeline"); }}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all duration-150 ${viewMode === "timeline" ? "bg-le-elevated text-le-text shadow-sm" : "text-le-muted hover:text-le-text"}`}
            >
              Timeline
            </button>
            <button
              onClick={() => { setViewMode("tiles"); sessionStorage.setItem("le-view-mode", "tiles"); }}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all duration-150 ${viewMode === "tiles" ? "bg-le-elevated text-le-text shadow-sm" : "text-le-muted hover:text-le-text"}`}
            >
              Tiles
            </button>
          </div>
        </div>

        {/* Suggestion tray — unified surface for all agent suggestions */}
        {enrichedAll.length > 0 && (
          <div className="mt-4">
            <SuggestionTray
              looseEnds={looseEnds}
              junkEmails={junkEmails}
              suggestions={suggestions}
              agentSuggestions={agentSuggestions}
              onJunkCleanup={handleBulkTrash}
              onItemAction={handleAction}
              onOpenItem={(id) => {
                setExpandedItemId(id);
                const item = looseEnds.find((le) => le.id === id);
                if (item?.deepLink) window.open(item.deepLink, "_blank");
              }}
              onRescueJunk={rescueJunkEmail}
              autoActEnabled={autoActEnabled}
              eventCreatedIds={eventCreated}
              onAutoBookAndReply={handleAutoBookAndReply}
              onAutoAction={handleAutoAction}
            />
          </div>
        )}

        {/* Scrollable content */}
        <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
          {/* === TILES VIEW === */}
          {viewMode === "tiles" ? (
            <div className="grid gap-5 sm:grid-cols-2">
              {(["email", "calendar", "github", "slack"] as const).map((svc, i) => (
                <ServiceTile
                  key={svc}
                  type={svc}
                  items={byService[svc]}
                  connected={servicesLoaded ? connectionMap[svc] : true}
                  permissionDenied={deniedMap[svc]}
                  isScanning={isScanning}
                  index={i}
                  junkCount={svc === "email" ? junkEmails.length : undefined}
                  onClick={() => {
                    setViewMode("timeline");
                    setFilter(svc);
                    sessionStorage.setItem("le-view-mode", "timeline");
                  }}
                />
              ))}
            </div>
          ) : isScanning && enrichedAll.length === 0 ? (
            <TimelineSkeleton />
          ) : enrichedAll.length > 0 ? (
            <div className="relative">
              {/* The continuous timeline spine */}
              <div className="absolute left-[11px] top-0 bottom-0 w-px bg-le-border/40" />

              {/* URGENT bucket */}
              {urgent.length > 0 && (
                <TimelineBucket
                  label="Urgent"
                  color="red"
                  count={urgent.length}
                  items={urgent}
                  expandedItemId={expandedItemId}
                  onToggleExpand={handleToggleExpand}
                  suggestionsLoading={suggestionsLoading}
                  actionPending={actionPending}
                  onAction={handleAction}
                  onDismiss={dismissItem}
                  confirmAction={confirmAction}
                  onConfirm={handleConfirm}
                  onCancelConfirm={handleCancelConfirm}
                  scheduleCheck={scheduleCheck}
                  onScheduleCreate={(item, proposed) => doCreateEvent(item, proposed)}
                  onScheduleSlot={(item, slot) => handleCreateAtSlot(item, slot)}
                  onScheduleReply={(item, slots) => handleReplyWithAlternatives(item, slots)}
                  onScheduleCancel={() => setScheduleCheck(null)}
                  cibaWaiting={cibaWaiting}
                  preGeneratedReply={preGeneratedReply}
                  eventReplySheet={eventReplySheet}
                  onEventReplyConfirm={handleEventReplyConfirm}
                  onEventReplyCancel={() => setEventReplySheet(null)}
                />
              )}

              {/* NEEDS ATTENTION bucket */}
              {needsAttention.length > 0 && (
                <TimelineBucket
                  label="Needs Attention"
                  color="yellow"
                  count={needsAttention.length}
                  items={needsAttention}
                  expandedItemId={expandedItemId}
                  onToggleExpand={handleToggleExpand}
                  suggestionsLoading={suggestionsLoading}
                  actionPending={actionPending}
                  onAction={handleAction}
                  onDismiss={dismissItem}
                  confirmAction={confirmAction}
                  onConfirm={handleConfirm}
                  onCancelConfirm={handleCancelConfirm}
                  scheduleCheck={scheduleCheck}
                  onScheduleCreate={(item, proposed) => doCreateEvent(item, proposed)}
                  onScheduleSlot={(item, slot) => handleCreateAtSlot(item, slot)}
                  onScheduleReply={(item, slots) => handleReplyWithAlternatives(item, slots)}
                  onScheduleCancel={() => setScheduleCheck(null)}
                  cibaWaiting={cibaWaiting}
                  preGeneratedReply={preGeneratedReply}
                  eventReplySheet={eventReplySheet}
                  onEventReplyConfirm={handleEventReplyConfirm}
                  onEventReplyCancel={() => setEventReplySheet(null)}
                />
              )}

              {/* LOW PRIORITY bucket — collapsed by default to reduce scroll */}
              {lowPriority.length > 0 && (
                <TimelineBucket
                  label="Low Priority"
                  color="green"
                  count={lowPriority.length}
                  items={lowPriority}
                  expandedItemId={expandedItemId}
                  onToggleExpand={handleToggleExpand}
                  defaultCollapsed={lowPriority.length > 3}
                  suggestionsLoading={suggestionsLoading}
                  actionPending={actionPending}
                  onAction={handleAction}
                  onDismiss={dismissItem}
                  confirmAction={confirmAction}
                  onConfirm={handleConfirm}
                  onCancelConfirm={handleCancelConfirm}
                  scheduleCheck={scheduleCheck}
                  onScheduleCreate={(item, proposed) => doCreateEvent(item, proposed)}
                  onScheduleSlot={(item, slot) => handleCreateAtSlot(item, slot)}
                  onScheduleReply={(item, slots) => handleReplyWithAlternatives(item, slots)}
                  onScheduleCancel={() => setScheduleCheck(null)}
                  cibaWaiting={cibaWaiting}
                  preGeneratedReply={preGeneratedReply}
                  eventReplySheet={eventReplySheet}
                  onEventReplyConfirm={handleEventReplyConfirm}
                  onEventReplyCancel={() => setEventReplySheet(null)}
                />
              )}
            </div>
          ) : !isScanning ? (
            <AllClearState />
          ) : null}

          {/* Junk cleanup is now handled by SuggestionTray above */}

          {/* Permission error banner */}
          {permissionError && (
            <div className="mt-4 ml-7 flex items-center justify-between rounded-xl border border-le-yellow/30 bg-le-yellow/5 px-4 py-3 text-xs text-le-yellow">
              <div className="flex items-center gap-2">
                <svg
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-4 w-4 shrink-0"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>{permissionError}</span>
              </div>
              <button
                onClick={() => setPermissionError(null)}
                className="ml-3 shrink-0 text-le-yellow/60 hover:text-le-yellow"
              >
                <svg
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  className="h-3.5 w-3.5"
                >
                  <path d="M5.28 4.22a.75.75 0 00-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 101.06 1.06L8 9.06l2.72 2.72a.75.75 0 101.06-1.06L9.06 8l2.72-2.72a.75.75 0 00-1.06-1.06L8 6.94 5.28 4.22z" />
                </svg>
              </button>
            </div>
          )}

          {/* Scan errors */}
          {Object.keys(errors).length > 0 && (
            <div className="mt-4 ml-7 rounded-xl border border-le-red/20 bg-le-red/5 px-4 py-3 text-xs text-le-red">
              {Object.entries(errors).map(([k, v]) => (
                <p key={k}>
                  Failed to scan {k}: {v}
                </p>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* Right sidebar -- hidden on mobile */}
      <Sidebar items={looseEnds} />

      {/* Floating chat panel — always visible, all breakpoints */}
      <ChatDrawer />
    </div>
  );
}
