"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

interface AccountCard {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  connectUrl: string;
  color: string;
  connection: string;
}

const accounts: AccountCard[] = [
  {
    id: "google",
    name: "Google",
    description:
      "Connect Gmail and Google Calendar to scan for unreplied emails and upcoming meetings.",
    color: "#4285F4",
    connection: "google-oauth2",
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
    connectUrl:
      "/auth/connect?connection=google-oauth2&scopes=openid&scopes=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fgmail.readonly&scopes=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fgmail.send&scopes=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fgmail.modify&scopes=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcalendar.readonly&scopes=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcalendar.events&returnTo=/settings",
  },
  {
    id: "github",
    name: "GitHub",
    description:
      "Connect GitHub to surface unreviewed pull requests, stale issues, and missed mentions.",
    color: "#f0f0f0",
    connection: "github",
    icon: (
      <svg viewBox="0 0 24 24" className="w-7 h-7" fill="currentColor">
        <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
      </svg>
    ),
    connectUrl:
      "/auth/connect?connection=github&scopes=read:user&scopes=repo&returnTo=/settings",
  },
  {
    id: "slack",
    name: "Slack",
    description:
      "Connect Slack to surface unanswered DMs, missed mentions, and threads you forgot to reply to.",
    color: "#4A154B",
    connection: "sign-in-with-slack",
    icon: (
      <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none">
        <path
          d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z"
          fill="#E01E5A"
        />
        <path
          d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z"
          fill="#36C5F0"
        />
        <path
          d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.27 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.163 0a2.528 2.528 0 0 1 2.523 2.522v6.312z"
          fill="#2EB67D"
        />
        <path
          d="M15.163 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.163 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.27a2.527 2.527 0 0 1-2.52-2.523 2.527 2.527 0 0 1 2.52-2.52h6.315A2.528 2.528 0 0 1 24 15.163a2.528 2.528 0 0 1-2.522 2.523h-6.315z"
          fill="#ECB22E"
        />
      </svg>
    ),
    connectUrl:
      "/auth/connect?connection=sign-in-with-slack&returnTo=/settings",
  },
];

export default function ConnectedAccounts() {
  const searchParams = useSearchParams();
  const [connectedMap, setConnectedMap] = useState<Record<string, boolean>>({});
  const [connectError, setConnectError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  async function fetchStatus() {
    try {
      const res = await fetch("/api/accounts/status");
      if (res.ok) {
        const data = await res.json();
        setConnectedMap(data);
      }
    } catch {
      // Silently fail — will show "not connected" as default
    } finally {
      setLoading(false);
    }
  }

  // Fetch real connection status from server
  useEffect(() => {
    // Check if there was an error from the connect flow
    const errorParam = searchParams.get("error");
    if (errorParam) {
      setConnectError(
        "Connection failed. The service may not be configured for account linking yet. Please try again later."
      );
      const url = new URL(window.location.href);
      url.searchParams.delete("error");
      url.searchParams.delete("error_description");
      window.history.replaceState({}, "", url.toString());
    }

    fetchStatus();
  }, [searchParams]);

  function handleConnect(account: AccountCard) {
    window.location.href = account.connectUrl;
  }

  async function handleDisconnect(account: AccountCard) {
    setDisconnecting(account.id);
    setConnectError(null);
    try {
      const res = await fetch("/api/accounts/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connection: account.connection }),
      });
      const data = await res.json();
      if (data.success) {
        // Refresh connection status
        await fetchStatus();
      } else {
        setConnectError(data.message || "Failed to disconnect. Please try again.");
      }
    } catch {
      setConnectError("Failed to disconnect. Please try again.");
    } finally {
      setDisconnecting(null);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05, duration: 0.25, ease: [0.25, 1, 0.5, 1] }}
    >
      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-le-accent/10 text-le-accent">
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
            <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
          </svg>
        </div>
        <div>
          <h2 className="text-xl font-semibold">Connected Accounts</h2>
          <p className="text-xs text-le-muted mt-0.5">Link your services to start finding loose ends</p>
        </div>
      </div>

      {connectError && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 flex items-center gap-2 rounded-xl border border-le-red/30 bg-le-red/10 px-4 py-3 text-sm text-le-red"
        >
          <svg
            viewBox="0 0 16 16"
            fill="currentColor"
            className="h-4 w-4 shrink-0"
          >
            <path
              fillRule="evenodd"
              d="M8 15A7 7 0 108 1a7 7 0 000 14zM7.25 5a.75.75 0 011.5 0v3a.75.75 0 01-1.5 0V5zm.75 6.75a.75.75 0 100-1.5.75.75 0 000 1.5z"
              clipRule="evenodd"
            />
          </svg>
          <span>{connectError}</span>
          <button
            onClick={() => setConnectError(null)}
            className="ml-auto text-le-red/70 hover:text-le-red transition-colors"
            aria-label="Dismiss"
          >
            <svg
              viewBox="0 0 16 16"
              fill="currentColor"
              className="h-3.5 w-3.5"
            >
              <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
            </svg>
          </button>
        </motion.div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {accounts.map((account, i) => {
          const isConnected = connectedMap[account.id] === true;

          return (
            <motion.div
              key={account.id}
              className="glass group rounded-2xl p-6 flex flex-col gap-4 transition-all duration-150 hover:border-le-accent/30 hover:shadow-[0_0_32px_rgba(232,168,73,0.06)]"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: 0.08 + i * 0.06,
                duration: 0.25,
                ease: [0.25, 1, 0.5, 1],
              }}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-le-elevated">
                  {account.icon}
                </div>
                <div>
                  <h3 className="text-base font-semibold">{account.name}</h3>
                  {loading ? (
                    <span className="text-[11px] text-le-muted">
                      Checking...
                    </span>
                  ) : isConnected ? (
                    <span className="flex items-center gap-1.5 text-[11px] text-le-green">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-le-green" />
                      Connected
                    </span>
                  ) : (
                    <span className="text-[11px] text-le-muted">
                      Not connected
                    </span>
                  )}
                </div>
              </div>
              <p className="text-sm text-le-muted leading-relaxed">
                {account.description}
              </p>
              <div className="mt-auto">
                {isConnected ? (
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => handleConnect(account)}
                      className="text-xs font-medium text-le-muted hover:text-le-text transition-colors"
                    >
                      Reconnect
                    </button>
                    <button
                      onClick={() => handleDisconnect(account)}
                      disabled={disconnecting === account.id}
                      className="text-xs text-le-muted/50 hover:text-le-red transition-colors disabled:opacity-50"
                    >
                      {disconnecting === account.id ? "Removing..." : "Disconnect"}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => handleConnect(account)}
                    className="inline-flex w-full items-center justify-center h-9 rounded-xl bg-le-accent text-le-void text-sm font-semibold transition-all duration-150 hover:scale-[1.01] hover:shadow-[0_0_16px_rgba(232,168,73,0.2)] active:scale-[0.98]"
                  >
                    Connect {account.name}
                  </button>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
