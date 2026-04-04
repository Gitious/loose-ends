"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface PermissionsData {
  [service: string]: Record<string, boolean> | string;
}

interface AuditEntry {
  id: string;
  timestamp: string;
  action: string;
  service: string;
  target?: string;
  details?: string;
  permitted: boolean;
  success: boolean;
}

const TIER_ROWS = [
  {
    label: "Auto",
    color: "text-le-green",
    bg: "bg-le-green/10",
    icon: (
      <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
        <path d="M11.251.068a.5.5 0 01.227.58L9.677 6.5H13a.5.5 0 01.364.843l-8 8.5a.5.5 0 01-.842-.49L6.323 9.5H3a.5.5 0 01-.364-.843l8-8.5a.5.5 0 01.615-.09z" />
      </svg>
    ),
  },
  {
    label: "Confirm",
    color: "text-le-accent",
    bg: "bg-le-accent/10",
    icon: (
      <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
        <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 01.208 1.04l-5 7.5a.75.75 0 01-1.154.114l-3-3a.75.75 0 011.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 011.04-.207z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    label: "Guardian",
    color: "text-blue-400",
    bg: "bg-blue-400/10",
    icon: (
      <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
        <path fillRule="evenodd" d="M8 1a3.5 3.5 0 00-3.5 3.5V7H4a2 2 0 00-2 2v4a2 2 0 002 2h8a2 2 0 002-2V9a2 2 0 00-2-2h-.5V4.5A3.5 3.5 0 008 1zm2 6V4.5a2 2 0 10-4 0V7h4z" clipRule="evenodd" />
      </svg>
    ),
  },
];

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function SecurityPosture() {
  const [enabledCount, setEnabledCount] = useState<number | null>(null);
  const [totalCount, setTotalCount] = useState<number>(11);
  const [lastDenied, setLastDenied] = useState<{ action: string; time: string } | null>(null);
  const [vaultActive, setVaultActive] = useState<boolean | null>(null);

  useEffect(() => {
    // Fetch permissions
    fetch("/api/permissions")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: PermissionsData | null) => {
        if (!data) return;
        let enabled = 0;
        let total = 0;
        for (const [key, val] of Object.entries(data)) {
          if (key.startsWith("_")) continue;
          if (typeof val === "object" && val !== null) {
            for (const v of Object.values(val)) {
              total++;
              if (v === true) enabled++;
            }
          }
        }
        setEnabledCount(enabled);
        setTotalCount(total || 11);
      })
      .catch(() => {});

    // Fetch audit for last denied
    fetch("/api/audit")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { entries: AuditEntry[] } | null) => {
        if (!data?.entries) return;
        const denied = data.entries.find((e) => !e.permitted);
        if (denied) {
          const ageMs = Date.now() - new Date(denied.timestamp).getTime();
          // Only show if within last hour
          if (ageMs < 3600000) {
            setLastDenied({
              action: denied.details || denied.action,
              time: relativeTime(denied.timestamp),
            });
          }
        }
      })
      .catch(() => {});

    // Token vault status
    fetch("/api/accounts/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setVaultActive(data.google || data.github || data.slack);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="glass rounded-2xl p-4">
      {/* Shield + title */}
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-le-elevated">
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5 text-le-accent/80">
            <path
              fillRule="evenodd"
              d="M8 1.247a31.586 31.586 0 00-5.862 1.114.75.75 0 00-.542.636C1.188 6.457 2.25 12.14 8 14.988c5.75-2.847 6.812-8.531 6.404-11.99a.75.75 0 00-.542-.637A31.587 31.587 0 008 1.247z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-le-muted">
          Security Posture
        </h3>
      </div>

      {/* Tier rows */}
      <div className="space-y-1.5">
        {TIER_ROWS.map((tier) => (
          <div
            key={tier.label}
            className="flex items-center gap-2 rounded-lg px-2.5 py-1.5"
          >
            <div className={`flex h-5 w-5 items-center justify-center rounded ${tier.bg} ${tier.color}`}>
              {tier.icon}
            </div>
            <span className={`text-xs font-medium ${tier.color}`}>{tier.label}</span>
          </div>
        ))}
      </div>

      {/* FGA status */}
      <div className="mt-3 space-y-1.5 border-t border-le-border/30 pt-3">
        {enabledCount !== null && (
          <div className="flex items-center gap-2 px-1">
            <span className="text-[11px] text-le-muted">FGA</span>
            <span className="text-[11px] font-medium text-le-text tabular-nums">
              {enabledCount}/{totalCount} enabled
            </span>
          </div>
        )}

        {/* Token Vault */}
        {vaultActive !== null && (
          <div className="flex items-center gap-2 px-1">
            <span className="text-[11px] text-le-muted">Token Vault</span>
            <span className="flex items-center gap-1.5 text-[11px] font-medium">
              <span className={`h-1.5 w-1.5 rounded-full ${vaultActive ? "bg-le-green" : "bg-le-red"}`} />
              <span className={vaultActive ? "text-le-green" : "text-le-red"}>
                {vaultActive ? "Active" : "Inactive"}
              </span>
            </span>
          </div>
        )}

        {/* Last denied */}
        {lastDenied && (
          <div className="mt-1 rounded-lg bg-le-red/5 border border-le-red/15 px-2.5 py-1.5">
            <p className="text-[10px] text-le-red">
              Denied: {lastDenied.action}{" "}
              <span className="text-le-red/50">{lastDenied.time}</span>
            </p>
          </div>
        )}
      </div>

      <div className="mt-2.5 flex justify-end">
        <Link
          href="/settings"
          className="text-[10px] text-le-muted/40 hover:text-le-accent transition-colors"
        >
          Manage permissions
        </Link>
      </div>
    </div>
  );
}
