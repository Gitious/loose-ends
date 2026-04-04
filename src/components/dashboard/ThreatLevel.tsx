"use client";

import { motion } from "framer-motion";
import type { LooseEnd } from "@/lib/types";

export default function ThreatLevel({
  items,
  junkCount,
}: {
  items: LooseEnd[];
  junkCount: number;
}) {
  const red = items.filter((i) => i.urgency === "red").length;
  const yellow = items.filter((i) => i.urgency === "yellow").length;
  const green = items.filter((i) => i.urgency === "green").length;
  const total = items.length;
  const max = Math.max(red, yellow, green, 1);

  const bars = [
    { label: "Urgent", count: red, color: "bg-le-red", delay: 0 },
    { label: "Attention", count: yellow, color: "bg-le-yellow", delay: 0.1 },
    { label: "Low", count: green, color: "bg-le-green", delay: 0.2 },
  ];

  return (
    <div className="glass rounded-2xl p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-le-muted">
        Threat Level
      </h3>

      <div className="space-y-2.5">
        {bars.map((bar) => (
          <div key={bar.label}>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[11px] text-le-muted">{bar.label}</span>
              <span className="text-[11px] font-medium text-le-text tabular-nums">
                {bar.count}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-le-elevated">
              <motion.div
                className={`h-full rounded-full ${bar.color}`}
                initial={{ width: 0 }}
                animate={{
                  width: bar.count > 0 ? `${Math.max((bar.count / max) * 100, 4)}%` : "0%",
                }}
                transition={{
                  duration: 0.6,
                  delay: bar.delay,
                  ease: [0.25, 1, 0.5, 1],
                }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-le-border/30 pt-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-le-muted">Total</span>
          <span className="text-sm font-semibold text-le-text tabular-nums">{total}</span>
        </div>
        {junkCount > 0 && (
          <div className="flex items-center gap-1.5">
            <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 text-le-accent/60">
              <path
                fillRule="evenodd"
                d="M5 3.25V4H2.75a.75.75 0 000 1.5h.3l.815 8.15A1.5 1.5 0 005.357 15h5.285a1.5 1.5 0 001.493-1.35l.815-8.15h.3a.75.75 0 000-1.5H11V3.25A2.25 2.25 0 008.75 1h-1.5A2.25 2.25 0 005 3.25zm2.25-.75a.75.75 0 00-.75.75V4h3V3.25a.75.75 0 00-.75-.75h-1.5z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-[11px] text-le-accent/70 tabular-nums">{junkCount} junk</span>
          </div>
        )}
      </div>
    </div>
  );
}
