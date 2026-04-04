"use client";

import { useState, useMemo } from "react";
import { AnimatePresence } from "framer-motion";
import { useScan } from "@/lib/hooks/useScan";
import { useSuggestions } from "@/lib/hooks/useSuggestions";
import type { LooseEnd, JunkEmail } from "@/lib/types";
import DashboardHeader from "./DashboardHeader";
import ServiceTile from "./ServiceTile";
import ServiceDetail from "./ServiceDetail";
import AgentInsight from "./AgentInsight";
import ChatDrawer from "./ChatDrawer";

type ServiceType = "email" | "github" | "calendar" | "slack";

const SERVICES: ServiceType[] = ["email", "calendar", "github", "slack"];

export default function DashboardShell({ firstName }: { firstName: string }) {
  const { looseEnds, junkEmails, isScanning, errors, services, servicesLoaded, denied, scan, lastScannedAt, removeItem, clearJunk, rescueJunkEmail, autonomousStatus } = useScan();
  const { suggestions, isLoading: suggestionsLoading } = useSuggestions(looseEnds);
  const [selectedService, setSelectedService] = useState<ServiceType | null>(null);
  const [actionPending, setActionPending] = useState<Record<string, boolean>>({});
  const [confirmAction, setConfirmAction] = useState<{ item: LooseEnd; actionId: string } | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  // Group items by service type (memoized to avoid re-filtering every render)
  const byService = useMemo<Record<ServiceType, LooseEnd[]>>(() => ({
    email: looseEnds.filter((le) => le.type === "email"),
    calendar: looseEnds.filter((le) => le.type === "calendar"),
    github: looseEnds.filter((le) => le.type === "github"),
    slack: looseEnds.filter((le) => le.type === "slack"),
  }), [looseEnds]);

  const connectionMap = useMemo<Record<ServiceType, boolean>>(() => ({
    email: services.google || false,
    calendar: services.google || false,
    github: services.github || false,
    slack: services.slack || false,
  }), [services]);

  const deniedMap = useMemo<Record<ServiceType, boolean>>(() => ({
    email: denied.includes("gmail"),
    calendar: denied.includes("calendar"),
    github: denied.includes("github"),
    slack: denied.includes("slack"),
  }), [denied]);

  // Enrich with suggestions
  function enrichItems(items: LooseEnd[]): LooseEnd[] {
    return items.map((le) => ({
      ...le,
      aiSuggestion: suggestions[le.id] || le.aiSuggestion || null,
    }));
  }

  async function handleTrash(item: LooseEnd) {
    const messageId = item.meta?.messageId || item.id.replace("gmail-", "");
    setActionPending((prev) => ({ ...prev, [item.id]: true }));
    try {
      const res = await fetch("/api/actions/trash-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId }),
      });
      if (res.ok) {
        removeItem(item.id);
      } else if (res.status === 403) {
        setPermissionError("Permission denied: enable Gmail Delete in Settings > Agent Permissions.");
      } else {
        console.error("Failed to trash email");
      }
    } catch (err) {
      console.error("Trash action failed:", err);
    } finally {
      setActionPending((prev) => ({ ...prev, [item.id]: false }));
    }
  }

  async function handleBulkTrash() {
    const messageIds = junkEmails.map((j: JunkEmail) => j.messageId);
    const res = await fetch("/api/actions/bulk-trash", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageIds }),
    });
    if (res.ok) {
      clearJunk();
    } else if (res.status === 403) {
      setPermissionError("Permission denied: enable Gmail Delete in Settings > Agent Permissions.");
    } else {
      console.error("Failed to bulk trash emails");
    }
  }

  function handleAction(actionId: string, item: LooseEnd) {
    if (actionId === "open" && item.deepLink) {
      window.open(item.deepLink, "_blank");
      return;
    }

    if (actionId === "trash" && item.type === "email") {
      handleTrash(item);
      return;
    }

    // Show inline confirmation sheet instead of prompt()
    if (actionId === "reply" || actionId === "comment") {
      setConfirmAction({ item, actionId });
      return;
    }
  }

  async function handleConfirm(payload: { body: string }) {
    if (!confirmAction) return;
    const { item, actionId } = confirmAction;

    setActionPending((prev) => ({ ...prev, [item.id]: true }));
    try {
      if (actionId === "reply" && item.type === "email") {
        const res = await fetch("/api/actions/reply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            threadId: item.meta?.threadId,
            to: item.meta?.from || item.source,
            subject: item.meta?.subject || item.title,
            body: payload.body,
            messageId: item.meta?.rfcMessageId,
          }),
        });
        if (res.status === 403) {
          setPermissionError("Permission denied: enable Gmail Reply in Settings > Agent Permissions.");
        } else if (!res.ok) {
          console.error("Failed to create draft");
        }
      } else if (actionId === "reply" && item.type === "slack") {
        const res = await fetch("/api/actions/slack-reply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channel: item.meta?.channel,
            text: payload.body,
            threadTs: item.meta?.ts,
          }),
        });
        if (res.status === 403) {
          setPermissionError("Permission denied: enable Slack Send in Settings > Agent Permissions.");
        } else if (!res.ok) {
          console.error("Failed to send Slack message");
        }
      } else if (actionId === "comment" && item.type === "github") {
        const res = await fetch("/api/actions/github-comment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            owner: item.meta?.owner,
            repo: item.meta?.repo,
            number: item.meta?.number,
            body: payload.body,
          }),
        });
        if (res.status === 403) {
          setPermissionError("Permission denied: enable GitHub Comment in Settings > Agent Permissions.");
        } else if (!res.ok) {
          console.error("Failed to post comment");
        }
      }
    } catch (err) {
      console.error("Action failed:", err);
    } finally {
      setActionPending((prev) => ({ ...prev, [item.id]: false }));
      setConfirmAction(null);
    }
  }

  function handleCancelConfirm() {
    setConfirmAction(null);
  }

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col px-6 py-6">
      <DashboardHeader
        firstName={firstName}
        onScan={scan}
        isScanning={isScanning}
        lastScannedAt={lastScannedAt}
        totalItems={looseEnds.length}
        urgentCount={looseEnds.filter((le) => le.urgency === "red").length}
      />

      <div className="mt-6 min-h-0 flex-1 overflow-y-auto pr-1">
        <AnimatePresence mode="wait">
          {selectedService === null ? (
            /* === HUB VIEW: Service tiles === */
            <div key="hub" className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                {SERVICES.map((svc, i) => (
                  <ServiceTile
                    key={svc}
                    type={svc}
                    items={byService[svc]}
                    connected={servicesLoaded ? connectionMap[svc] : true}
                    permissionDenied={deniedMap[svc]}
                    isScanning={isScanning}
                    index={i}
                    junkCount={svc === "email" ? junkEmails.length : undefined}
                    autonomousStatus={svc === "email" ? autonomousStatus : undefined}
                    onClick={() => {
                      if (connectionMap[svc] && (byService[svc].length > 0 || (svc === "email" && junkEmails.length > 0))) {
                        setSelectedService(svc);
                      }
                    }}
                    onScanService={() => scan(svc)}
                  />
                ))}
              </div>
              <AgentInsight />
            </div>
          ) : (
            /* === DETAIL VIEW: Service items === */
            <ServiceDetail
              key={selectedService}
              type={selectedService}
              items={enrichItems(byService[selectedService])}
              suggestionsLoading={suggestionsLoading}
              actionPending={actionPending}
              onAction={handleAction}
              onBack={() => { setSelectedService(null); setConfirmAction(null); }}
              confirmAction={confirmAction}
              onConfirm={handleConfirm}
              onCancelConfirm={handleCancelConfirm}
              junkEmails={selectedService === "email" ? junkEmails : undefined}
              onCleanup={selectedService === "email" ? handleBulkTrash : undefined}
              onRescue={selectedService === "email" ? rescueJunkEmail : undefined}
            />
          )}
        </AnimatePresence>

        {permissionError && (
          <div className="mt-4 flex items-center justify-between rounded-xl border border-le-yellow/30 bg-le-yellow/5 px-4 py-3 text-xs text-le-yellow">
            <div className="flex items-center gap-2">
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0">
                <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
              </svg>
              <span>{permissionError}</span>
            </div>
            <button
              onClick={() => setPermissionError(null)}
              className="ml-3 shrink-0 text-le-yellow/60 hover:text-le-yellow"
            >
              <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                <path d="M5.28 4.22a.75.75 0 00-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 101.06 1.06L8 9.06l2.72 2.72a.75.75 0 101.06-1.06L9.06 8l2.72-2.72a.75.75 0 00-1.06-1.06L8 6.94 5.28 4.22z" />
              </svg>
            </button>
          </div>
        )}

        {Object.keys(errors).length > 0 && (
          <div className="mt-4 rounded-xl border border-le-red/20 bg-le-red/5 px-4 py-3 text-xs text-le-red">
            {Object.entries(errors).map(([k, v]) => (
              <p key={k}>Failed to scan {k}: {v}</p>
            ))}
          </div>
        )}

      </div>

      {/* Chat drawer at bottom */}
      <ChatDrawer />
    </div>
  );
}
