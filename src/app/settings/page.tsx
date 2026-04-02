"use client";

import Nav from "@/components/ui/Nav";
import ConnectedAccounts from "@/components/settings/ConnectedAccounts";
import { motion } from "framer-motion";

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-le-void text-le-text">
      <Nav />

      <main className="max-w-3xl mx-auto px-6 py-16 space-y-16">
        <motion.h1
          className="text-3xl font-bold"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          Settings
        </motion.h1>

        <ConnectedAccounts />

        {/* About / Token Vault */}
        <motion.section
          className="glass rounded-2xl p-8 space-y-4"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
        >
          <h2 className="text-xl font-semibold">About Token Vault</h2>
          <p className="text-sm text-le-muted leading-relaxed">
            Loose Ends uses{" "}
            <span className="text-le-text font-medium">
              Auth0 Token Vault
            </span>{" "}
            to securely store and manage your third-party access tokens. Your
            credentials are encrypted at rest and never exposed to our
            application code. When the agent needs to act on your behalf — such
            as reading Gmail threads or approving a pull request — it requests
            a scoped, short-lived token from the vault at runtime.
          </p>
          <p className="text-sm text-le-muted leading-relaxed">
            You can revoke access to any connected service at any time from this
            page. Disconnecting a service immediately invalidates its stored
            tokens, ensuring no further actions can be taken on your behalf.
          </p>
        </motion.section>
      </main>
    </div>
  );
}
