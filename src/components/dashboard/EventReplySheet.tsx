"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import type { LooseEnd, ScheduleCheckResult, ProposedEvent, FreeSlot } from "@/lib/types";

interface EventReplySheetProps {
  item: LooseEnd;
  checkResult: ScheduleCheckResult;
  initialReply: string | null;
  onConfirm: (payload: { proposed: ProposedEvent; replyBody: string }) => void;
  onCancel: () => void;
  isPending: boolean;
}

/* ---- Helpers ---- */
const fmtT = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const formatTime = (s: string, e: string) => `${fmtT(s)} \u2013 ${fmtT(e)}`;
const formatDate = (d: string) => new Date(d).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
const senderName = (i: LooseEnd) => (i.meta?.from || i.source || "").split("<")[0].trim() || "sender";

/* ---- SVG icon helper + paths ---- */
const I = ({ d, s = "h-4 w-4" }: { d: string; s?: string }) => (
  <svg viewBox="0 0 20 20" fill="currentColor" className={s}><path fillRule="evenodd" d={d} clipRule="evenodd" /></svg>
);
const P = {
  cal: "M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75z",
  warn: "M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z",
  ok: "M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z",
  info: "M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z",
  spark: "M7.657 6.247c.11-.33.576-.33.686 0l.645 1.937a2.89 2.89 0 001.829 1.828l1.936.645c.33.11.33.576 0 .686l-1.937.645a2.89 2.89 0 00-1.828 1.829l-.645 1.936a.361.361 0 01-.686 0l-.645-1.937a2.89 2.89 0 00-1.828-1.828l-1.937-.645a.361.361 0 010-.686l1.937-.645a2.89 2.89 0 001.828-1.829l.645-1.936z",
};
const INPUT_CLS = "border-b border-le-border/30 bg-transparent text-sm text-le-text focus:border-le-accent outline-none py-1.5 w-full transition-colors";

export default function EventReplySheet({
  item,
  checkResult,
  initialReply,
  onConfirm,
  onCancel,
  isPending,
}: EventReplySheetProps) {
  const { proposed, existingMeeting, conflicts, freeSlots, alreadyResponded } =
    checkResult;

  const [summary, setSummary] = useState(proposed.summary);
  const [date, setDate] = useState(proposed.date);
  const [startTime, setStartTime] = useState(proposed.startTime);
  const [endTime, setEndTime] = useState(proposed.endTime);
  const [body, setBody] = useState(initialReply || "");
  const [isGenerating, setIsGenerating] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasConflicts = conflicts.length > 0 && !existingMeeting;
  const allClear = !existingMeeting && conflicts.length === 0;

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, []);

  useEffect(() => {
    if (textareaRef.current) { textareaRef.current.focus(); autoResize(); }
  }, [autoResize]);

  function applySlot(slot: FreeSlot) {
    setDate(slot.date); setStartTime(slot.startTime); setEndTime(slot.endTime);
  }

  async function handleGenerate() {
    setIsGenerating(true);
    try {
      const res = await fetch("/api/actions/generate-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.reply) {
          setBody(data.reply);
          setTimeout(autoResize, 0);
        }
      }
    } catch { /* non-critical */
    } finally {
      setIsGenerating(false);
    }
  }

  function handleSubmit() {
    if (!body.trim() || isPending) return;
    onConfirm({
      proposed: { summary, date, startTime, endTime, attendees: proposed.attendees, description: proposed.description },
      replyBody: body.trim(),
    });
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="glass mt-4 overflow-hidden rounded-2xl"
    >
      <div className="p-5">
        {/* Header */}
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-le-accent/15 text-le-accent"><I d={P.cal} /></div>
          <h3 className="text-sm font-semibold text-le-text">Book &amp; Reply</h3>
        </div>

        {/* Schedule status */}
        <div className="mt-4 space-y-2.5">
          {existingMeeting && (
            <div className="rounded-xl bg-amber-500/10 px-3.5 py-2.5">
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 text-amber-400"><I d={P.warn} /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-amber-300">
                    You already have a meeting
                    {proposed.attendees.length > 0 && ` with ${proposed.attendees[0]}`}:
                    {" "}{existingMeeting.summary} on {formatDate(existingMeeting.start)}
                  </p>
                  <p className="mt-1 text-xs text-amber-300/60">
                    {formatTime(existingMeeting.start, existingMeeting.end)}
                  </p>
                  <a
                    href={existingMeeting.htmlLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1.5 inline-block text-[11px] font-medium text-le-accent hover:text-le-accent/80 transition-colors"
                  >
                    Open Existing &rarr;
                  </a>
                </div>
              </div>
            </div>
          )}

          {hasConflicts && (
            <div className="space-y-2.5">
              <div className="flex items-center gap-2.5 rounded-xl bg-le-red/10 px-3.5 py-2.5">
                <span className="text-le-red"><I d={P.warn} /></span>
                <p className="text-sm font-medium text-le-red">
                  Conflicts with {conflicts.map((c) => c.summary).join(", ")}
                </p>
              </div>
              {freeSlots.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[11px] font-medium text-le-muted">
                    Available slots
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {freeSlots.map((slot, i) => (
                      <button
                        key={i}
                        onClick={() => applySlot(slot)}
                        className="rounded-lg border border-le-green/20 bg-le-green/10 px-2.5 py-1 text-xs font-medium text-le-green transition-all hover:bg-le-green/20 active:scale-[0.97]"
                      >
                        {slot.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {allClear && (
            <div className="flex items-center gap-2 rounded-xl bg-le-green/10 px-3.5 py-2">
              <span className="text-le-green"><I d={P.ok} s="h-3.5 w-3.5" /></span>
              <p className="text-xs font-medium text-le-green">No conflicts found</p>
            </div>
          )}

          {alreadyResponded && (
            <div className="flex items-center gap-1.5 text-le-muted/60">
              <I d={P.info} s="h-3.5 w-3.5" />
              <span className="text-[11px]">You already replied to this thread</span>
            </div>
          )}
        </div>

        {/* Editable event details */}
        <div className="mt-4 space-y-2.5">
          <input type="text" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Event title" className={INPUT_CLS} />
          <div className="grid grid-cols-3 gap-3">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={INPUT_CLS} />
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={INPUT_CLS} />
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={INPUT_CLS} />
          </div>
        </div>

        {/* Divider */}
        <div className="my-4 border-t border-le-border/20" />

        {/* Reply composer */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-le-muted">
              Reply to {senderName(item)}
            </span>
            <button
              onClick={handleGenerate}
              disabled={isGenerating || isPending}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-le-accent transition-all hover:bg-le-accent/10 disabled:opacity-50"
            >
              <I d={P.spark} s="h-3.5 w-3.5" />
              {isGenerating ? "Generating..." : "Generate with AI"}
            </button>
          </div>

          <div className="relative">
            {isGenerating && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-le-void/80 backdrop-blur-sm">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-le-accent" style={{ animationDelay: "0ms" }} />
                  <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-le-accent" style={{ animationDelay: "150ms" }} />
                  <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-le-accent" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                autoResize();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder="Write your reply or click Generate with AI..."
              rows={3}
              disabled={isGenerating}
              className="w-full resize-none rounded-xl border border-le-border bg-le-void/50 px-4 py-3 text-sm text-le-text placeholder:text-le-muted/50 focus:border-le-accent/40 focus:outline-none focus:ring-1 focus:ring-le-accent/30 disabled:opacity-50"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="mt-4 flex items-center justify-between">
          <span className="text-[10px] text-le-muted/50">
            {typeof navigator !== "undefined" && navigator.platform?.includes("Mac")
              ? "\u2318"
              : "Ctrl"}
            +Enter to confirm
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onCancel}
              disabled={isPending}
              className="rounded-xl px-4 py-2 text-sm font-medium text-le-muted transition-all hover:bg-le-elevated/50 hover:text-le-text disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!body.trim() || isPending}
              className="rounded-xl bg-le-accent px-4 py-2 text-sm font-medium text-le-void transition-all hover:shadow-[0_0_20px_rgba(232,168,73,0.3)] active:scale-[0.97] disabled:opacity-50"
            >
              {isPending ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-3 w-3 animate-spin rounded-full border border-le-void/30 border-t-le-void" />
                  Booking...
                </span>
              ) : (
                "Confirm \u2014 Book & Reply"
              )}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
