"use client";

import { motion } from "framer-motion";
import type { LooseEnd } from "@/lib/types";
import LooseEndCard from "./LooseEndCard";

export default function LooseEndGrid({
  items,
  isScanning,
  suggestionsLoading,
  actionPending,
  onAction,
}: {
  items: LooseEnd[];
  isScanning: boolean;
  suggestionsLoading: boolean;
  actionPending: Record<string, boolean>;
  onAction: (actionId: string, item: LooseEnd) => void;
}) {
  if (isScanning) {
    return (
      <div className="grid gap-2.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="glass rounded-xl p-4"
          >
            <div className="flex gap-3 animate-pulse" style={{ animationDelay: `${i * 80}ms` }}>
              <div className="h-8 w-8 rounded-lg bg-le-elevated" />
              <div className="flex-1 space-y-2">
                <div className="h-4 rounded bg-le-elevated" style={{ width: `${70 - i * 8}%` }} />
                <div className="h-3 rounded bg-le-elevated/60" style={{ width: `${45 - i * 5}%` }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2 }}
        className="flex flex-col items-center justify-center py-16 text-center"
      >
        <div className="relative mb-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-le-green/8 ring-1 ring-le-green/15">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-7 w-7 text-le-green">
              <path
                fillRule="evenodd"
                d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <span className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full border-2 border-le-surface bg-le-green" />
        </div>
        <h3 className="text-base font-semibold text-le-text">All clear</h3>
        <p className="mt-0.5 text-xs text-le-muted">Nothing needs your attention right now.</p>
      </motion.div>
    );
  }

  return (
    <div className="grid gap-3">
      {items.map((item, index) => (
        <LooseEndCard
          key={item.id}
          item={item}
          index={index}
          suggestionsLoading={suggestionsLoading}
          isPending={actionPending[item.id] || false}
          onAction={(actionId) => onAction(actionId, item)}
        />
      ))}
    </div>
  );
}
