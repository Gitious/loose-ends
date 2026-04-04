"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import type { LooseEnd } from "@/lib/types";

const SERVICE_CONFIG = [
  { key: "google", label: "Google", color: "#4285F4" },
  { key: "github", label: "GitHub", color: "#f0f0f0" },
  { key: "slack", label: "Slack", color: "#4A154B" },
];

export default function DashboardSidebar({
  services,
  looseEnds,
  isScanning,
}: {
  services: Record<string, boolean>;
  looseEnds: LooseEnd[];
  isScanning: boolean;
}) {
  const urgentCount = looseEnds.filter((le) => le.urgency === "red").length;
  const attentionCount = looseEnds.filter((le) => le.urgency === "yellow").length;

  return (
    <motion.aside
      className="hidden w-64 shrink-0 flex-col gap-6 lg:flex"
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Connections */}
      <div className="glass rounded-2xl p-5">
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-le-muted">
          Connections
        </h3>
        <div className="space-y-3">
          {SERVICE_CONFIG.map((svc) => {
            const connected = services[svc.key];
            return (
              <div key={svc.key} className="flex items-center gap-3">
                <span
                  className={`h-2 w-2 rounded-full ${connected ? "bg-le-green" : "bg-le-red"}`}
                />
                <span className="text-sm text-le-text">{svc.label}</span>
                {!connected && (
                  <Link
                    href="/settings"
                    className="ml-auto text-[10px] text-le-accent hover:underline"
                  >
                    Connect
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Stats */}
      <div className="glass rounded-2xl p-5">
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-le-muted">
          Summary
        </h3>
        {isScanning ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-5 animate-pulse rounded bg-le-elevated" />
            ))}
          </div>
        ) : (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-le-muted">Total items</span>
              <span className="font-medium text-le-text">{looseEnds.length}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-le-muted">Urgent</span>
              <span className="font-medium text-le-red">{urgentCount}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-le-muted">Needs attention</span>
              <span className="font-medium text-le-yellow">{attentionCount}</span>
            </div>
          </div>
        )}
      </div>

      {/* Memory link */}
      <Link
        href="/settings"
        className="glass flex items-center gap-3 rounded-2xl p-5 transition-all hover:border-le-accent/30"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-le-accent/10 text-le-accent">
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path d="M10 1a6 6 0 00-3.815 10.631C7.237 12.5 8 13.443 8 14.456v.644a.75.75 0 00.75.75h2.5a.75.75 0 00.75-.75v-.644c0-1.013.762-1.957 1.815-2.825A6 6 0 0010 1zM8.863 17.414a.75.75 0 00-.726.57 2.002 2.002 0 003.726 0 .75.75 0 00-.726-.57H8.863z" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-medium text-le-text">Memory</p>
          <p className="text-[11px] text-le-muted">What I&apos;ve learned</p>
        </div>
      </Link>
    </motion.aside>
  );
}
