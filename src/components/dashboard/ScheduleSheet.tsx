"use client";

import { motion } from "framer-motion";
import type {
  LooseEnd,
  ScheduleCheckResult,
  ProposedEvent,
  FreeSlot,
} from "@/lib/types";

interface ScheduleSheetProps {
  item: LooseEnd;
  checkResult: ScheduleCheckResult;
  onCreateEvent: (proposed: ProposedEvent) => void;
  onCreateAtSlot: (slot: FreeSlot) => void;
  onReplyWithAlternatives: (freeSlots: FreeSlot[]) => void;
  onCancel: () => void;
  isPending: boolean;
}

function formatTime(start: string, end: string) {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `${fmt(start)} \u2013 ${fmt(end)}`;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/* ---- Inline SVG icons ---- */
const Icon = ({ d, size = "h-4 w-4" }: { d: string; size?: string }) => (
  <svg viewBox="0 0 20 20" fill="currentColor" className={size}>
    <path fillRule="evenodd" d={d} clipRule="evenodd" />
  </svg>
);
const ICON_CALENDAR =
  "M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75z";
const ICON_WARNING =
  "M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z";
const ICON_CHECK =
  "M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z";
const ICON_INFO =
  "M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z";

export default function ScheduleSheet({
  checkResult,
  onCreateEvent,
  onCreateAtSlot,
  onReplyWithAlternatives,
  onCancel,
  isPending,
}: ScheduleSheetProps) {
  const { proposed, existingMeeting, conflicts, freeSlots, alreadyResponded } =
    checkResult;

  const hasConflicts = conflicts.length > 0 && !existingMeeting;
  const allClear = !existingMeeting && conflicts.length === 0;

  const pendingSpinner = (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-3 w-3 animate-spin rounded-full border border-current/30 border-t-current" />
      Working...
    </span>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="glass mt-4 overflow-hidden rounded-2xl"
    >
      <div className="p-5">
        {/* --- State A: Existing Meeting Found --- */}
        {existingMeeting && (
          <>
            <div className="flex items-center gap-2.5 rounded-xl bg-le-yellow/10 px-3.5 py-2.5">
              <span className="text-le-yellow"><Icon d={ICON_CALENDAR} /></span>
              <p className="text-sm font-medium text-le-yellow">
                Meeting already scheduled
                {proposed.attendees.length > 0 && ` with ${proposed.attendees[0]}`}
              </p>
            </div>
            <div className="mt-3 rounded-lg border border-le-border/30 bg-le-void/50 px-3.5 py-2.5">
              <p className="text-sm font-medium text-le-text">{existingMeeting.summary}</p>
              <p className="mt-1 text-xs text-le-muted">
                {formatDate(existingMeeting.start)} &middot; {formatTime(existingMeeting.start, existingMeeting.end)}
              </p>
              <a
                href={existingMeeting.htmlLink}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1.5 inline-block text-[11px] font-medium text-le-accent hover:text-le-accent/80 transition-colors"
              >
                Open in Calendar &rarr;
              </a>
            </div>
          </>
        )}

        {/* --- State B: Time Conflicts --- */}
        {hasConflicts && (
          <>
            <div className="flex items-center gap-2.5 rounded-xl bg-le-red/10 px-3.5 py-2.5">
              <span className="text-le-red"><Icon d={ICON_WARNING} /></span>
              <p className="text-sm font-medium text-le-red">
                Conflicts with {conflicts.map((c) => c.summary).join(", ")}
              </p>
            </div>
            <div className="mt-3 space-y-1.5">
              {conflicts.map((c) => (
                <div key={c.eventId} className="flex items-center justify-between rounded-lg border border-le-border/20 bg-le-void/40 px-3 py-2">
                  <span className="text-xs font-medium text-le-text">{c.summary}</span>
                  <span className="text-[11px] text-le-muted">{formatTime(c.start, c.end)}</span>
                </div>
              ))}
            </div>
            {freeSlots.length > 0 && (
              <>
                <div className="my-3 border-t border-le-border/20" />
                <p className="mb-2 text-xs font-medium text-le-muted">Available times</p>
                <div className="flex flex-wrap gap-2">
                  {freeSlots.map((slot, i) => (
                    <button
                      key={i}
                      onClick={() => onCreateAtSlot(slot)}
                      disabled={isPending}
                      className="rounded-lg border border-le-green/20 bg-le-green/10 px-3 py-1.5 text-xs font-medium text-le-green transition-all hover:bg-le-green/20 active:scale-[0.97] disabled:opacity-50"
                    >
                      {slot.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {/* --- State C: All Clear --- */}
        {allClear && (
          <>
            <div className="flex items-center gap-2.5 rounded-xl bg-le-green/10 px-3.5 py-2.5">
              <span className="text-le-green"><Icon d={ICON_CHECK} /></span>
              <p className="text-sm font-medium text-le-green">
                No conflicts &mdash; {proposed.summary} on {formatDate(proposed.date)} {proposed.startTime} &ndash; {proposed.endTime}
              </p>
            </div>
            {proposed.attendees.length > 0 && (
              <p className="mt-2 text-xs text-le-muted">
                Attendees: {proposed.attendees.join(", ")}
              </p>
            )}
          </>
        )}

        {/* Already responded note */}
        {alreadyResponded && (
          <div className="mt-3 flex items-center gap-1.5 text-le-muted/60">
            <Icon d={ICON_INFO} size="h-3.5 w-3.5" />
            <span className="text-[11px]">You already replied to this thread</span>
          </div>
        )}

        {/* --- Footer buttons --- */}
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          {existingMeeting && (
            <>
              <a
                href={existingMeeting.htmlLink}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl px-4 py-2 text-sm font-medium text-le-muted transition-all hover:bg-le-elevated/50 hover:text-le-text"
              >
                Open Existing
              </a>
              <button
                onClick={() => onCreateEvent(proposed)}
                disabled={isPending}
                className="rounded-xl bg-le-elevated px-4 py-2 text-sm font-medium text-le-text transition-all hover:bg-le-elevated/80 active:scale-[0.97] disabled:opacity-50"
              >
                {isPending ? pendingSpinner : "Create Anyway"}
              </button>
            </>
          )}

          {hasConflicts && (
            <>
              <button
                onClick={onCancel}
                disabled={isPending}
                className="rounded-xl px-4 py-2 text-sm font-medium text-le-muted transition-all hover:bg-le-elevated/50 hover:text-le-text disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => onCreateEvent(proposed)}
                disabled={isPending}
                className="rounded-xl bg-le-elevated px-4 py-2 text-sm font-medium text-le-text transition-all hover:bg-le-elevated/80 active:scale-[0.97] disabled:opacity-50"
              >
                {isPending ? pendingSpinner : "Create Anyway"}
              </button>
              <button
                onClick={() => onReplyWithAlternatives(freeSlots)}
                disabled={isPending}
                className="rounded-xl bg-le-accent px-4 py-2 text-sm font-medium text-le-void transition-all hover:shadow-[0_0_20px_rgba(232,168,73,0.3)] active:scale-[0.97] disabled:opacity-50"
              >
                {isPending ? pendingSpinner : "Reply with Alternatives"}
              </button>
            </>
          )}

          {allClear && (
            <>
              <button
                onClick={onCancel}
                disabled={isPending}
                className="rounded-xl px-4 py-2 text-sm font-medium text-le-muted transition-all hover:bg-le-elevated/50 hover:text-le-text disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => onCreateEvent(proposed)}
                disabled={isPending}
                className="rounded-xl bg-le-accent px-4 py-2 text-sm font-medium text-le-void transition-all hover:shadow-[0_0_20px_rgba(232,168,73,0.3)] active:scale-[0.97] disabled:opacity-50"
              >
                {isPending ? pendingSpinner : "Create Event"}
              </button>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}
