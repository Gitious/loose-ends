"use client";

import { useChat } from "@ai-sdk/react";
import { useEffect, useRef, useState } from "react";
import type { LooseEnd } from "@/lib/types";

const TOOL_LABELS: Record<string, string> = {
  scanGmail: "Scanning Gmail",
  scanCalendar: "Checking Calendar",
  scanGitHub: "Scanning GitHub",
  draftReply: "Drafting reply",
  createEvent: "Creating event",
};

const URGENCY_DOTS: Record<string, string> = {
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
    <div className="my-2 space-y-2">
      {items.map((item) => (
        <div
          key={item.id}
          className="rounded-lg border border-le-border/40 bg-le-void/40 px-3 py-2"
        >
          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-2 w-2 shrink-0 rounded-full ${URGENCY_DOTS[item.urgency] ?? "bg-le-muted"}`}
            />
            <span className="truncate text-xs font-medium text-le-text">
              {item.title}
            </span>
            <span className="ml-auto shrink-0 text-[10px] text-le-muted">
              {item.age}
            </span>
          </div>
          <p className="mt-1 text-xs text-le-muted">{item.description}</p>
        </div>
      ))}
    </div>
  );
}

function parseToolOutput(output: unknown): LooseEnd[] | null {
  if (Array.isArray(output)) {
    if (
      output.length === 0 ||
      (output[0] && typeof output[0] === "object" && "title" in output[0])
    ) {
      return output as LooseEnd[];
    }
  }
  return null;
}

export default function ChatPanel() {
  const { messages, sendMessage, status } = useChat();

  const scrollRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");

  const isLoading = status === "submitted" || status === "streaming";

  // Auto-scroll on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
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
    <div className="glass flex h-full flex-col rounded-2xl">
      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Welcome message */}
        <div className="flex justify-start">
          <div className="max-w-[80%] rounded-xl rounded-tl-sm bg-le-elevated px-4 py-3 text-sm text-le-text">
            {WELCOME_TEXT}
          </div>
        </div>

        {messages.map((message) => {
          const isUser = message.role === "user";
          return (
            <div
              key={message.id}
              className={`flex ${isUser ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-xl px-4 py-3 text-sm ${
                  isUser
                    ? "rounded-tr-sm bg-le-accent/15 text-le-text"
                    : "rounded-tl-sm bg-le-elevated text-le-text"
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
                          className={`my-1 flex items-center gap-1.5 text-xs ${
                            isDone ? "text-le-green" : "text-le-yellow"
                          }`}
                        >
                          {isDone ? (
                            <svg
                              className="h-3 w-3 shrink-0"
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
                            <span className="relative flex h-3 w-3 shrink-0">
                              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-le-yellow opacity-50" />
                              <span className="relative inline-flex h-3 w-3 rounded-full bg-le-yellow" />
                            </span>
                          )}
                          {isDone
                            ? `${label} - found ${looseEnds?.length ?? 0} item${(looseEnds?.length ?? 0) === 1 ? "" : "s"}`
                            : `${label}...`}
                        </span>
                        {looseEnds && <ToolResultCard items={looseEnds} />}
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            </div>
          );
        })}

        {/* Loading indicator */}
        {isLoading &&
          (messages.length === 0 ||
            messages[messages.length - 1]?.role === "user") && (
            <div className="flex justify-start">
              <div className="max-w-[80%] rounded-xl rounded-tl-sm bg-le-elevated px-4 py-3">
                <span className="inline-flex items-center gap-1.5 text-le-muted">
                  <span className="h-2 w-2 rounded-full bg-le-muted/60 animate-pulse" />
                  <span
                    className="h-2 w-2 rounded-full bg-le-muted/60 animate-pulse"
                    style={{ animationDelay: "150ms" }}
                  />
                  <span
                    className="h-2 w-2 rounded-full bg-le-muted/60 animate-pulse"
                    style={{ animationDelay: "300ms" }}
                  />
                </span>
              </div>
            </div>
          )}
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 border-t border-le-border/40 p-3"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your loose ends..."
          className="flex-1 rounded-lg bg-le-void/60 px-4 py-2.5 text-sm text-le-text placeholder:text-le-muted/60 outline-none focus:ring-1 focus:ring-le-accent/40"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="rounded-lg bg-le-accent px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}
