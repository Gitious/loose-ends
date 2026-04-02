"use client";

import { useChat } from "@ai-sdk/react";
import { useEffect, useRef } from "react";

const TOOL_LABELS: Record<string, string> = {
  scanGmail: "Scanning Gmail...",
  scanCalendar: "Checking Calendar...",
  scanGithub: "Scanning GitHub...",
  draftReply: "Drafting reply...",
  createEvent: "Creating event...",
};

const WELCOME_TEXT =
  "Hey! I'm your Loose Ends agent. I can scan your Gmail, Calendar, and GitHub to find things you've dropped. Just say the word and I'll start digging.";

export default function ChatPanel() {
  const { messages, sendMessage, status } = useChat();

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
    const input = inputRef.current;
    if (!input) return;
    const text = input.value.trim();
    if (!text || isLoading) return;
    sendMessage({ text });
    input.value = "";
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
                      TOOL_LABELS[part.toolName] ??
                      `Running ${part.toolName}...`;
                    const isDone = part.state === "output-available";
                    return (
                      <span
                        key={i}
                        className={`my-1 flex items-center gap-1.5 text-xs ${
                          isDone ? "text-le-green" : "text-le-yellow"
                        }`}
                      >
                        <span aria-hidden="true">
                          {isDone ? "\u2713" : "\u26A1"}
                        </span>
                        {label}
                      </span>
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
                <span className="inline-flex gap-1 text-le-muted">
                  <span className="animate-pulse">.</span>
                  <span className="animate-pulse" style={{ animationDelay: "150ms" }}>.</span>
                  <span className="animate-pulse" style={{ animationDelay: "300ms" }}>.</span>
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
          ref={inputRef}
          type="text"
          placeholder="Ask about your loose ends..."
          className="flex-1 rounded-lg bg-le-void/60 px-4 py-2.5 text-sm text-le-text placeholder:text-le-muted/60 outline-none focus:ring-1 focus:ring-le-accent/40"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading}
          className="rounded-lg bg-le-accent px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}
