"use client";

import { motion } from "framer-motion";
import type { LooseEnd } from "@/lib/types";

export default function ThreatLevel({
  items,
}: {
  items: LooseEnd[];
}) {
  const red = items.filter((i) => i.urgency === "red").length;
  const yellow = items.filter((i) => i.urgency === "yellow").length;
  const green = items.filter((i) => i.urgency === "green").length;
  const total = items.length;
  const max = Math.max(red, yellow, green, 1);

  const bars = [
    { label: "Urgent", count: red, color: "bg-le-red", delay: 0 },
    { label: "Needs Attention", count: yellow, color: "bg-le-yellow", delay: 0.1 },
    { label: "Low Priority", count: green, color: "bg-le-green", delay: 0.2 },
  ];

  return (
    <div className="glass rounded-2xl p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-le-muted">
        Priority Pulse
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

      <div className="mt-3 flex items-center gap-2 border-t border-le-border/30 pt-3">
        <span className="text-[11px] text-le-muted">Total</span>
        <span className="text-sm font-semibold text-le-text tabular-nums">{total}</span>
      </div>
    </div>
  );
}
