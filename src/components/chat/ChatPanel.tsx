"use client";

import { useChat } from "@ai-sdk/react";
import { useInterruptions } from "@auth0/ai-vercel/react";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { LooseEnd } from "@/lib/types";
import { TokenVaultInterruptHandler } from "@/components/TokenVaultInterruptHandler";

const TOOL_LABELS: Record<string, string> = {
  scanGmail: "Scanning Gmail",
  scanCalendar: "Checking Calendar",
  scanGitHub: "Scanning GitHub",
};

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

const WELCOME_TEXT =
  "Hey! I'm your Loose Ends agent. I can scan your Gmail, Calendar, and GitHub to find things you've dropped. Just say the word and I'll start digging.";

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

function parseToolOutput(output: unknown): LooseEnd[] | null {
  if (!Array.isArray(output)) return null;
  if (output.length === 0) return [];
  if (output.every(isLooseEnd)) return output;
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

export default function ChatPanel() {
  const chat = useInterruptions((errorHandler) =>
    useChat({
      onError: errorHandler(() => {
        // user-level error handling is done via the error banner below
      }),
    })
  );

  const { messages, sendMessage, status, error, stop } = chat as typeof chat & {
    sendMessage: ReturnType<typeof useChat>["sendMessage"];
    status: ReturnType<typeof useChat>["status"];
    error: ReturnType<typeof useChat>["error"];
    stop: ReturnType<typeof useChat>["stop"];
  };

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [input, setInput] = useState("");

  const isLoading = status === "submitted" || status === "streaming";

  // Auto-scroll on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [messages, status]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;
    sendMessage({ text });
    setInput("");
  }

  return (
    <div className="glass flex h-full flex-col rounded-2xl overflow-hidden">
      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Welcome message */}
        <div className="flex items-start gap-3">
          <AgentAvatar />
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="max-w-[80%] rounded-2xl rounded-tl-md bg-le-elevated/80 px-4 py-3 text-sm leading-relaxed text-le-text"
          >
            {WELCOME_TEXT}
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
                transition={{ duration: 0.3, ease: "easeOut" }}
                className={`flex items-start gap-3 ${isUser ? "flex-row-reverse" : ""}`}
              >
                {!isUser && <AgentAvatar />}
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    isUser
                      ? "rounded-tr-md bg-le-accent/10 border border-le-accent/20 text-le-text"
                      : "rounded-tl-md bg-le-elevated/80 text-le-text"
                  }`}
                >
                  {message.parts.map((part, i) => {
                    if (part.type === "text") {
                      return (
                        <span key={i} className="whitespace-pre-wrap">
                          {part.text}
                        </span>
                      );
                    }
                    if (part.type === "dynamic-tool") {
                      const label =
                        TOOL_LABELS[part.toolName] ?? part.toolName;
                      const isDone = part.state === "output-available";
                      const looseEnds = isDone
                        ? parseToolOutput(part.output)
                        : null;

                      return (
                        <div key={i}>
                          <span
                            className={`my-1 flex items-center gap-2 text-xs font-medium ${
                              isDone ? "text-le-green" : "text-le-yellow"
                            }`}
                          >
                            {isDone ? (
                              <svg
                                className="h-3.5 w-3.5 shrink-0"
                                viewBox="0 0 16 16"
                                fill="none"
                              >
                                <path
                                  d="M3 8.5l3.5 3.5L13 4"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            ) : (
                              <span className="relative flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-le-yellow opacity-40" />
                                <span className="relative inline-flex h-2 w-2 rounded-full bg-le-yellow" />
                              </span>
                            )}
                            {isDone
                              ? `${label} — found ${looseEnds?.length ?? 0} item${(looseEnds?.length ?? 0) === 1 ? "" : "s"}`
                              : `${label}...`}
                          </span>
                          {looseEnds && <ToolResultCard items={looseEnds} />}
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

        {/* TokenVault interrupt handler */}
        <TokenVaultInterruptHandler
          interrupt={chat.toolInterrupt}
          onFinish={() => {
            // Re-send last message to retry after authorization
          }}
        />

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
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-le-muted/60 animate-pulse"
                    style={{ animationDelay: "150ms" }}
                  />
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-le-muted/60 animate-pulse"
                    style={{ animationDelay: "300ms" }}
                  />
                </span>
              </div>
            </motion.div>
          )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-3 mt-2 flex items-center gap-2 rounded-lg border border-le-red/30 bg-le-red/10 px-4 py-2 text-xs text-le-red">
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5 shrink-0">
            <path
              fillRule="evenodd"
              d="M8 15A7 7 0 108 1a7 7 0 000 14zM7.25 5a.75.75 0 011.5 0v3a.75.75 0 01-1.5 0V5zm.75 6.75a.75.75 0 100-1.5.75.75 0 000 1.5z"
              clipRule="evenodd"
            />
          </svg>
          <span>Something went wrong. Please try again.</span>
        </div>
      )}

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-3 border-t border-le-border/30 bg-le-surface/30 p-3"
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your loose ends..."
          className="flex-1 rounded-xl bg-le-void/50 border border-le-border/30 px-4 py-2.5 text-sm text-le-text placeholder:text-le-muted/50 outline-none transition-all duration-150 focus:border-le-accent/40 focus:ring-2 focus:ring-le-accent/10 focus:bg-le-void/70"
          disabled={isLoading}
        />
        {isLoading ? (
          <button
            type="button"
            onClick={() => stop()}
            className="flex items-center justify-center h-10 w-10 rounded-xl bg-le-red/15 border border-le-red/30 text-le-red transition-all duration-150 hover:bg-le-red/25 active:scale-95"
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
            className="flex items-center justify-center h-10 w-10 rounded-xl bg-le-accent text-white transition-all duration-150 hover:bg-le-accent/90 hover:shadow-[0_0_20px_rgba(232,168,73,0.25)] active:scale-95 disabled:opacity-30 disabled:hover:shadow-none disabled:hover:bg-le-accent"
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
