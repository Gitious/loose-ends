"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { LooseEnd, JunkEmail } from "@/lib/types";
import LooseEndCard from "./LooseEndCard";
import ActionConfirmSheet from "./ActionConfirmSheet";
import JunkCleanupBanner from "./JunkCleanupBanner";

const SERVICE_LABELS: Record<string, string> = {
  email: "Gmail",
  calendar: "Calendar",
  github: "GitHub",
  slack: "Slack",
};

export default function ServiceDetail({
  type,
  items,
  suggestionsLoading,
  actionPending,
  onAction,
  onBack,
  confirmAction,
  onConfirm,
  onCancelConfirm,
  junkEmails,
  onCleanup,
  onRescue,
}: {
  type: string;
  items: LooseEnd[];
  suggestionsLoading: boolean;
  actionPending: Record<string, boolean>;
  onAction: (actionId: string, item: LooseEnd) => void;
  onBack: () => void;
  confirmAction?: { item: LooseEnd; actionId: string } | null;
  onConfirm?: (payload: { body: string }) => void;
  onCancelConfirm?: () => void;
  junkEmails?: JunkEmail[];
  onCleanup?: () => Promise<void>;
  onRescue?: (junkEmail: JunkEmail) => void;
}) {
  const [selectedItem, setSelectedItem] = useState<LooseEnd | null>(null);
  const [itemBody, setItemBody] = useState<string | null>(null);
  const [isLoadingBody, setIsLoadingBody] = useState(false);
  const [isBodyExpanded, setIsBodyExpanded] = useState(false);

  const fetchBody = useCallback(async (item: LooseEnd) => {
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
  }, []);

  useEffect(() => {
    if (selectedItem) {
      fetchBody(selectedItem);
    } else {
      setItemBody(null);
      setIsLoadingBody(false);
      setIsBodyExpanded(false);
    }
  }, [selectedItem, fetchBody]);

  const BODY_TRUNCATE_LENGTH = 500;
  const bodyIsTruncated = itemBody != null && itemBody.length > BODY_TRUNCATE_LENGTH;
  const displayBody = itemBody != null
    ? isBodyExpanded || !bodyIsTruncated
      ? itemBody
      : itemBody.slice(0, BODY_TRUNCATE_LENGTH) + "..."
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3, ease: [0.25, 1, 0.5, 1] }}
      className="flex h-full flex-col"
    >
      {/* Back header */}
      <div className="mb-5 flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-le-elevated text-le-muted transition-colors hover:text-le-text"
          aria-label="Back"
        >
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
            <path fillRule="evenodd" d="M9.78 4.22a.75.75 0 010 1.06L7.06 8l2.72 2.72a.75.75 0 11-1.06 1.06L5.47 8.53a.75.75 0 010-1.06l3.25-3.25a.75.75 0 011.06 0z" clipRule="evenodd" />
          </svg>
        </button>
        <h2 className="text-lg font-semibold text-le-text">
          {SERVICE_LABELS[type] || type}
        </h2>
        <span className="rounded-full bg-le-elevated px-2.5 py-0.5 text-xs text-le-muted">
          {items.length} item{items.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Junk cleanup banner for email */}
      {junkEmails && junkEmails.length > 0 && onCleanup && (
        <JunkCleanupBanner junkEmails={junkEmails} onCleanup={onCleanup} onRescue={onRescue} />
      )}

      {/* Two-pane: list + detail (stacks vertically on mobile) */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 md:flex-row">
        {/* Item list */}
        <div className={`w-full overflow-y-auto pr-1 ${selectedItem ? "max-md:max-h-[40vh] md:max-w-[50%]" : ""}`}>
          <div className="grid gap-3">
            {items.map((item, index) => (
              <div
                key={item.id}
                onClick={() => setSelectedItem(item)}
                className={`cursor-pointer transition-all ${selectedItem?.id === item.id ? "ring-1 ring-le-accent/40 rounded-xl" : ""}`}
              >
                <LooseEndCard
                  item={item}
                  index={index}
                  suggestionsLoading={suggestionsLoading}
                  isPending={actionPending[item.id] || false}
                  onAction={(actionId) => onAction(actionId, item)}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Detail panel */}
        <AnimatePresence>
          {selectedItem && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.25, 1, 0.5, 1] }}
              className="glass w-full overflow-hidden rounded-2xl md:w-1/2"
            >
              <div className="flex h-full flex-col p-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-le-text">Details</h3>
                  <button
                    onClick={() => setSelectedItem(null)}
                    className="rounded-md p-1 text-le-muted hover:text-le-text"
                    aria-label="Close details"
                  >
                    <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                      <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
                    </svg>
                  </button>
                </div>

                <div className="mt-4 space-y-4 overflow-y-auto">
                  <div>
                    <p className="text-xs text-le-muted">Title</p>
                    <p className="mt-1 text-sm text-le-text">{selectedItem.title}</p>
                  </div>

                  <div>
                    <p className="text-xs text-le-muted">Description</p>
                    <p className="mt-1 text-sm text-le-text">{selectedItem.description}</p>
                  </div>

                  {/* Content / Body */}
                  <div>
                    <p className="text-xs text-le-muted">Content</p>
                    <div className="mt-1 rounded-lg border border-le-border/40 bg-le-void/50 p-3">
                      {isLoadingBody ? (
                        <div className="space-y-2">
                          <div className="h-3 w-full animate-pulse rounded bg-le-elevated/60" />
                          <div className="h-3 w-4/5 animate-pulse rounded bg-le-elevated/60" />
                          <div className="h-3 w-3/5 animate-pulse rounded bg-le-elevated/60" />
                          <div className="h-3 w-2/3 animate-pulse rounded bg-le-elevated/60" />
                        </div>
                      ) : displayBody ? (
                        selectedItem.type === "slack" ? (
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
                            <p className="whitespace-pre-wrap text-xs leading-relaxed text-le-text/70">{displayBody}</p>
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
                  </div>

                  {selectedItem.aiSuggestion && (
                    <div className="rounded-lg bg-le-accent/5 border border-le-accent/20 px-3 py-2.5">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-le-accent mb-1">AI Suggestion</p>
                      <p className="text-xs italic text-le-accent/80">{selectedItem.aiSuggestion}</p>
                    </div>
                  )}

                  <div>
                    <p className="text-xs text-le-muted">Source</p>
                    <p className="mt-1 text-sm text-le-text">{selectedItem.source}</p>
                  </div>

                  {/* Action buttons */}
                  <div className="flex flex-wrap gap-2 pt-2">
                    {selectedItem.actions?.map((action) => (
                      <button
                        key={action.id}
                        onClick={() => onAction(action.id, selectedItem)}
                        disabled={actionPending[selectedItem.id]}
                        className={`rounded-xl px-4 py-2.5 text-sm font-medium transition-all active:scale-[0.97] disabled:opacity-50 ${
                          action.variant === "primary"
                            ? "bg-le-accent text-le-void hover:shadow-[0_0_20px_rgba(232,168,73,0.25)]"
                            : action.variant === "secondary"
                              ? "bg-le-elevated text-le-text hover:bg-le-elevated/80"
                              : "text-le-muted hover:text-le-text hover:bg-le-elevated/50"
                        }`}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>

                  {/* Inline action confirmation sheet */}
                  <AnimatePresence>
                    {confirmAction && confirmAction.item.id === selectedItem.id && onConfirm && onCancelConfirm && (
                      <ActionConfirmSheet
                        item={confirmAction.item}
                        actionId={confirmAction.actionId}
                        onConfirm={onConfirm}
                        onCancel={onCancelConfirm}
                        isPending={actionPending[confirmAction.item.id] || false}
                      />
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
