"use client";

import { motion } from "framer-motion";
import { useEffect, useState, useCallback } from "react";

interface GmailPermissions {
  can_read: boolean;
  can_reply: boolean;
  can_delete: boolean;
}

interface CalendarPermissions {
  can_read: boolean;
  can_create: boolean;
  can_delete: boolean;
}

interface GitHubPermissions {
  can_read: boolean;
  can_comment: boolean;
  can_approve: boolean;
}

interface SlackPermissions {
  can_read: boolean;
  can_send: boolean;
}

interface AgentAutonomy {
  auto_act: boolean;
}

interface UserPermissions {
  gmail: GmailPermissions;
  calendar: CalendarPermissions;
  github: GitHubPermissions;
  slack: SlackPermissions;
  autonomy: AgentAutonomy;
  _fgaMode?: "api" | "local";
}

type ServiceName = "gmail" | "calendar" | "github" | "slack";

interface PermissionToggle {
  key: string;
  label: string;
}

interface ServiceRow {
  id: ServiceName;
  name: string;
  icon: React.ReactNode;
  toggles: PermissionToggle[];
}

const services: ServiceRow[] = [
  {
    id: "gmail",
    name: "Gmail",
    toggles: [
      { key: "can_read", label: "Read" },
      { key: "can_reply", label: "Reply" },
      { key: "can_delete", label: "Delete" },
    ],
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
      </svg>
    ),
  },
  {
    id: "calendar",
    name: "Calendar",
    toggles: [
      { key: "can_read", label: "Read" },
      { key: "can_create", label: "Create" },
      { key: "can_delete", label: "Delete" },
    ],
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-le-muted">
        <path fillRule="evenodd" d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    id: "github",
    name: "GitHub",
    toggles: [
      { key: "can_read", label: "Read" },
      { key: "can_comment", label: "Comment" },
      { key: "can_approve", label: "Approve" },
    ],
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
        <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
      </svg>
    ),
  },
  {
    id: "slack",
    name: "Slack",
    toggles: [
      { key: "can_read", label: "Read" },
      { key: "can_send", label: "Send" },
    ],
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
        <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z" fill="#E01E5A" />
        <path d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z" fill="#36C5F0" />
        <path d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.27 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.163 0a2.528 2.528 0 0 1 2.523 2.522v6.312z" fill="#2EB67D" />
        <path d="M15.163 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.163 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.27a2.527 2.527 0 0 1-2.52-2.523 2.527 2.527 0 0 1 2.52-2.52h6.315A2.528 2.528 0 0 1 24 15.163a2.528 2.528 0 0 1-2.522 2.523h-6.315z" fill="#ECB22E" />
      </svg>
    ),
  },
];

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`
        relative inline-flex h-[22px] w-10 shrink-0 cursor-pointer rounded-full
        transition-colors duration-150
        focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-le-accent
        ${checked ? "bg-le-accent" : "bg-le-elevated"}
      `}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
        className={`
          pointer-events-none inline-block h-4 w-4 rounded-full shadow-sm mt-[3px]
          ${checked ? "bg-le-void ml-[20px]" : "bg-le-muted/60 ml-[3px]"}
        `}
      />
    </button>
  );
}

const defaultPerms: UserPermissions = {
  gmail: { can_read: true, can_reply: false, can_delete: false },
  calendar: { can_read: true, can_create: false, can_delete: false },
  github: { can_read: true, can_comment: false, can_approve: false },
  slack: { can_read: true, can_send: false },
  autonomy: { auto_act: false },
};

export default function AgentPermissions() {
  const [permissions, setPermissions] = useState<UserPermissions>(defaultPerms);
  const [fgaMode, setFgaMode] = useState<"api" | "local" | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchPermissions = useCallback(async () => {
    try {
      const res = await fetch("/api/permissions");
      if (res.ok) {
        const data: UserPermissions = await res.json();
        if (data._fgaMode) {
          setFgaMode(data._fgaMode);
        }
        setPermissions(data);
      }
    } catch {
      // Silently fail — defaults to read-only
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  async function handleToggle(
    service: ServiceName,
    action: string,
    value: boolean
  ) {
    setPermissions((prev) => ({
      ...prev,
      [service]: { ...prev[service], [action]: value },
    }));

    try {
      const res = await fetch("/api/permissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [service]: { [action]: value } }),
      });
      if (res.ok) {
        const updated: UserPermissions = await res.json();
        setPermissions(updated);
      }
    } catch {
      fetchPermissions();
    }
  }

  return (
    <motion.section
      className="glass rounded-2xl p-8"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1, duration: 0.25, ease: [0.25, 1, 0.5, 1] }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-le-accent/10 text-le-accent">
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
            <path fillRule="evenodd" d="M10 2a1 1 0 00-1 1v1.323l-3.954 1.582-.16-.08a1 1 0 00-1.205.273l-.91 1.093A1 1 0 003 8.191v3.618a1 1 0 00.77 1l.91.227a1 1 0 001.205.273l.16-.08L10 14.81V16.132a1 1 0 002 0V14.81l3.954-1.582.16.08a1 1 0 001.205-.273l.91-1.093A1 1 0 0018 11.81V8.19a1 1 0 00-.77-1l-.91-.227a1 1 0 00-1.205-.273l-.16.08L11 5.188V3a1 1 0 00-1-1zM8 10a2 2 0 114 0 2 2 0 01-4 0z" clipRule="evenodd" />
          </svg>
        </div>
        <div>
          <h2 className="text-xl font-semibold">Agent Permissions</h2>
          <p className="text-xs text-le-muted mt-0.5">
            Control what the AI agent can do with each service
          </p>
        </div>
      </div>

      {/* Permissions table */}
      {loading ? (
        <div className="space-y-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-4 animate-pulse">
              <div className="h-9 w-9 rounded-lg bg-le-elevated" />
              <div className="h-4 w-16 rounded bg-le-elevated" />
              <div className="ml-auto flex gap-6">
                <div className="h-5 w-10 rounded-full bg-le-elevated" />
                <div className="h-5 w-10 rounded-full bg-le-elevated" />
                <div className="h-5 w-10 rounded-full bg-le-elevated" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="divide-y divide-le-border/30">
          {services.map((svc, i) => {
            const svcPerms = permissions[svc.id] as unknown as Record<string, boolean>;

            return (
              <motion.div
                key={svc.id}
                className="flex items-center gap-4 py-4 first:pt-0 last:pb-0"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.12 + i * 0.04, duration: 0.2 }}
              >
                {/* Service icon + name */}
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-le-elevated">
                  {svc.icon}
                </div>
                <span className="text-sm font-medium text-le-text w-20">{svc.name}</span>

                {/* Toggles row */}
                <div className="ml-auto flex items-center gap-5">
                  {svc.toggles.map((toggle) => {
                    const isOn = svcPerms[toggle.key] ?? true;
                    return (
                      <div key={toggle.key} className="flex items-center gap-2">
                        <Toggle
                          checked={isOn}
                          onChange={(v) => handleToggle(svc.id, toggle.key, v)}
                          label={`${svc.name} ${toggle.label}`}
                        />
                        <span className={`text-xs w-14 ${isOn ? "text-le-text" : "text-le-muted/50"}`}>
                          {toggle.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Agent Autonomy — separate from capability permissions */}
      <div className="mt-6 pt-5 border-t border-le-border/20">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-le-text">Agent Autonomy</h3>
            <p className="text-[11px] text-le-muted mt-0.5">Let the agent act on its own — no per-action approval needed</p>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-xl bg-le-void/40 border border-le-border/15 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-le-elevated">
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-le-muted">
                <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <span className="text-xs font-medium text-le-text">Auto-act on suggestions</span>
              <p className="text-[10px] text-le-muted/60 mt-0.5">Let the agent execute low-risk suggestions automatically</p>
            </div>
          </div>
          <Toggle
            checked={permissions.autonomy?.auto_act ?? false}
            onChange={(v) => handleToggle("autonomy" as ServiceName, "auto_act", v)}
            label="Auto-act on suggestions"
          />
        </div>

        {permissions.autonomy?.auto_act && (
          <p className="mt-2 text-[10px] text-amber-400/60 px-1">
            Junk cleanup and other low-risk actions will auto-execute with an 8-second countdown you can cancel.
          </p>
        )}
      </div>

      {/* FGA badge */}
      <div className="flex items-center justify-center mt-6 pt-4 border-t border-le-border/20">
        <span className="inline-flex items-center gap-1.5 text-[11px] text-le-muted/60">
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3">
            <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
          </svg>
          {fgaMode === "api"
            ? "Powered by Auth0 FGA"
            : "Auth0 FGA (local store)"}
        </span>
        {fgaMode === "api" && (
          <span className="ml-2 inline-flex items-center rounded-full bg-green-500/10 px-1.5 py-0.5 text-[10px] font-medium text-green-400">
            LIVE
          </span>
        )}
      </div>
    </motion.section>
  );
}
