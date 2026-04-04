"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import type { LooseEnd } from "@/lib/types";

const ACTION_CONFIG: Record<string, { icon: React.ReactNode; verb: string; buttonLabel: string }> = {
  reply: {
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
        <path fillRule="evenodd" d="M7.793 2.232a.75.75 0 01-.025 1.06L3.622 7.25h10.003a5.375 5.375 0 010 10.75H10.75a.75.75 0 010-1.5h2.875a3.875 3.875 0 000-7.75H3.622l4.146 3.957a.75.75 0 01-1.036 1.085l-5.5-5.25a.75.75 0 010-1.085l5.5-5.25a.75.75 0 011.06.025z" clipRule="evenodd" />
      </svg>
    ),
    verb: "Draft Reply to",
    buttonLabel: "Create Draft",
  },
  comment: {
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
        <path fillRule="evenodd" d="M10 2c-2.236 0-4.43.18-6.57.524C1.993 2.755 1 4.014 1 5.426v5.148c0 1.413.993 2.67 2.43 2.902 1.168.188 2.352.327 3.55.414.28.02.521.18.642.413l1.713 3.293a.75.75 0 001.33 0l1.713-3.293c.121-.233.362-.393.642-.414 1.198-.087 2.382-.226 3.55-.414 1.437-.231 2.43-1.49 2.43-2.902V5.426c0-1.413-.993-2.67-2.43-2.902A41.289 41.289 0 0010 2z" clipRule="evenodd" />
      </svg>
    ),
    verb: "Comment on",
    buttonLabel: "Post Comment",
  },
};

function getContextTitle(actionId: string, item: LooseEnd): string {
  const config = ACTION_CONFIG[actionId];
  if (!config) return actionId;

  if (actionId === "reply") {
    if (item.type === "slack") {
      return `Reply in ${item.title}`;
    }
    const senderName = (item.meta?.from || item.source || "").split("<")[0].trim();
    return `${config.verb} ${senderName}`;
  }
  if (actionId === "comment") {
    const repo = item.meta?.repo || "";
    const number = item.meta?.number || "";
    return `${config.verb} ${repo}#${number}`;
  }
  return config.verb;
}

function getButtonLabel(actionId: string, item: LooseEnd): string {
  if (actionId === "reply" && item.type === "slack") return "Send Message";
  const config = ACTION_CONFIG[actionId];
  return config?.buttonLabel || "Submit";
}

export default function ActionConfirmSheet({
  item,
  actionId,
  onConfirm,
  onCancel,
  isPending,
}: {
  item: LooseEnd;
  actionId: string;
  onConfirm: (payload: { body: string }) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const config = ACTION_CONFIG[actionId] || ACTION_CONFIG.comment;
  const [body, setBody] = useState(item.aiSuggestion || "");
  const [isGenerating, setIsGenerating] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus and auto-resize
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
      autoResize();
    }
  }, []);

  function autoResize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
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
          // Trigger auto-resize after setting
          setTimeout(() => autoResize(), 0);
        }
      }
    } catch {
      // Generation is non-critical
    } finally {
      setIsGenerating(false);
    }
  }

  function handleSubmit() {
    if (!body.trim() || isPending) return;
    onConfirm({ body: body.trim() });
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
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-le-accent/15 text-le-accent">
            {config.icon}
          </div>
          <h3 className="text-sm font-semibold text-le-text">
            {getContextTitle(actionId, item)}
          </h3>
        </div>

        {/* Context fields */}
        <div className="mt-4 space-y-2">
          {actionId === "reply" && item.type === "email" && (
            <>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-le-muted">To:</span>
                <span className="text-le-text">{(item.meta?.from || item.source || "").split("<")[0].trim()}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-le-muted">Subject:</span>
                <span className="truncate text-le-text">{item.meta?.subject || item.title}</span>
              </div>
            </>
          )}
          {actionId === "reply" && item.type === "slack" && (
            <>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-le-muted">Channel:</span>
                <span className="text-le-text">{item.title}</span>
              </div>
              {item.description && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-le-muted">Last message:</span>
                  <span className="truncate text-le-text/70">{item.description}</span>
                </div>
              )}
            </>
          )}
          {actionId === "comment" && (
            <>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-le-muted">Repo:</span>
                <span className="text-le-text">{item.meta?.owner}/{item.meta?.repo}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-le-muted">Issue/PR:</span>
                <span className="text-le-text">#{item.meta?.number}</span>
              </div>
            </>
          )}
        </div>

        {/* AI suggestion context line */}
        {item.aiSuggestion && !isGenerating && body !== item.aiSuggestion && (
          <p className="mt-4 mb-1 text-[11px] text-le-muted/70 italic">
            AI suggestion: {item.aiSuggestion}
          </p>
        )}

        {/* Generate with AI button */}
        {actionId === "reply" && (
          <div className="mt-4 mb-2">
            <button
              onClick={handleGenerate}
              disabled={isGenerating || isPending}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-le-accent transition-all hover:bg-le-accent/10 disabled:opacity-50"
            >
              <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                <path d="M7.657 6.247c.11-.33.576-.33.686 0l.645 1.937a2.89 2.89 0 001.829 1.828l1.936.645c.33.11.33.576 0 .686l-1.937.645a2.89 2.89 0 00-1.828 1.829l-.645 1.936a.361.361 0 01-.686 0l-.645-1.937a2.89 2.89 0 00-1.828-1.828l-1.937-.645a.361.361 0 010-.686l1.937-.645a2.89 2.89 0 001.828-1.829l.645-1.936zM3.794 1.148a.217.217 0 01.412 0l.387 1.162c.173.518.57.916 1.09 1.09l1.16.387a.217.217 0 010 .412l-1.162.387a1.734 1.734 0 00-1.09 1.09l-.386 1.16a.217.217 0 01-.412 0l-.387-1.162a1.734 1.734 0 00-1.09-1.09L1.154 3.2a.217.217 0 010-.412l1.162-.387a1.734 1.734 0 001.09-1.09l.386-1.16z" />
              </svg>
              {isGenerating ? "Generating..." : "Generate with AI"}
            </button>
          </div>
        )}

        {/* Textarea with shimmer when generating */}
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
            placeholder={
              actionId === "reply" && item.type === "slack"
                ? "Write your Slack message or click Generate with AI..."
                : actionId === "reply"
                  ? "Write your reply or click Generate with AI..."
                  : "Write your comment..."
            }
            rows={4}
            disabled={isGenerating}
            className="w-full resize-none rounded-xl border border-le-border bg-le-void/50 px-4 py-3 text-sm text-le-text placeholder:text-le-muted/50 focus:border-le-accent/40 focus:outline-none focus:ring-1 focus:ring-le-accent/30 disabled:opacity-50"
          />
        </div>

        {/* AI suggestion hint */}
        {item.aiSuggestion && body === item.aiSuggestion && (
          <p className="mt-1.5 text-[10px] text-le-accent/60">
            Pre-filled with AI suggestion. Edit as needed.
          </p>
        )}

        {/* Footer */}
        <div className="mt-4 flex items-center justify-between">
          <span className="text-[10px] text-le-muted/50">
            {navigator.platform?.includes("Mac") ? "\u2318" : "Ctrl"}+Enter to send
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
                  Sending...
                </span>
              ) : (
                getButtonLabel(actionId, item)
              )}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
