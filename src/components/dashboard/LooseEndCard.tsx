"use client";

import { motion } from "framer-motion";
import type { LooseEnd } from "@/lib/types";
import Badge from "@/components/ui/Badge";

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

export default function LooseEndCard({
  item,
  index,
  suggestionsLoading,
  isPending,
  onAction,
}: {
  item: LooseEnd;
  index: number;
  suggestionsLoading?: boolean;
  isPending?: boolean;
  onAction?: (actionId: string) => void;
}) {
  const { icon, label } = typeIcons[item.type];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.04, ease: [0.25, 1, 0.5, 1] }}
      className="glass group relative overflow-hidden rounded-xl transition-all duration-150 hover:border-le-accent/30 hover:shadow-[0_0_32px_rgba(232,168,73,0.06)]"
    >
      {/* Urgency color bar */}
      <div
        className={`absolute left-0 top-0 bottom-0 w-[3px] ${URGENCY_BAR[item.urgency] ?? "bg-le-muted"}`}
      />

      <div className="p-4 pl-5">
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
            </div>
          </div>
        </div>

        {/* Action buttons */}
        {item.actions && item.actions.length > 0 && onAction && (
          <div className="mt-3 flex flex-wrap items-center gap-2 pl-0 sm:pl-11">
            {item.actions.map((action) => (
              <button
                key={action.id}
                onClick={() => onAction(action.id)}
                disabled={isPending}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150 active:scale-[0.97] disabled:opacity-50 ${ACTION_STYLES[action.variant]}`}
              >
                {isPending ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-3 w-3 animate-spin rounded-full border border-current/30 border-t-current" />
                    Working...
                  </span>
                ) : (
                  action.label
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
