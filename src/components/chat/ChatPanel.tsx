"use client";

import { useChat } from "@ai-sdk/react";
import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import type { LooseEnd } from "@/lib/types";
import SuggestionCard, { isSuggestion } from "./SuggestionCard";

const TOOL_LABELS: Record<string, string> = {
  scanGmail: "Scanning Gmail",
  scanCalendar: "Checking Calendar",
  scanGitHub: "Scanning GitHub",
  scanSlack: "Scanning Slack",
  bulkTrashJunk: "Cleaning up junk emails",
  trashEmail: "Trashing email",
  sendEmailReply: "Sending reply",
  sendNewEmail: "Sending email",
  reviewPullRequest: "Submitting review",
  sendSlackMessage: "Sending Slack message",
  getEmailDetails: "Reading email",
  draftEmailReply: "Drafting reply",
  createCalendarEvent: "Creating event",
  commentOnGitHub: "Posting comment",
};

// Tier 3 tools that require CIBA Guardian approval
const CIBA_TOOLS = new Set([
  "trashEmail", "bulkTrashJunk", "sendEmailReply",
  "sendNewEmail", "reviewPullRequest", "sendSlackMessage",
]);

const URGENCY_RING: Record<string, string> = {
  red: "border-le-red/40 bg-le-red/5",
  yellow: "border-le-yellow/40 bg-le-yellow/5",
  green: "border-le-green/40 bg-le-green/5",
};

const URGENCY_DOT: Record<string, string> = {
  red: "bg-le-red",
  yellow: "bg-le-yellow",
  green: "bg-le-green",
};

function ToolResultCard({ items }: { items: LooseEnd[] }) {
  if (!items || items.length === 0) {
    return (
      <p className="my-2 text-xs italic text-le-muted">
        No loose ends found in this service.
      </p>
    );
  }

  return (
    <div className="my-2 space-y-1.5">
      {items.map((item) => (
        <div
          key={item.id}
          className={`rounded-lg border px-3 py-2.5 transition-colors ${URGENCY_RING[item.urgency] ?? "border-le-border/40 bg-le-void/40"}`}
        >
          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-2 w-2 shrink-0 rounded-full ${URGENCY_DOT[item.urgency] ?? "bg-le-muted"}`}
            />
            <span className="truncate text-xs font-medium text-le-text">
              {item.title}
            </span>
            <span className="ml-auto shrink-0 rounded-full bg-le-surface px-2 py-0.5 text-[10px] text-le-muted">
              {item.age}
            </span>
          </div>
          <p className="mt-1 pl-4 text-xs leading-relaxed text-le-muted">
            {item.description}
          </p>
        </div>
      ))}
    </div>
  );
}

function isLooseEnd(value: unknown): value is LooseEnd {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "title" in value &&
    "urgency" in value &&
    "type" in value
  );
}

interface ToolResult {
  looseEnds: LooseEnd[];
  error?: string;
}

function parseToolOutput(output: unknown): ToolResult | null {
  if (
    typeof output === "object" &&
    output !== null &&
    "looseEnds" in output
  ) {
    const obj = output as { looseEnds?: unknown; error?: string };
    const items = Array.isArray(obj.looseEnds) ? obj.looseEnds.filter(isLooseEnd) : [];
    return { looseEnds: items, error: obj.error };
  }
  if (Array.isArray(output)) {
    if (output.length === 0) return { looseEnds: [] };
    return { looseEnds: output.filter(isLooseEnd) };
  }
  return null;
}

function AgentAvatar() {
  return (
    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-le-accent/15 text-le-accent">
      <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none">
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="8" cy="8" r="2" fill="currentColor" />
      </svg>
    </div>
  );
}

export default function ChatPanel({ expanded }: { expanded?: boolean }) {
  const { messages, sendMessage, status, error, stop } = useChat();

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [input, setInput] = useState("");

  const isLoading = status === "submitted" || status === "streaming";

  // Auto-scroll on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [messages, status]);

  // Auto-resize textarea
  const resizeTextarea = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, expanded ? 160 : 100) + "px";
  }, [expanded]);

  useEffect(() => {
    resizeTextarea();
  }, [input, resizeTextarea]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;
    sendMessage({ text });
    setInput("");
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Welcome message */}
        <div className="flex items-start gap-3">
          <AgentAvatar />
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="max-w-[85%] rounded-2xl rounded-tl-md bg-le-elevated/80 px-4 py-3 text-sm leading-relaxed text-le-text"
          >
            Hey! I&apos;m your Loose Ends agent. I can scan your Gmail, Calendar, GitHub, and Slack to find things you&apos;ve dropped. Just say the word.
          </motion.div>
        </div>

        <AnimatePresence mode="popLayout">
          {messages.map((message) => {
            const isUser = message.role === "user";
            return (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: [0.25, 1, 0.5, 1] }}
                className={`flex items-start gap-3 ${isUser ? "flex-row-reverse" : ""}`}
              >
                {!isUser && <AgentAvatar />}
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    isUser
                      ? "rounded-tr-md bg-le-accent/10 border border-le-accent/20 text-le-text"
                      : "rounded-tl-md bg-le-elevated/80 text-le-text"
                  }`}
                >
                  {message.parts.map((part, i) => {
                    if (part.type === "text") {
                      if (isUser) {
                        return (
                          <span key={i} className="whitespace-pre-wrap">
                            {part.text}
                          </span>
                        );
                      }
                      return (
                        <div
                          key={i}
                          className="prose prose-invert prose-sm max-w-none"
                        >
                          <ReactMarkdown>{part.text}</ReactMarkdown>
                        </div>
                      );
                    }
                    if (part.type === "dynamic-tool") {
                      // Suggestion cards
                      if (part.toolName === "suggestAction") {
                        if (part.state === "output-available" && isSuggestion(part.output)) {
                          return (
                            <SuggestionCard
                              key={i}
                              data={part.output}
                              disabled={isLoading}
                              onAccept={(msg) => {
                                sendMessage({ text: msg });
                              }}
                              onDismiss={() => {}}
                            />
                          );
                        }
                        if (part.state !== "output-available") {
                          return (
                            <div key={i} className="my-1 flex items-center gap-2 text-xs text-le-muted/60">
                              <span className="relative flex h-3 w-3 items-center justify-center">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-le-accent opacity-30" />
                                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-le-accent" />
                              </span>
                              Thinking of a suggestion...
                            </div>
                          );
                        }
                        return null;
                      }

                      // saveMemory
                      if (part.toolName === "saveMemory") {
                        if (part.state === "output-available") {
                          const out = part.output as { message?: string; error?: string } | undefined;
                          return (
                            <div key={i} className="my-1 flex items-center gap-2 text-xs text-le-accent/70">
                              <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 shrink-0">
                                <path d="M10 2a6 6 0 00-6 6c0 2.04 1.02 3.84 2.57 4.93.19.13.33.33.38.57l.43 2a.5.5 0 00.49.4h4.26a.5.5 0 00.49-.4l.43-2c.05-.24.19-.44.38-.57A5.99 5.99 0 0016 8a6 6 0 00-6-6z" />
                              </svg>
                              {out?.message || "Memory saved"}
                            </div>
                          );
                        }
                        return null;
                      }

                      // All other tools (scan, action, etc.)
                      const label =
                        TOOL_LABELS[part.toolName] ?? part.toolName;
                      const isDone = part.state === "output-available";
                      const isCIBATool = CIBA_TOOLS.has(part.toolName);
                      const result = isDone
                        ? parseToolOutput(part.output)
                        : null;
                      // Check for CIBA denial in result
                      const cibaResult = isDone && !result ? (part.output as { denied?: boolean; error?: string } | undefined) : null;
                      const isDenied = cibaResult?.denied === true;
                      const hasError = result?.error || isDenied;
                      const itemCount = result?.looseEnds?.length ?? 0;

                      return (
                        <div key={i}>
                          <span
                            className={`my-1 flex items-center gap-2 text-xs font-medium ${
                              hasError
                                ? "text-le-red"
                                : isDone
                                  ? "text-le-green"
                                  : isCIBATool
                                    ? "text-amber-400"
                                    : "text-le-yellow"
                            }`}
                          >
                            {isDone ? (
                              hasError ? (
                                <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 16 16" fill="currentColor">
                                  <path fillRule="evenodd" d="M8 15A7 7 0 108 1a7 7 0 000 14zM7.25 5a.75.75 0 011.5 0v3a.75.75 0 01-1.5 0V5zm.75 6.75a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
                                </svg>
                              ) : (
                                <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 16 16" fill="none">
                                  <path d="M3 8.5l3.5 3.5L13 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )
                            ) : isCIBATool ? (
                              /* CIBA pending — phone approval indicator */
                              <span className="relative flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-40" />
                                <svg viewBox="0 0 16 16" fill="currentColor" className="relative h-3 w-3">
                                  <path fillRule="evenodd" d="M8 1a3.5 3.5 0 00-3.5 3.5V8H4a2 2 0 00-2 2v4a2 2 0 002 2h8a2 2 0 002-2v-4a2 2 0 00-2-2h-.5V4.5A3.5 3.5 0 008 1zm2 7V4.5a2 2 0 10-4 0V8h4z" clipRule="evenodd" />
                                </svg>
                              </span>
                            ) : (
                              <span className="relative flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-le-yellow opacity-40" />
                                <span className="relative inline-flex h-2 w-2 rounded-full bg-le-yellow" />
                              </span>
                            )}
                            {!isDone
                              ? isCIBATool
                                ? `${label} — approve on your phone`
                                : `${label}...`
                              : isDenied
                                ? `${label}: authorization required`
                                : hasError
                                  ? `${label}: not connected`
                                  : result
                                    ? `${label}: found ${itemCount} item${itemCount === 1 ? "" : "s"}`
                                    : `${label}: done`}
                          </span>
                          {result && !hasError && (
                            <ToolResultCard items={result.looseEnds} />
                          )}
                          {isDenied && (
                            <p className="my-1 text-xs italic text-amber-400/70">
                              {cibaResult?.error || "Approve this action on your phone via Auth0 Guardian."}
                            </p>
                          )}
                          {hasError && !isDenied && (
                            <p className="my-1 text-xs italic text-le-muted">
                              {result?.error}
                            </p>
                          )}
                        </div>
                      );
                    }
                    return null;
                  })}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Loading indicator */}
        {isLoading &&
          (messages.length === 0 ||
            messages[messages.length - 1]?.role === "user") && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-3"
            >
              <AgentAvatar />
              <div className="rounded-2xl rounded-tl-md bg-le-elevated/80 px-4 py-3">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-le-muted/60 animate-pulse" />
                  <span className="h-1.5 w-1.5 rounded-full bg-le-muted/60 animate-pulse" style={{ animationDelay: "150ms" }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-le-muted/60 animate-pulse" style={{ animationDelay: "300ms" }} />
                </span>
              </div>
            </motion.div>
          )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-3 mt-2 flex items-center gap-2 rounded-lg border border-le-red/30 bg-le-red/10 px-4 py-2 text-xs text-le-red">
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5 shrink-0">
            <path fillRule="evenodd" d="M8 15A7 7 0 108 1a7 7 0 000 14zM7.25 5a.75.75 0 011.5 0v3a.75.75 0 01-1.5 0V5zm.75 6.75a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
          </svg>
          <span>Something went wrong. Please try again.</span>
        </div>
      )}

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="flex items-end gap-2 border-t border-le-border/20 bg-le-surface/20 p-3"
      >
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your loose ends..."
          rows={1}
          className="flex-1 resize-none rounded-xl bg-le-void/50 border border-le-border/30 px-4 py-2.5 text-sm text-le-text placeholder:text-le-muted/50 outline-none transition-all duration-150 focus:border-le-accent/40 focus:ring-2 focus:ring-le-accent/10 focus:bg-le-void/70 leading-relaxed"
          disabled={isLoading}
        />
        {isLoading ? (
          <button
            type="button"
            onClick={() => stop()}
            className="flex items-center justify-center h-10 w-10 shrink-0 rounded-xl bg-le-red/15 border border-le-red/30 text-le-red transition-all duration-150 hover:bg-le-red/25 active:scale-95"
            aria-label="Stop generating"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
              <rect x="3" y="3" width="10" height="10" rx="1.5" />
            </svg>
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            className="flex items-center justify-center h-10 w-10 shrink-0 rounded-xl bg-le-accent text-white transition-all duration-150 hover:bg-le-accent/90 hover:shadow-[0_0_20px_rgba(232,168,73,0.25)] active:scale-95 disabled:opacity-30 disabled:hover:shadow-none disabled:hover:bg-le-accent"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.289z" />
            </svg>
          </button>
        )}
      </form>
    </div>
  );
}
