"use client";

import { motion } from "framer-motion";

interface SuggestionData {
  suggestion: true;
  type: string;
  title: string;
  description: string;
  sourceService: string;
  targetService: string;
  tier: "auto" | "confirm" | "ciba";
  acceptLabel?: string;
  actionParams?: Record<string, string>;
}

const SERVICE_META: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  gmail: {
    label: "Gmail",
    color: "text-red-400",
    icon: (
      <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
        <path d="M2 4.5A1.5 1.5 0 013.5 3h9A1.5 1.5 0 0114 4.5v7a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 11.5v-7zm1.5-.2L8 7.9l4.5-3.6V4.5h-9v-.2zM3.5 6l4.15 3.3a.5.5 0 00.7 0L12.5 6v5.5h-9V6z" />
      </svg>
    ),
  },
  calendar: {
    label: "Calendar",
    color: "text-blue-400",
    icon: (
      <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
        <path fillRule="evenodd" d="M4 1.5a.5.5 0 01.5.5v1h7V2a.5.5 0 011 0v1h.5A2 2 0 0115 5v8a2 2 0 01-2 2H3a2 2 0 01-2-2V5a2 2 0 012-2h.5V2a.5.5 0 01.5-.5zM3 7v6h10V7H3z" clipRule="evenodd" />
      </svg>
    ),
  },
  github: {
    label: "GitHub",
    color: "text-gray-400",
    icon: (
      <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
        <path d="M8 .2A8 8 0 005.47 15.79c.4.07.55-.17.55-.38l-.01-1.49c-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.42 7.42 0 014 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48l-.01 2.2c0 .21.15.46.55.38A8.01 8.01 0 008 .2z" />
      </svg>
    ),
  },
  slack: {
    label: "Slack",
    color: "text-purple-400",
    icon: (
      <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
        <path d="M3.5 9a1.5 1.5 0 110-3H5v1.5A1.5 1.5 0 013.5 9zm3-6A1.5 1.5 0 118 4.5V3H6.5zM12.5 7a1.5 1.5 0 110 3H11V8.5A1.5 1.5 0 0112.5 7zm-3 6A1.5 1.5 0 118 11.5V13h1.5zM5 6.5A1.5 1.5 0 016.5 5H8v3H6.5A1.5 1.5 0 015 6.5zM8 8h3v1.5A1.5 1.5 0 019.5 11H8V8zM8 5V3h1.5A1.5 1.5 0 0111 4.5V5H8zM5 11V8H3.5A1.5 1.5 0 002 9.5v.01A1.5 1.5 0 003.5 11H5z" />
      </svg>
    ),
  },
};

const TIER_STYLES = {
  auto: {
    border: "border-le-border/30",
    bg: "bg-le-elevated/40",
    glow: "",
    badge: "bg-le-green/15 text-le-green",
    badgeLabel: "Auto",
  },
  confirm: {
    border: "border-le-accent/40",
    bg: "bg-le-accent/5",
    glow: "",
    badge: "bg-le-accent/15 text-le-accent",
    badgeLabel: "Confirm",
  },
  ciba: {
    border: "border-amber-500/40",
    bg: "bg-amber-500/5",
    glow: "shadow-[0_0_12px_rgba(245,158,11,0.08)]",
    badge: "bg-amber-500/15 text-amber-400",
    badgeLabel: "Phone Approval",
  },
};

export function isSuggestion(output: unknown): output is SuggestionData {
  return (
    typeof output === "object" &&
    output !== null &&
    "suggestion" in output &&
    (output as SuggestionData).suggestion === true
  );
}

interface SuggestionCardProps {
  data: SuggestionData;
  onAccept: (message: string) => void;
  onDismiss?: () => void;
  disabled?: boolean;
}

export default function SuggestionCard({ data, onAccept, onDismiss, disabled }: SuggestionCardProps) {
  const tier = TIER_STYLES[data.tier] || TIER_STYLES.confirm;
  const source = SERVICE_META[data.sourceService];
  const target = SERVICE_META[data.targetService];

  const acceptText = data.acceptLabel || (
    data.tier === "ciba" ? "Approve on Phone" :
    data.tier === "confirm" ? "Yes, Do It" :
    "Go Ahead"
  );

  function handleAccept() {
    const params = data.actionParams
      ? Object.entries(data.actionParams).map(([k, v]) => `${k}: ${v}`).join(", ")
      : "";
    const detail = params ? ` (${params})` : "";
    onAccept(`Yes, proceed with: ${data.title}${detail}`);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, ease: [0.25, 1, 0.5, 1] }}
      className={`my-2 rounded-xl border ${tier.border} ${tier.bg} ${tier.glow} overflow-hidden`}
    >
      {/* Header bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-le-border/15">
        {/* Source → Target flow */}
        <div className="flex items-center gap-1.5 text-[10px]">
          {source && (
            <span className={`flex items-center gap-1 ${source.color}`}>
              {source.icon}
              <span className="font-medium">{source.label}</span>
            </span>
          )}
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-2.5 w-2.5 text-le-muted/40">
            <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {target && (
            <span className={`flex items-center gap-1 ${target.color}`}>
              {target.icon}
              <span className="font-medium">{target.label}</span>
            </span>
          )}
        </div>

        {/* Tier badge */}
        <span className={`ml-auto rounded-full px-1.5 py-0.5 text-[9px] font-mono font-medium ${tier.badge}`}>
          {tier.badgeLabel}
        </span>
      </div>

      {/* Body */}
      <div className="px-3 py-2.5">
        <p className="text-xs font-medium text-le-text leading-snug">{data.title}</p>
        <p className="mt-1 text-[11px] leading-relaxed text-le-muted/70">{data.description}</p>

        {/* Action params preview */}
        {data.actionParams && Object.keys(data.actionParams).length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {Object.entries(data.actionParams).map(([key, val]) => (
              <span
                key={key}
                className="inline-flex items-center gap-1 rounded-md bg-le-void/60 border border-le-border/20 px-1.5 py-0.5 text-[10px] text-le-muted"
              >
                <span className="font-mono text-le-muted/50">{key}</span>
                <span className="text-le-text/70">{val}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 px-3 py-2 border-t border-le-border/10 bg-le-void/30">
        <button
          onClick={handleAccept}
          disabled={disabled}
          className={`rounded-lg px-3 py-1.5 text-[11px] font-medium transition-all active:scale-[0.97] disabled:opacity-40 ${
            data.tier === "ciba"
              ? "bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30"
              : "bg-le-accent/15 text-le-accent hover:bg-le-accent/25 border border-le-accent/30"
          }`}
        >
          {data.tier === "ciba" && (
            <svg viewBox="0 0 16 16" fill="currentColor" className="inline h-3 w-3 mr-1 -mt-px">
              <path fillRule="evenodd" d="M8 1a3.5 3.5 0 00-3.5 3.5V8H4a2 2 0 00-2 2v4a2 2 0 002 2h8a2 2 0 002-2v-4a2 2 0 00-2-2h-.5V4.5A3.5 3.5 0 008 1zm2 7V4.5a2 2 0 10-4 0V8h4z" clipRule="evenodd" />
            </svg>
          )}
          {acceptText}
        </button>
        {onDismiss && (
          <button
            onClick={onDismiss}
            disabled={disabled}
            className="rounded-lg px-3 py-1.5 text-[11px] text-le-muted/60 hover:text-le-muted hover:bg-le-elevated/30 transition-all disabled:opacity-40"
          >
            Dismiss
          </button>
        )}
      </div>
    </motion.div>
  );
}
