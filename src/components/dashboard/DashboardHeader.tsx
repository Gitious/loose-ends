"use client";

import { motion } from "framer-motion";
import Link from "next/link";

const SCOPE_LABELS: Record<string, string> = {
  email: "Gmail",
  calendar: "Calendar",
  github: "GitHub",
  slack: "Slack",
};

export default function DashboardHeader({
  firstName,
  onScan,
  isScanning,
  lastScannedAt,
  totalItems,
  urgentCount,
  scanScope,
}: {
  firstName: string;
  onScan: () => void;
  isScanning: boolean;
  lastScannedAt: Date | null;
  totalItems?: number;
  urgentCount?: number;
  scanScope?: string;
}) {
  const timeAgo = lastScannedAt
    ? `Scanned ${Math.max(0, Math.floor((Date.now() - lastScannedAt.getTime()) / 60000))}m ago`
    : null;

  const scopeLabel = scanScope ? SCOPE_LABELS[scanScope] || scanScope : null;

  // Dynamic headline
  const headline = isScanning
    ? scopeLabel ? `Scanning ${scopeLabel}...` : "Scanning your services..."
    : (urgentCount ?? 0) > 0
      ? `${urgentCount} dropped thread${urgentCount === 1 ? "" : "s"} need${urgentCount === 1 ? "s" : ""} you, ${firstName}`
      : (totalItems ?? 0) > 0
        ? `${totalItems} loose end${totalItems === 1 ? "" : "s"} found, ${firstName}`
        : `All clear, ${firstName}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }}
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl tracking-tight">
            {headline}
          </h1>
          <p className="mt-1 text-sm text-le-muted">
            {isScanning
              ? scopeLabel ? `Checking ${scopeLabel}...` : "Checking all connected services..."
              : timeAgo || "Let's find everything you've dropped."}
          </p>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <Link
            href="/settings"
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-le-elevated text-le-muted transition-colors hover:text-le-text"
            aria-label="Settings"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path fillRule="evenodd" d="M7.84 1.804A1 1 0 018.82 1h2.36a1 1 0 01.98.804l.331 1.652a6.993 6.993 0 011.929 1.115l1.598-.54a1 1 0 011.186.447l1.18 2.044a1 1 0 01-.205 1.251l-1.267 1.113a7.047 7.047 0 010 2.228l1.267 1.113a1 1 0 01.206 1.25l-1.18 2.045a1 1 0 01-1.187.447l-1.598-.54a6.993 6.993 0 01-1.929 1.115l-.33 1.652a1 1 0 01-.98.804H8.82a1 1 0 01-.98-.804l-.331-1.652a6.993 6.993 0 01-1.929-1.115l-1.598.54a1 1 0 01-1.186-.447l-1.18-2.044a1 1 0 01.205-1.251l1.267-1.114a7.05 7.05 0 010-2.227L1.821 7.773a1 1 0 01-.206-1.25l1.18-2.045a1 1 0 011.187-.447l1.598.54A6.993 6.993 0 017.51 3.456l.33-1.652zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
            </svg>
          </Link>

          <button
            onClick={() => onScan()}
            disabled={isScanning}
            className={`flex items-center gap-2 rounded-xl bg-le-accent px-5 py-2.5 text-sm font-semibold text-le-void transition-all duration-150 hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(232,168,73,0.25)] active:scale-[0.97] disabled:opacity-50 ${!isScanning ? "scan-btn-glow" : ""}`}
          >
            {isScanning ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-le-void/30 border-t-le-void" />
                {scopeLabel ? `Scanning ${scopeLabel}...` : "Scanning..."}
              </>
            ) : (
              <>
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.379 2.341 1 1 0 111.498-1.327 3.5 3.5 0 005.97-1.49 1 1 0 011.911.476zM4.688 8.576a5.5 5.5 0 019.379-2.341 1 1 0 11-1.498 1.327 3.5 3.5 0 00-5.97 1.49 1 1 0 01-1.911-.476z" clipRule="evenodd" />
                </svg>
                {scopeLabel ? `Scan ${scopeLabel}` : "Scan Now"}
              </>
            )}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
