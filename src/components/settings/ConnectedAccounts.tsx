"use client";

import { motion } from "framer-motion";

interface AccountCard {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  connectUrl: string;
  color: string;
}

const accounts: AccountCard[] = [
  {
    id: "google",
    name: "Google",
    description:
      "Connect Gmail and Google Calendar to scan for unreplied emails and upcoming meetings.",
    color: "#4285F4",
    icon: (
      <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none">
        <path
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
          fill="#4285F4"
        />
        <path
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          fill="#34A853"
        />
        <path
          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z"
          fill="#FBBC05"
        />
        <path
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          fill="#EA4335"
        />
      </svg>
    ),
    connectUrl: "/auth/connect?connection=google-oauth2&scopes=openid&scopes=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fgmail.readonly&scopes=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fgmail.send&scopes=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcalendar.readonly&scopes=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcalendar.events&returnTo=/settings",
  },
  {
    id: "github",
    name: "GitHub",
    description:
      "Connect GitHub to surface unreviewed pull requests, stale issues, and missed mentions.",
    color: "#f0f0f0",
    icon: (
      <svg viewBox="0 0 24 24" className="w-7 h-7" fill="currentColor">
        <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
      </svg>
    ),
    connectUrl: "/auth/connect?connection=github&scopes=repo&scopes=read%3Auser&returnTo=/settings",
  },
];

export default function ConnectedAccounts() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <h2 className="text-xl font-semibold mb-6">Connected Accounts</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {accounts.map((account, i) => (
          <motion.div
            key={account.id}
            className="glass group rounded-2xl p-6 flex flex-col gap-4 transition-all duration-200 hover:border-le-accent/30 hover:shadow-[0_0_32px_rgba(232,168,73,0.06)]"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + i * 0.1, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-le-elevated">
                {account.icon}
              </div>
              <div>
                <h3 className="text-base font-semibold">{account.name}</h3>
                <span className="text-[11px] text-le-muted">Not connected</span>
              </div>
            </div>
            <p className="text-sm text-le-muted leading-relaxed">
              {account.description}
            </p>
            <a
              href={account.connectUrl}
              className="mt-auto inline-flex items-center justify-center h-10 px-5 rounded-xl bg-le-accent text-le-void text-sm font-semibold transition-all duration-200 hover:scale-[1.02] hover:shadow-[0_0_24px_rgba(232,168,73,0.3)] active:scale-[0.98]"
            >
              Connect {account.name}
            </a>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
