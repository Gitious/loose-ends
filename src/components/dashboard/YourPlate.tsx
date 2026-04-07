"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import type { LooseEnd } from "@/lib/types";

const SERVICE_ICON: Record<string, { color: string; label: string }> = {
  email: { color: "text-red-400", label: "Emails" },
  calendar: { color: "text-blue-400", label: "Meetings" },
  github: { color: "text-orange-400", label: "Reviews" },
  slack: { color: "text-purple-400", label: "Messages" },
};

export default function YourPlate({ items }: { items: LooseEnd[] }) {
  const breakdown = useMemo(() => {
    const byService: Record<string, { total: number; urgent: number }> = {};
    for (const item of items) {
      if (!byService[item.type]) byService[item.type] = { total: 0, urgent: 0 };
      byService[item.type].total++;
      if (item.urgency === "red") byService[item.type].urgent++;
    }
    return Object.entries(byService)
      .map(([type, counts]) => ({
        type,
        ...counts,
        meta: SERVICE_ICON[type] || { color: "text-le-muted", label: type },
      }))
      .sort((a, b) => b.urgent - a.urgent || b.total - a.total);
  }, [items]);

  const totalUrgent = items.filter((i) => i.urgency === "red").length;

  if (items.length === 0) {
    return (
      <div className="glass rounded-2xl p-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-le-muted">
          Your Plate
        </h3>
        <p className="text-xs text-le-muted/50">Nothing on your plate. Scan to check.</p>
      </div>
    );
  }

  return (
    <motion.div
      className="glass rounded-2xl p-4"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1, duration: 0.3, ease: [0.25, 1, 0.5, 1] }}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-le-muted">
          Your Plate
        </h3>
        <span className="text-[10px] font-mono text-le-muted/50">
          {items.length} item{items.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Capacity bar */}
      <div className="mb-3">
        <div className="flex items-center gap-2 mb-1">
          <div className="flex-1 h-1.5 rounded-full bg-le-elevated/60 overflow-hidden">
            <motion.div
              className={`h-full rounded-full ${
                totalUrgent >= 5 ? "bg-le-red" : totalUrgent >= 2 ? "bg-le-yellow" : "bg-le-green"
              }`}
              initial={{ width: 0 }}
              animate={{ width: `${Math.min((items.length / 15) * 100, 100)}%` }}
              transition={{ duration: 0.6, ease: [0.25, 1, 0.5, 1] }}
            />
          </div>
          {totalUrgent > 0 && (
            <span className="text-[10px] font-mono text-le-red">{totalUrgent} urgent</span>
          )}
        </div>
      </div>

      {/* Service breakdown */}
      <div className="space-y-1.5">
        {breakdown.map((svc, i) => (
          <motion.div
            key={svc.type}
            className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 bg-le-void/30"
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15 + i * 0.05, duration: 0.25 }}
          >
            <span className={`text-[11px] font-medium ${svc.meta.color} w-16`}>
              {svc.meta.label}
            </span>
            <div className="flex-1 flex items-center gap-1">
              {svc.urgent > 0 && (
                <span className="inline-flex items-center rounded-md bg-le-red/10 px-1.5 py-0.5 text-[10px] font-mono text-le-red">
                  {svc.urgent}
                </span>
              )}
              {svc.total - svc.urgent > 0 && (
                <span className="inline-flex items-center rounded-md bg-le-elevated/40 px-1.5 py-0.5 text-[10px] font-mono text-le-muted/60">
                  +{svc.total - svc.urgent}
                </span>
              )}
            </div>
            <span className="text-[10px] font-mono text-le-muted/40">{svc.total}</span>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
