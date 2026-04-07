"use client";

import { Suspense } from "react";
import Nav from "@/components/ui/Nav";
import ConnectedAccounts from "@/components/settings/ConnectedAccounts";
import MemoryPanel from "@/components/settings/MemoryPanel";
import AgentPermissions from "@/components/settings/AgentPermissions";
import AuditLog from "@/components/settings/AuditLog";
// BuilderInsights removed — developer content belongs in submission writeup, not in-app
import { motion } from "framer-motion";

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-le-void text-le-text">
      <Nav />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-12 space-y-10 sm:space-y-12">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          <h1 className="font-display text-3xl tracking-tight">Settings</h1>
          <p className="mt-2 text-sm text-le-muted">
            Manage your connected services and account preferences.
          </p>
        </motion.div>

        {/* Connected Accounts */}
        <Suspense fallback={<div className="text-le-muted text-sm">Loading connected accounts...</div>}>
          <ConnectedAccounts />
        </Suspense>

        {/* What I've Learned */}
        <div id="memory">
          <MemoryPanel />
        </div>

        {/* Agent Permissions (FGA) */}
        <AgentPermissions />

        {/* Activity Log (Audit Trail) */}
        <div id="audit">
          <AuditLog />
        </div>

        {/* About / Token Vault */}
        <motion.section
          className="glass rounded-2xl p-8 space-y-4"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-le-accent/10 text-le-accent">
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                <path
                  fillRule="evenodd"
                  d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <h2 className="text-xl font-semibold">About Token Vault</h2>
          </div>
          <p className="text-sm text-le-muted leading-relaxed">
            Loose Ends uses{" "}
            <span className="text-le-text font-medium">
              Auth0 Token Vault
            </span>{" "}
            to securely store and manage your third-party access tokens. Your
            credentials are encrypted at rest and never exposed to our
            application code. When the agent needs to act on your behalf (reading
            Gmail threads, approving a pull request), it requests a scoped,
            short-lived token from the vault at runtime.
          </p>
          <p className="text-sm text-le-muted leading-relaxed">
            You can revoke access to any connected service at any time from this
            page. Disconnecting a service immediately invalidates its stored
            tokens, ensuring no further actions can be taken on your behalf.
          </p>
        </motion.section>

        {/* Danger zone */}
        <motion.section
          className="rounded-2xl border border-le-red/20 bg-le-red/5 p-8 space-y-4"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          <h2 className="text-lg font-semibold text-le-red">Danger Zone</h2>
          <p className="text-sm text-le-muted leading-relaxed">
            Disconnect all services and delete your account data. This action
            cannot be undone.
          </p>
          <button className="rounded-lg border border-le-red/30 bg-le-red/10 px-4 py-2 text-sm font-medium text-le-red transition-all duration-150 hover:bg-le-red/20 hover:border-le-red/50 active:scale-[0.98]">
            Delete Account
          </button>
        </motion.section>
      </main>
    </div>
  );
}
