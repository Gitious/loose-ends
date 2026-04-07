import { convertToModelMessages, streamText, UIMessage, tool, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { setAIContext, getAccessTokenFromTokenVault, getAsyncAuthorizationCredentials } from "@auth0/ai-vercel";
import { AuthorizationPendingInterrupt, AsyncAuthorizationInterrupt } from "@auth0/ai/interrupts";
import type { ToolWrapper } from "@auth0/ai-vercel";
import { TokenVaultInterrupt } from "@auth0/ai/interrupts";
import { z } from "zod";
import { auth0 } from "@/lib/auth0";
import { withGoogleConnection, withGitHubConnection, withSlackConnection } from "@/lib/auth0-ai";
import { withCIBA } from "@/lib/ciba";
import { buildMimeMessage } from "@/lib/gmail-mime";
import { loadMemories, appendMemory, deleteMemory } from "@/lib/memory";
import { loadPermissions, defaultPermissions, type UserPermissions, type ServiceName } from "@/lib/fga";
import { loadPlate } from "@/lib/plate";
import { logAction } from "@/lib/audit";

export const maxDuration = 300; // 5 min — allows time for CIBA push approval

// Shared API base URLs
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const GH_API = "https://api.github.com";
const SLACK_API = "https://slack.com/api";

/** Get the authenticated Gmail user's email address. */
async function getGmailSenderEmail(accessToken: string, fallback?: string): Promise<string> {
  if (fallback) return fallback;
  const res = await fetch(`${GMAIL_API}/profile`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return "";
  const profile = await res.json();
  return profile.emailAddress || "";
}

/** Parse "owner/repo" from a GitHub repository_url. */
function parseRepoUrl(repoUrl: string): { owner: string; repo: string; full: string } {
  const full = repoUrl?.split("/repos/")[1] || "";
  const [owner = "", repo = ""] = full.split("/");
  return { owner, repo, full };
}

/** Map display service names to audit log service identifiers. */
function auditServiceId(serviceName: string): string {
  const map: Record<string, string> = {
    Gmail: "gmail",
    "Google Calendar": "google_calendar",
    GitHub: "github",
    Slack: "slack",
  };
  return map[serviceName] || serviceName.toLowerCase().replace(/\s+/g, "_");
}

/**
 * Wraps a Token-Vault-protected tool so that if the vault throws
 * (e.g. user hasn't connected that service), we return a friendly
 * error object instead of crashing the stream.
 *
 * Token Vault interrupts are re-thrown so the AI SDK can surface
 * the authorization popup to the user.
 *
 * Every execution is also audit-logged via logAction.
 */

/**
 * FAIL-CLOSED CIBA guard. Call at the top of every Tier 3 tool execute().
 * If CIBA credentials were not obtained (i.e. the user did not approve via
 * Guardian push), this throws an error and the tool does NOT execute.
 * This is a defense-in-depth check — even if the withCIBA wrapper fails
 * to intercept, the tool itself refuses to run without proof of approval.
 */
function requireCIBAApproval(): void {
  const creds = getAsyncAuthorizationCredentials();
  if (!creds || !creds.accessToken) {
    throw new Error(
      "CIBA authorization required but not obtained. " +
      "Please approve the action on your phone via Auth0 Guardian."
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function safeTool(wrapper: ToolWrapper, baseTool: any, serviceName: string) {
  const wrapped = wrapper(baseTool);
  return {
    ...wrapped,
    execute: async (...args: any[]) => {
      const service = auditServiceId(serviceName);
      // Resolve userId from the session at execution time to avoid a
      // module-level mutable that races across concurrent requests.
      let userId = "anonymous";
      try {
        const session = await auth0.getSession();
        userId = session?.user?.sub || session?.user?.email || "anonymous";
      } catch {}
      try {
        const result = await wrapped.execute(...args);
        // Audit log — successful execution
        const target =
          result?.subject ?? result?.draftId ?? result?.messageId ??
          result?.eventId ?? result?.commentId ?? result?.reviewId ??
          result?.ts ?? undefined;
        const details =
          result?.message ?? result?.error ?? undefined;
        logAction({
          userId,
          action: `${service}.execute`,
          service,
          target: target ? String(target) : undefined,
          details: details ? String(details) : undefined,
          permitted: true,
          success: !result?.error,
        }).catch(() => {}); // fire-and-forget
        return result;
      } catch (err: any) {
        // Let Token Vault interrupts propagate — the UI handles these
        if (TokenVaultInterrupt.isInterrupt(err)) {
          throw err;
        }
        // CIBA: let Auth0 AI SDK handle the async authorization flow.
        // These interrupts MUST propagate so the framework can block/poll
        // for Guardian approval — swallowing them kills the CIBA flow.
        if (err instanceof AuthorizationPendingInterrupt || err instanceof AsyncAuthorizationInterrupt) {
          console.log(`[CIBA] Authorization pending for ${serviceName} — re-throwing for AI SDK`);
          logAction({
            userId,
            action: `${service}.ciba_pending`,
            service,
            details: "CIBA authorization pending — push notification sent",
            permitted: true,
            success: true,
          }).catch(() => {});
          throw err;
        }
        const msg = err?.message ?? String(err);
        const isCIBAError = msg.includes("Guardian") || msg.includes("CIBA") || msg.includes("Action blocked");
        console.error(`[${serviceName}] ${isCIBAError ? "CIBA" : "Token Vault"} error:`, msg);
        logAction({
          userId,
          action: isCIBAError ? `${service}.ciba_denied` : `${service}.execute`,
          service,
          details: `Error: ${msg}`.slice(0, 200),
          permitted: !isCIBAError,
          success: false,
        }).catch(() => {});
        if (isCIBAError) {
          return {
            error: msg,
            denied: true,
          };
        }
        return {
          looseEnds: [],
          error: `${serviceName} is not connected. Please go to Settings and connect your ${serviceName} account.`,
        };
      }
    },
  };
}

// ---------------------------------------------------------------------------
// SCAN TOOLS
// ---------------------------------------------------------------------------

// Gmail scanner — wrapped with Token Vault for Google access
const scanGmail = safeTool(
  withGoogleConnection,
  tool({
    description: "Scan Gmail inbox for unreplied emails. Returns loose ends that need attention.",
    inputSchema: z.object({
      daysBack: z.number().default(14).describe("How many days back to scan"),
    }),
    execute: async ({ daysBack }) => {
      const accessToken = getAccessTokenFromTokenVault();

      try {
        // Get user email
        const profileRes = await fetch(`${GMAIL_API}/profile`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!profileRes.ok) return { looseEnds: [], error: "Could not access Gmail. Please reconnect your Google account." };
        const profile = await profileRes.json();
        const userEmail = profile.emailAddress || "";

        // Search for inbox emails
        const after = Math.floor((Date.now() - daysBack * 86400000) / 1000);
        const searchRes = await fetch(
          `${GMAIL_API}/messages?q=${encodeURIComponent(`in:inbox after:${after}`)}&maxResults=30`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!searchRes.ok) return { looseEnds: [], error: "Gmail search failed" };
        const searchData = await searchRes.json();
        const messages = searchData.messages || [];

        const looseEnds: any[] = [];

        // Check each message thread for replies
        for (const msg of messages.slice(0, 15)) {
          const msgRes = await fetch(
            `${GMAIL_API}/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=List-Unsubscribe&metadataHeaders=Precedence`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          if (!msgRes.ok) continue;
          const msgData = await msgRes.json();

          const headers = msgData.payload?.headers || [];
          const from = headers.find((h: any) => h.name === "From")?.value || "Unknown";
          const subject = headers.find((h: any) => h.name === "Subject")?.value || "(no subject)";
          const date = headers.find((h: any) => h.name === "Date")?.value || "";

          // Skip if from the user themselves
          if (from.includes(userEmail)) continue;

          // Check thread for user's reply
          const threadRes = await fetch(
            `${GMAIL_API}/threads/${msgData.threadId}?format=metadata&metadataHeaders=From`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          if (!threadRes.ok) continue;
          const threadData = await threadRes.json();

          const hasReply = threadData.messages?.some((m: any) =>
            m.payload?.headers?.find((h: any) => h.name === "From")?.value?.includes(userEmail)
          );
          if (hasReply) continue;

          const ageMs = Date.now() - new Date(date).getTime();
          const ageDays = Math.floor(ageMs / 86400000);

          // Compute importance score (inline version of scoreEmailImportance)
          const to = headers.find((h: any) => h.name === "To")?.value || "";
          const cc = headers.find((h: any) => h.name === "Cc")?.value || "";
          const subjectLower = subject.toLowerCase();
          const listUnsub = headers.find((h: any) => h.name === "List-Unsubscribe");
          const precedence = (headers.find((h: any) => h.name === "Precedence")?.value || "").toLowerCase();
          const labels: string[] = msgData.labelIds || [];
          const threadMsgCount = threadData.messages?.length || 1;

          let importanceScore = 50;
          if (labels.includes("CATEGORY_PROMOTIONS")) importanceScore -= 40;
          if (labels.includes("CATEGORY_SOCIAL")) importanceScore -= 30;
          if (labels.includes("CATEGORY_UPDATES")) importanceScore -= 20;
          if (labels.includes("CATEGORY_FORUMS")) importanceScore -= 15;
          if (listUnsub) importanceScore -= 25;
          if (precedence === "bulk" || precedence === "list") importanceScore -= 20;
          if (/noreply|no-reply|donotreply|notifications?@/i.test(from)) importanceScore -= 35;
          if (/urgent|asap|immediately|time.?sensitive/i.test(subjectLower)) importanceScore += 20;
          if (/action.?required|action.?needed|please.?respond|please.?reply/i.test(subjectLower)) importanceScore += 15;
          if (/deadline|due.?date|eod|end.?of.?day|by.?today|by.?tomorrow/i.test(subjectLower)) importanceScore += 15;
          if (/important|critical|high.?priority/i.test(subjectLower)) importanceScore += 15;
          if (/re:|fwd:/i.test(subjectLower)) importanceScore += 5;
          if (to.toLowerCase().includes(userEmail.toLowerCase())) importanceScore += 15;
          if (cc.toLowerCase().includes(userEmail.toLowerCase())) importanceScore -= 10;
          const userDomain = userEmail.split("@")[1];
          const senderDomain = (from.match(/@([^>]+)/)?.[1] || "").toLowerCase();
          if (userDomain && senderDomain === userDomain) importanceScore += 20;
          if (threadMsgCount >= 3) importanceScore += 10;
          if (threadMsgCount >= 6) importanceScore += 10;
          if (labels.includes("IMPORTANT")) importanceScore += 15;
          if (labels.includes("STARRED")) importanceScore += 20;
          importanceScore = Math.max(0, Math.min(100, importanceScore));

          let urgency: "red" | "yellow" | "green";
          if (importanceScore >= 90) {
            urgency = "red";
          } else if (importanceScore >= 80) {
            urgency = ageDays > 1 ? "red" : "yellow";
          } else if (importanceScore >= 65) {
            urgency = ageDays > 3 ? "red" : ageDays > 1 ? "yellow" : "green";
          } else if (importanceScore >= 40) {
            urgency = ageDays > 7 ? "red" : ageDays > 3 ? "yellow" : "green";
          } else {
            urgency = "green";
          }

          looseEnds.push({
            id: `gmail-${msg.id}`,
            type: "email",
            title: subject,
            description: `From ${from.split("<")[0].trim()} · no reply sent`,
            urgency,
            age: ageDays === 0 ? "today" : `${ageDays}d ago`,
            source: from,
            actionLabel: "Draft Reply",
            meta: {
              threadId: msgData.threadId,
              messageId: msg.id,
              importanceScore: String(importanceScore),
            },
          });
        }

        return { looseEnds };
      } catch (err) {
        console.error("Gmail scan error:", err);
        return { looseEnds: [], error: "Failed to scan Gmail" };
      }
    },
  }),
  "Gmail"
);

// Calendar scanner — wrapped with Token Vault for Google access
const scanCalendar = safeTool(
  withGoogleConnection,
  tool({
    description: "Scan Google Calendar for upcoming meetings the user may be unprepared for or has conflicts.",
    inputSchema: z.object({
      hoursAhead: z.number().default(48).describe("How many hours ahead to check"),
    }),
    execute: async ({ hoursAhead }) => {
      const accessToken = getAccessTokenFromTokenVault();

      try {
        const now = new Date();
        const future = new Date(now.getTime() + hoursAhead * 3600000);
        const url = `${CALENDAR_API}/calendars/primary/events?timeMin=${now.toISOString()}&timeMax=${future.toISOString()}&singleEvents=true&orderBy=startTime&maxResults=20`;

        const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
        if (!res.ok) return { looseEnds: [], error: "Could not access Calendar. Please reconnect your Google account." };

        const data = await res.json();
        const events = data.items || [];
        const looseEnds: any[] = [];

        for (let i = 0; i < events.length; i++) {
          const event = events[i];
          if (!event.start?.dateTime) continue;

          const start = new Date(event.start.dateTime);
          const end = new Date(event.end?.dateTime || start);
          const hoursUntil = (start.getTime() - now.getTime()) / 3600000;

          // Check conflicts
          if (i < events.length - 1 && events[i + 1].start?.dateTime) {
            const nextStart = new Date(events[i + 1].start.dateTime);
            if (nextStart < end) {
              looseEnds.push({
                id: `cal-conflict-${event.id}`,
                type: "calendar",
                title: `Conflict: "${event.summary}" overlaps "${events[i + 1].summary}"`,
                description: `Both at ${start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
                urgency: "red",
                age: hoursUntil < 24 ? "today" : "tomorrow",
                source: event.summary || "Untitled",
                actionLabel: "Reschedule",
              });
            }
          }

          // Check unprepared meetings
          const attendees = event.attendees?.length || 0;
          const hasDescription = !!(event.description && event.description.trim().length > 10);
          if (attendees >= 2 && !hasDescription && hoursUntil < 24) {
            looseEnds.push({
              id: `cal-noprep-${event.id}`,
              type: "calendar",
              title: `Unprepared: "${event.summary}"`,
              description: `${attendees} attendees, no agenda · in ${Math.floor(hoursUntil)}h`,
              urgency: hoursUntil < 4 ? "red" : "yellow",
              age: `in ${Math.floor(hoursUntil)}h`,
              source: event.summary || "Untitled",
              actionLabel: "Create Agenda",
            });
          }
        }

        return { looseEnds };
      } catch (err) {
        console.error("Calendar scan error:", err);
        return { looseEnds: [], error: "Failed to scan Calendar" };
      }
    },
  }),
  "Google Calendar"
);

// Slack scanner — wrapped with Token Vault for Slack access
const scanSlack = safeTool(
  withSlackConnection,
  tool({
    description: "Scan Slack for unanswered DMs and mentions the user hasn't responded to.",
    inputSchema: z.object({
      days: z.number().default(7).describe("Number of days to look back"),
    }),
    execute: async ({ days }) => {
      const accessToken = getAccessTokenFromTokenVault();
      const cutoff = Math.floor((Date.now() - days * 86400000) / 1000);

      try {
        // Get user identity
        const authRes = await fetch(`${SLACK_API}/auth.test`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!authRes.ok) return { looseEnds: [], error: "Could not access Slack. Please reconnect your Slack account." };
        const authData = await authRes.json();
        if (!authData.ok) return { looseEnds: [], error: "Slack auth failed. Please reconnect." };
        const userId = authData.user_id;

        const looseEnds: any[] = [];

        // Check DM conversations
        const convRes = await fetch(`${SLACK_API}/conversations.list?types=im&limit=20`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (convRes.ok) {
          const convData = await convRes.json();
          for (const ch of (convData.channels ?? []).slice(0, 10)) {
            try {
              const histRes = await fetch(
                `${SLACK_API}/conversations.history?channel=${ch.id}&oldest=${cutoff}&limit=5`,
                { headers: { Authorization: `Bearer ${accessToken}` } }
              );
              if (!histRes.ok) continue;
              const histData = await histRes.json();
              const msgs = histData.messages ?? [];
              if (msgs.length === 0) continue;

              const latest = msgs[0];
              if (latest.subtype || latest.user === userId) continue;

              const ts = parseFloat(latest.ts ?? "0");
              const ageDays = Math.floor((Date.now() / 1000 - ts) / 86400);
              const preview = (latest.text ?? "").slice(0, 80);

              // Get sender name
              let senderName = "Someone";
              try {
                const uRes = await fetch(`${SLACK_API}/users.info?user=${latest.user}`, {
                  headers: { Authorization: `Bearer ${accessToken}` },
                });
                if (uRes.ok) {
                  const uData = await uRes.json();
                  senderName = uData.user?.profile?.display_name || uData.user?.real_name || uData.user?.name || "Someone";
                }
              } catch {}

              looseEnds.push({
                id: `slack-dm-${ch.id}`,
                type: "slack",
                title: `Unanswered DM from ${senderName}`,
                description: preview,
                urgency: ageDays > 7 ? "red" : ageDays > 3 ? "yellow" : "green",
                age: ageDays === 0 ? "today" : `${ageDays}d ago`,
                source: "Slack",
                actionLabel: "Reply",
              });
            } catch { continue; }
          }
        }

        return { looseEnds };
      } catch (err) {
        console.error("Slack scan error:", err);
        return { looseEnds: [], error: "Failed to scan Slack" };
      }
    },
  }),
  "Slack"
);

// GitHub scanner — wrapped with Token Vault for GitHub access
const scanGitHub = safeTool(
  withGitHubConnection,
  tool({
    description: "Scan GitHub for PR reviews assigned to the user that haven't been reviewed, and stale issues.",
    inputSchema: z.object({
      daysStale: z.number().default(7).describe("Number of days without activity to consider stale"),
    }),
    execute: async ({ daysStale }) => {
      const accessToken = getAccessTokenFromTokenVault();
      const headers = { Authorization: `Bearer ${accessToken}`, Accept: "application/vnd.github.v3+json" };

      try {
        // Get current user
        const userRes = await fetch(`${GH_API}/user`, { headers });
        if (!userRes.ok) return { looseEnds: [], error: "Could not access GitHub. Please reconnect your GitHub account." };
        const user = await userRes.json();

        const looseEnds: any[] = [];

        // Find PRs where user is requested reviewer
        const prRes = await fetch(
          `${GH_API}/search/issues?q=type:pr+state:open+review-requested:${user.login}&sort=created&order=desc&per_page=10`,
          { headers }
        );
        if (prRes.ok) {
          const prData = await prRes.json();
          for (const pr of prData.items || []) {
            const ageDays = Math.floor((Date.now() - new Date(pr.created_at).getTime()) / 86400000);
            const { owner, repo, full: repoFullName } = parseRepoUrl(pr.repository_url);
            looseEnds.push({
              id: `gh-pr-${pr.number}`,
              type: "github",
              title: `Review requested: "${pr.title}"`,
              description: `${repoFullName} #${pr.number} · by ${pr.user.login}`,
              urgency: ageDays > daysStale ? "red" : ageDays > 3 ? "yellow" : "green",
              age: `${ageDays}d ago`,
              source: repoFullName,
              actionLabel: "Review PR",
              meta: {
                owner,
                repo,
                number: String(pr.number),
              },
            });
          }
        }

        // Find stale issues assigned to user
        const staleDate = new Date(Date.now() - daysStale * 86400000).toISOString().split("T")[0];
        const issueRes = await fetch(
          `${GH_API}/search/issues?q=type:issue+state:open+assignee:${user.login}+updated:<${staleDate}&sort=updated&order=asc&per_page=10`,
          { headers }
        );
        if (issueRes.ok) {
          const issueData = await issueRes.json();
          for (const issue of issueData.items || []) {
            const staleDays = Math.floor((Date.now() - new Date(issue.updated_at).getTime()) / 86400000);
            const { owner, repo, full: repoFullName } = parseRepoUrl(issue.repository_url);
            looseEnds.push({
              id: `gh-issue-${issue.number}`,
              type: "github",
              title: `Stale issue: "${issue.title}"`,
              description: `${repoFullName} #${issue.number} · ${staleDays}d without activity`,
              urgency: staleDays > 14 ? "red" : "yellow",
              age: `${staleDays}d stale`,
              source: repoFullName,
              actionLabel: "Update Issue",
              meta: {
                owner,
                repo,
                number: String(issue.number),
              },
            });
          }
        }

        return { looseEnds };
      } catch (err) {
        console.error("GitHub scan error:", err);
        return { looseEnds: [], error: "Failed to scan GitHub" };
      }
    },
  }),
  "GitHub"
);

// ---------------------------------------------------------------------------
// SLACK TOOLS (read / search / send)
// ---------------------------------------------------------------------------

// Slack: list channels
const listSlackChannels = safeTool(
  withSlackConnection,
  tool({
    description: "List Slack channels the user is a member of. Returns channel names and IDs.",
    inputSchema: z.object({
      types: z.string().default("public_channel,private_channel").describe("Channel types: public_channel, private_channel, mpim, im"),
    }),
    execute: async ({ types }) => {
      const accessToken = getAccessTokenFromTokenVault();
      const res = await fetch(`https://slack.com/api/conversations.list?types=${encodeURIComponent(types)}&limit=100&exclude_archived=true`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return { error: "Failed to list channels" };
      const data = await res.json();
      if (!data.ok) return { error: data.error };
      return { channels: (data.channels ?? []).map((c: any) => ({ id: c.id, name: c.name || c.user, topic: c.topic?.value || "", is_private: !!c.is_private, num_members: c.num_members })) };
    },
  }),
  "Slack"
);

// Slack: read messages from a channel
const readSlackMessages = safeTool(
  withSlackConnection,
  tool({
    description: "Read recent messages from a Slack channel, DM, or group DM. Requires the channel ID.",
    inputSchema: z.object({
      channel: z.string().describe("The Slack channel ID (e.g. C01ABC123)"),
      limit: z.number().default(20).describe("Number of messages to fetch"),
    }),
    execute: async ({ channel, limit }) => {
      const accessToken = getAccessTokenFromTokenVault();
      const res = await fetch(`https://slack.com/api/conversations.history?channel=${channel}&limit=${limit}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return { error: "Failed to read messages" };
      const data = await res.json();
      if (!data.ok) return { error: data.error };

      // Resolve all unique user names in parallel
      const userIds = new Set<string>();
      for (const m of data.messages ?? []) { if (m.user) userIds.add(m.user); }
      const userEntries = await Promise.all(
        [...userIds].map(async (uid): Promise<[string, string]> => {
          try {
            const uRes = await fetch(`https://slack.com/api/users.info?user=${uid}`, { headers: { Authorization: `Bearer ${accessToken}` } });
            if (uRes.ok) { const u = (await uRes.json()).user; return [uid, u?.profile?.display_name || u?.real_name || u?.name || uid]; }
          } catch {}
          return [uid, uid];
        })
      );
      const userNames = Object.fromEntries(userEntries);

      return { messages: (data.messages ?? []).slice(0, limit).map((m: any) => ({ user: userNames[m.user] || m.user, text: m.text, ts: m.ts, thread_ts: m.thread_ts })) };
    },
  }),
  "Slack"
);

// Slack: search messages
const searchSlackMessages = safeTool(
  withSlackConnection,
  tool({
    description: "Search for messages across all Slack channels the user has access to.",
    inputSchema: z.object({
      query: z.string().describe("Search query"),
      count: z.number().default(10).describe("Number of results"),
    }),
    execute: async ({ query, count }) => {
      const accessToken = getAccessTokenFromTokenVault();
      const res = await fetch(`https://slack.com/api/search.messages?query=${encodeURIComponent(query)}&count=${count}&sort=timestamp&sort_dir=desc`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return { error: "Failed to search" };
      const data = await res.json();
      if (!data.ok) return { error: data.error };
      return { results: (data.messages?.matches ?? []).map((m: any) => ({ text: m.text, user: m.username, channel: m.channel?.name, ts: m.ts, permalink: m.permalink })) };
    },
  }),
  "Slack"
);

// Slack: send a message
// Raw tool — wrapped with CIBA + safeTool at registration time
const sendSlackMessageBase = tool({
  description: "Send a message to a Slack channel or DM. Requires the channel ID and message text. Always confirm with the user before sending.",
  inputSchema: z.object({
    channel: z.string().describe("The Slack channel ID to send to"),
    text: z.string().describe("The message text to send"),
    thread_ts: z.string().optional().describe("Thread timestamp to reply in a thread"),
  }),
  execute: async ({ channel, text, thread_ts }) => {
    requireCIBAApproval();
    const accessToken = getAccessTokenFromTokenVault();
    const body: any = { channel, text };
    if (thread_ts) body.thread_ts = thread_ts;
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { error: "Failed to send message" };
    const data = await res.json();
    if (!data.ok) return { error: data.error };
    return { success: true, ts: data.ts, channel: data.channel };
  },
});

// ---------------------------------------------------------------------------
// GMAIL ACTION TOOLS
// ---------------------------------------------------------------------------

// Get full email details (needed before replying)
const getEmailDetails = safeTool(
  withGoogleConnection,
  tool({
    description:
      "Fetch full headers and body snippet of a Gmail message by its message ID. Use this before drafting or sending a reply to get Message-ID, From, To, Subject, threadId, and a body preview.",
    inputSchema: z.object({
      messageId: z.string().describe("The Gmail message ID to fetch details for"),
    }),
    execute: async ({ messageId }) => {
      const accessToken = getAccessTokenFromTokenVault();

      const res = await fetch(
        `${GMAIL_API}/messages/${messageId}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!res.ok) {
        return { error: `Failed to fetch message ${messageId}: ${res.status}` };
      }
      const msg = await res.json();

      const hdrs = msg.payload?.headers || [];
      const getHeader = (name: string) =>
        hdrs.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || "";

      // Extract plain-text body snippet
      let bodySnippet = msg.snippet || "";
      // Try to get full plain text body from parts
      const parts = msg.payload?.parts || [];
      for (const part of parts) {
        if (part.mimeType === "text/plain" && part.body?.data) {
          bodySnippet = Buffer.from(part.body.data, "base64url").toString("utf-8");
          break;
        }
      }
      // If no parts, check top-level body
      if (!parts.length && msg.payload?.body?.data) {
        bodySnippet = Buffer.from(msg.payload.body.data, "base64url").toString("utf-8");
      }

      return {
        messageId: msg.id,
        threadId: msg.threadId,
        headerMessageId: getHeader("Message-ID"),
        from: getHeader("From"),
        to: getHeader("To"),
        subject: getHeader("Subject"),
        date: getHeader("Date"),
        references: getHeader("References"),
        bodySnippet: bodySnippet.slice(0, 2000),
      };
    },
  }),
  "Gmail"
);

// Draft an email reply
const draftEmailReply = safeTool(
  withGoogleConnection,
  tool({
    description:
      "Create a draft reply to an email in Gmail. Use getEmailDetails first to get the required headers. The draft will appear in the user's Drafts folder — it is NOT sent automatically.",
    inputSchema: z.object({
      threadId: z.string().describe("Gmail thread ID to reply in"),
      to: z.string().describe("Recipient email address"),
      subject: z.string().describe("Email subject (Re: prefix will be added if missing)"),
      body: z.string().describe("Plain-text body of the reply"),
      inReplyTo: z.string().optional().describe("Message-ID header of the message being replied to"),
      references: z.string().optional().describe("References header value for threading"),
      from: z.string().optional().describe("Sender email (defaults to authenticated user)"),
    }),
    execute: async ({ threadId, to, subject, body, inReplyTo, references, from }) => {
      const accessToken = getAccessTokenFromTokenVault();
      const senderEmail = await getGmailSenderEmail(accessToken, from);

      const mime = buildMimeMessage({
        to,
        from: senderEmail,
        subject,
        body,
        inReplyTo,
        references,
        threadId,
      });

      const res = await fetch(`${GMAIL_API}/drafts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            raw: mime.raw,
            threadId,
          },
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        return { error: `Failed to create draft: ${res.status} — ${errText}` };
      }

      const draft = await res.json();
      return {
        success: true,
        draftId: draft.id,
        threadId,
        message: "Draft created successfully. It's in your Gmail Drafts folder.",
      };
    },
  }),
  "Gmail"
);

// Compose and send a NEW email (not a reply)
// Raw tool — wrapped with CIBA + safeTool at registration time
const sendNewEmailBase = tool({
  description:
    "Compose and send a brand new email (not a reply to an existing thread). This SENDS immediately — always confirm with the user before calling. For replies to existing emails, use sendEmailReply instead.",
  inputSchema: z.object({
    to: z.string().describe("Recipient email address"),
    subject: z.string().describe("Email subject line"),
    body: z.string().describe("Plain-text body of the email"),
  }),
  execute: async ({ to, subject, body }) => {
    requireCIBAApproval();
    const accessToken = getAccessTokenFromTokenVault();
    const senderEmail = await getGmailSenderEmail(accessToken);

    const mime = buildMimeMessage({ to, from: senderEmail, subject, body });

    const res = await fetch(`${GMAIL_API}/messages/send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw: mime.raw }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { error: `Failed to send email: ${res.status} — ${errText}` };
    }

    const sent = await res.json();
    return { success: true, messageId: sent.id, message: `Email sent to ${to} with subject "${subject}".` };
  },
});

// Raw tool — wrapped with CIBA + safeTool at registration time
const sendEmailReplyBase = tool({
  description:
    "Send a reply to an email directly via Gmail. Use getEmailDetails first to get the required headers. This SENDS the email immediately — always confirm with the user before calling this tool.",
  inputSchema: z.object({
    threadId: z.string().describe("Gmail thread ID to reply in"),
    to: z.string().describe("Recipient email address"),
    subject: z.string().describe("Email subject (Re: prefix will be added if missing)"),
    body: z.string().describe("Plain-text body of the reply"),
    inReplyTo: z.string().optional().describe("Message-ID header of the message being replied to"),
    references: z.string().optional().describe("References header value for threading"),
    from: z.string().optional().describe("Sender email (defaults to authenticated user)"),
  }),
  execute: async ({ threadId, to, subject, body, inReplyTo, references, from }) => {
    requireCIBAApproval();
    const accessToken = getAccessTokenFromTokenVault();
    const senderEmail = await getGmailSenderEmail(accessToken, from);

    const mime = buildMimeMessage({ to, from: senderEmail, subject, body, inReplyTo, references, threadId });

    const res = await fetch(`${GMAIL_API}/messages/send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw: mime.raw, threadId }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { error: `Failed to send email: ${res.status} — ${errText}` };
    }

    const sent = await res.json();
    return { success: true, messageId: sent.id, threadId: sent.threadId, message: `Email sent successfully to ${to}.` };
  },
});

// ---------------------------------------------------------------------------
// CALENDAR ACTION TOOLS
// ---------------------------------------------------------------------------

const createCalendarEvent = safeTool(
  withGoogleConnection,
  tool({
    description:
      "Create a new event on the user's primary Google Calendar. Always confirm event details with the user before calling this tool.",
    inputSchema: z.object({
      summary: z.string().describe("Event title"),
      description: z.string().optional().describe("Event description or agenda"),
      startTime: z.string().describe("Start time in ISO 8601 format (e.g. 2025-04-03T10:00:00-07:00)"),
      endTime: z.string().describe("End time in ISO 8601 format"),
      attendees: z.array(z.string()).optional().describe("Array of attendee email addresses"),
    }),
    execute: async ({ summary, description, startTime, endTime, attendees }) => {
      const accessToken = getAccessTokenFromTokenVault();

      const eventBody: any = {
        summary,
        start: { dateTime: startTime },
        end: { dateTime: endTime },
      };
      if (description) eventBody.description = description;
      if (attendees && attendees.length > 0) {
        eventBody.attendees = attendees.map((email: string) => ({ email }));
      }

      const res = await fetch(`${CALENDAR_API}/calendars/primary/events`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(eventBody),
      });

      if (!res.ok) {
        const errText = await res.text();
        return { error: `Failed to create calendar event: ${res.status} — ${errText}` };
      }

      const event = await res.json();
      return {
        success: true,
        eventId: event.id,
        htmlLink: event.htmlLink,
        message: `Event "${summary}" created successfully.`,
      };
    },
  }),
  "Google Calendar"
);

// ---------------------------------------------------------------------------
// GITHUB ACTION TOOLS
// ---------------------------------------------------------------------------

// Comment on a GitHub issue or PR
const commentOnGitHub = safeTool(
  withGitHubConnection,
  tool({
    description:
      "Post a comment on a GitHub issue or pull request. Always confirm the comment text with the user before calling this tool.",
    inputSchema: z.object({
      owner: z.string().describe("Repository owner (e.g. 'octocat')"),
      repo: z.string().describe("Repository name (e.g. 'hello-world')"),
      issueNumber: z.number().describe("Issue or PR number"),
      body: z.string().describe("Comment body (Markdown supported)"),
    }),
    execute: async ({ owner, repo, issueNumber, body }) => {
      const accessToken = getAccessTokenFromTokenVault();

      const res = await fetch(
        `${GH_API}/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/vnd.github.v3+json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ body }),
        }
      );

      if (!res.ok) {
        const errText = await res.text();
        return { error: `Failed to post comment: ${res.status} — ${errText}` };
      }

      const comment = await res.json();
      return {
        success: true,
        commentId: comment.id,
        htmlUrl: comment.html_url,
        message: `Comment posted on ${owner}/${repo}#${issueNumber}.`,
      };
    },
  }),
  "GitHub"
);

// Raw tools — wrapped with CIBA + safeTool at registration time
const trashEmailBase = tool({
  description:
    "Move an email to trash. Use this for promotional/spam emails the user wants to clean up.",
  inputSchema: z.object({
    messageId: z.string().describe("The Gmail message ID to trash"),
    reason: z.string().describe("Why this email should be trashed"),
  }),
  execute: async ({ messageId }) => {
    requireCIBAApproval();
    const accessToken = getAccessTokenFromTokenVault();
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/trash`,
      { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) return { error: "Failed to trash email" };
    return { success: true, message: "Email moved to trash" };
  },
});

const bulkTrashJunkBase = tool({
  description:
    "Trash multiple junk/promotional/spam emails in one operation. Use this instead of calling trashEmail repeatedly. Takes an array of message IDs and trashes them all at once. Only ONE push notification is sent for the whole batch.",
  inputSchema: z.object({
    messageIds: z.array(z.string()).describe("Array of Gmail message IDs to trash"),
    reason: z.string().describe("Why these emails should be trashed, e.g. 'Promotional/spam cleanup'"),
  }),
  execute: async ({ messageIds }) => {
    requireCIBAApproval();
    const accessToken = getAccessTokenFromTokenVault();
    const res = await fetch(
      `${GMAIL_API}/messages/batchModify`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ids: messageIds, addLabelIds: ["TRASH"], removeLabelIds: ["INBOX"] }),
      }
    );
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      return { error: `Failed to bulk trash: ${res.status} ${err}`.slice(0, 200) };
    }
    return {
      success: true,
      count: messageIds.length,
      message: `${messageIds.length} junk email${messageIds.length !== 1 ? "s" : ""} moved to trash.`,
    };
  },
});

// Raw tool — wrapped with CIBA + safeTool at registration time
const reviewPullRequestBase = tool({
  description:
    "Submit a review on a GitHub pull request. Supports APPROVE, REQUEST_CHANGES, or COMMENT. Always confirm the review action and body with the user before calling this tool.",
  inputSchema: z.object({
    owner: z.string().describe("Repository owner"),
    repo: z.string().describe("Repository name"),
    prNumber: z.number().describe("Pull request number"),
    event: z.enum(["APPROVE", "REQUEST_CHANGES", "COMMENT"]).describe("Review action: APPROVE, REQUEST_CHANGES, or COMMENT"),
    body: z.string().describe("Review comment body"),
  }),
  execute: async ({ owner, repo, prNumber, event, body }) => {
    requireCIBAApproval();
    const accessToken = getAccessTokenFromTokenVault();

    const res = await fetch(
      `${GH_API}/repos/${owner}/${repo}/pulls/${prNumber}/reviews`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ event, body }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      return { error: `Failed to submit review: ${res.status} — ${errText}` };
    }

    const review = await res.json();
    return {
      success: true,
      reviewId: review.id,
      htmlUrl: review.html_url,
      state: review.state,
      message: `Review (${event}) submitted on ${owner}/${repo}#${prNumber}.`,
    };
  },
});

// ---------------------------------------------------------------------------
// ROUTE HANDLER
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  const session = await auth0.getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: { messages?: unknown; id?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const { messages, id } = body;
  if (!Array.isArray(messages)) {
    return new Response("Invalid messages format", { status: 400 });
  }

  const threadID =
    typeof id === "string" && id.length > 0 ? id : crypto.randomUUID();
  setAIContext({ threadID });

  // User ID for memory and audit logging
  const userId = session.user?.sub || session.user?.email || "anonymous";

  // ---------------------------------------------------------------------------
  // saveMemory tool — needs userId from the session closure
  // ---------------------------------------------------------------------------
  const saveMemory = tool({
    description:
      "Save a behavioral pattern about the user as one clear sentence (15-30 words). Focus on recurring habits, preferences, or how they work — not one-time events. Example: 'Responds to Slack DMs within 2 hours but lets email pile up during sprints.'",
    inputSchema: z.object({
      content: z.string().describe("The insight or pattern observed"),
      source: z
        .enum(["gmail", "calendar", "github", "slack", "chat"])
        .describe("Which service this was observed from"),
    }),
    execute: async ({ content, source }) => {
      try {
        const memory = await appendMemory(userId, { content, source });
        return {
          success: true,
          memoryId: memory.id,
          message: `Insight saved: "${content}"`,
        };
      } catch (err: any) {
        console.error("saveMemory error:", err);
        return { error: `Failed to save memory: ${err?.message ?? String(err)}` };
      }
    },
  });

  // ---------------------------------------------------------------------------
  // recallMemories tool — lets the agent search/filter saved memories
  // ---------------------------------------------------------------------------
  const recallMemories = tool({
    description:
      "Search and filter your saved memories about the user. Use this BEFORE answering questions about the user's habits, contacts, preferences, or history with a service. Returns matching memories.",
    inputSchema: z.object({
      query: z.string().optional().describe("Keyword to filter memories by (searches content text)"),
      source: z
        .enum(["gmail", "calendar", "github", "slack", "chat", "agent"])
        .optional()
        .describe("Filter memories by source service"),
    }),
    execute: async ({ query, source }) => {
      try {
        const all = await loadMemories(userId);
        let filtered = all;
        if (source) {
          filtered = filtered.filter((m) => m.source === source);
        }
        if (query) {
          const q = query.toLowerCase();
          filtered = filtered.filter((m) => m.content.toLowerCase().includes(q));
        }
        return {
          memories: filtered.map((m) => ({
            id: m.id,
            content: m.content,
            source: m.source,
            createdAt: m.createdAt,
          })),
          count: filtered.length,
          total: all.length,
        };
      } catch (err: any) {
        console.error("recallMemories error:", err);
        return { error: `Failed to recall memories: ${err?.message ?? String(err)}`, memories: [] };
      }
    },
  });

  // ---------------------------------------------------------------------------
  // forgetMemory tool — lets the agent delete outdated memories
  // ---------------------------------------------------------------------------
  const forgetMemory = tool({
    description:
      "Delete an outdated or incorrect memory by its ID. Use recallMemories first to find the memory ID. Use this when information is no longer accurate or relevant.",
    inputSchema: z.object({
      memoryId: z.string().describe("The ID of the memory to delete"),
    }),
    execute: async ({ memoryId }) => {
      try {
        const deleted = await deleteMemory(userId, memoryId);
        if (deleted) {
          return { success: true, message: `Memory ${memoryId} deleted.` };
        }
        return { success: false, message: `Memory ${memoryId} not found or already deleted.` };
      } catch (err: any) {
        console.error("forgetMemory error:", err);
        return { error: `Failed to delete memory: ${err?.message ?? String(err)}` };
      }
    },
  });

  // ---------------------------------------------------------------------------
  // getUserContext tool — gives the agent situational awareness
  // ---------------------------------------------------------------------------
  const getUserContext = tool({
    description:
      "Get a rich context snapshot: current date/time, memory count, connected services, and permission summary. Call this at the start of a conversation or when you need situational awareness.",
    inputSchema: z.object({}),
    execute: async () => {
      try {
        const now = new Date();
        const memories = await loadMemories(userId);
        const perms = await loadPermissions(userId).catch(() => defaultPermissions());

        // Determine which services are effectively connected based on permissions
        const services: { name: string; read: boolean; write: boolean }[] = [
          { name: "gmail", read: perms.gmail.can_read, write: perms.gmail.can_reply || perms.gmail.can_delete },
          { name: "calendar", read: perms.calendar.can_read, write: perms.calendar.can_create || perms.calendar.can_delete },
          { name: "github", read: perms.github.can_read, write: perms.github.can_comment || perms.github.can_approve },
          { name: "slack", read: perms.slack.can_read, write: perms.slack.can_send },
        ];

        // Summarize memories by source
        const memsBySource: Record<string, number> = {};
        for (const m of memories) {
          memsBySource[m.source] = (memsBySource[m.source] || 0) + 1;
        }

        return {
          currentTime: now.toISOString(),
          dayOfWeek: now.toLocaleDateString("en-US", { weekday: "long" }),
          date: now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
          memorySummary: {
            total: memories.length,
            bySource: memsBySource,
          },
          services,
          userId,
        };
      } catch (err: any) {
        console.error("getUserContext error:", err);
        return { error: `Failed to get context: ${err?.message ?? String(err)}` };
      }
    },
  });

  // ---------------------------------------------------------------------------
  // suggestAction — agent calls this to present cross-service suggestions
  // as interactive cards in the chat UI (rendered by SuggestionCard on client)
  // ---------------------------------------------------------------------------
  const suggestAction = tool({
    description:
      "Present a proactive cross-service suggestion to the user as an interactive card. " +
      "Use this when you notice an opportunity across services — e.g. a scheduling email " +
      "where you should check the calendar, or a confirmed time slot that needs a calendar " +
      "event, or a Slack message referencing an email. The frontend renders this as a " +
      "clickable card with Accept/Dismiss. When the user accepts, they will tell you to " +
      "proceed and you should then call the actual action tool.",
    inputSchema: z.object({
      type: z.enum([
        "check_calendar",
        "create_event",
        "check_email",
        "search_slack",
        "reply_email",
        "trash_email",
        "review_pr",
        "send_slack",
      ]).describe("The type of action being suggested"),
      title: z.string().describe("Short action title, e.g. 'Check calendar for Tuesday availability'"),
      description: z.string().describe("Why this suggestion is being made — the cross-service context"),
      sourceService: z.enum(["gmail", "calendar", "github", "slack"]).describe("Service where the trigger was found"),
      targetService: z.enum(["gmail", "calendar", "github", "slack"]).describe("Service where the action would happen"),
      tier: z.enum(["auto", "confirm", "ciba"]).describe("Security tier: auto (no approval), confirm (chat confirm), ciba (phone approval via Guardian)"),
      acceptLabel: z.string().optional().describe("Custom label for the accept button, e.g. 'Book Meeting' or 'Check Calendar'"),
      actionParams: z.record(z.string(), z.string()).optional().describe("Key parameters for the action if accepted (shown as context on the card)"),
    }),
    execute: async ({ type, title, description, sourceService, targetService, tier, acceptLabel, actionParams }) => {
      return {
        suggestion: true,
        type,
        title,
        description,
        sourceService,
        targetService,
        tier,
        acceptLabel: acceptLabel || undefined,
        actionParams: actionParams || {},
      };
    },
  });

  // Load memories, permissions, and plate context in parallel
  let memoriesBlock = "";
  let permissionsBlock = "";
  let plateBlock = "";
  let userPermissions: UserPermissions | null = null;

  const [memoriesResult, permissionsResult, plateResult] = await Promise.allSettled([
    loadMemories(userId),
    loadPermissions(userId),
    loadPlate(userId),
  ]);

  // Inject plate context
  if (plateResult.status === "fulfilled" && plateResult.value) {
    const plate = plateResult.value;
    const topItemLines = plate.topItems.map(
      (item) => `- [${item.urgency}] ${item.title} (${item.type}, ${item.age})`
    ).join("\n");
    plateBlock = `\n\nUSER'S CURRENT PLATE:\n${plate.summary}${topItemLines ? `\nTop items:\n${topItemLines}` : ""}\nUse this context to prioritize. Don't rescan if the plate is fresh.`;
  }

  if (memoriesResult.status === "fulfilled" && memoriesResult.value.length > 0) {
    const lines = memoriesResult.value.map(
      (m, i) => `${i + 1}. [${m.source}] ${m.content}`
    );
    memoriesBlock = `\n\nYOU HAVE LEARNED THE FOLLOWING ABOUT THIS USER:\n${lines.join("\n")}\nUse these to prioritize and give better suggestions. Save new patterns with saveMemory.`;
  }

  try {
    userPermissions = permissionsResult.status === "fulfilled" ? permissionsResult.value : defaultPermissions();
    const enabled: string[] = [];
    const disabled: string[] = [];
    const actionLabels: Record<string, Record<string, string>> = {
      gmail: { can_read: "Gmail read", can_reply: "Gmail reply", can_delete: "Gmail delete" },
      calendar: { can_read: "Calendar read", can_create: "Calendar create", can_delete: "Calendar delete" },
      github: { can_read: "GitHub read", can_comment: "GitHub comment", can_approve: "GitHub approve" },
      slack: { can_read: "Slack read", can_send: "Slack send" },
    };
    const services: ServiceName[] = ["gmail", "calendar", "github", "slack"];
    for (const svc of services) {
      const svcPerms = userPermissions[svc] as unknown as Record<string, boolean>;
      const labels = actionLabels[svc];
      for (const [action, label] of Object.entries(labels)) {
        if (svcPerms[action]) {
          enabled.push(label);
        } else {
          disabled.push(label);
        }
      }
    }
    if (disabled.length > 0) {
      permissionsBlock = `\n\nFINE-GRAINED AUTHORIZATION (FGA):\nThe user has DISABLED: ${disabled.join(", ")}.\nThe user has ENABLED: ${enabled.join(", ")}.\nDo NOT attempt to use disabled capabilities. If the user asks you to do something that is disabled, tell them to enable it in Settings > Agent Permissions.`;
    }
  } catch (err) {
    console.error("Failed to load permissions:", err);
  }

  // Hard-enforce FGA: only include tools the user has permissions for
  const p = userPermissions ?? defaultPermissions();
  // FGA permissions loaded — tools will be conditionally registered below
  const tools: Record<string, any> = { saveMemory, recallMemories, forgetMemory, getUserContext, suggestAction };

  // Tier 1 — Auto (read/scan, no approval needed)
  if (p.gmail.can_read) { tools.scanGmail = scanGmail; tools.getEmailDetails = getEmailDetails; }
  if (p.calendar.can_read) { tools.scanCalendar = scanCalendar; }
  if (p.github.can_read) { tools.scanGitHub = scanGitHub; }
  if (p.slack.can_read) { tools.scanSlack = scanSlack; tools.listSlackChannels = listSlackChannels; tools.readSlackMessages = readSlackMessages; tools.searchSlackMessages = searchSlackMessages; }

  // Tier 2 — Chat confirm (draft/create, low risk)
  if (p.gmail.can_reply) { tools.draftEmailReply = draftEmailReply; }
  if (p.calendar.can_create) { tools.createCalendarEvent = createCalendarEvent; }
  if (p.github.can_comment) { tools.commentOnGitHub = commentOnGitHub; }

  // Tier 3 — CIBA step-up auth (send/approve/delete, requires push notification approval)
  // CRITICAL: withCIBA wraps the raw tool() FIRST, then safeTool wraps the CIBA-protected tool.
  // This ensures @auth0/ai-vercel sees a proper AI SDK tool object and can intercept execution.
  if (p.gmail.can_reply) {
    tools.sendNewEmail = safeTool(withGoogleConnection, withCIBA(sendNewEmailBase), "Gmail");
    tools.sendEmailReply = safeTool(withGoogleConnection, withCIBA(sendEmailReplyBase), "Gmail");
  }
  if (p.gmail.can_delete) {
    tools.trashEmail = safeTool(withGoogleConnection, withCIBA(trashEmailBase), "Gmail");
    tools.bulkTrashJunk = safeTool(withGoogleConnection, withCIBA(bulkTrashJunkBase), "Gmail");
  }
  if (p.github.can_approve) {
    tools.reviewPullRequest = safeTool(withGitHubConnection, withCIBA(reviewPullRequestBase), "GitHub");
  }
  if (p.slack.can_send) {
    tools.sendSlackMessage = safeTool(withSlackConnection, withCIBA(sendSlackMessageBase), "Slack");
  }

  // Tools registered based on FGA permissions

  const modelMessages = await convertToModelMessages(messages as UIMessage[]);

  try {
    const result = streamText({
      model: anthropic("claude-sonnet-4-20250514"),
      system: `You are "Loose Ends" — a concise AI agent for Gmail, Calendar, GitHub, and Slack.

TOOLS:
Scan: scanGmail, scanCalendar, scanGitHub, scanSlack
Gmail: getEmailDetails, draftEmailReply, sendEmailReply, sendNewEmail, trashEmail, bulkTrashJunk
Calendar: createCalendarEvent
GitHub: commentOnGitHub, reviewPullRequest
Slack: listSlackChannels, readSlackMessages, searchSlackMessages, sendSlackMessage
Memory: saveMemory, recallMemories, forgetMemory
Context: getUserContext
Other: suggestAction

CRITICAL RULES:
1. BE CONCISE. Short responses. No over-explaining.
2. JUNK/SPAM CLEANUP: Use bulkTrashJunk (NOT trashEmail) for multiple emails. If previous scan results are still in the conversation, use those messageIds directly — do NOT rescan.
3. Tier 3 tools (send, trash, approve, post) require Auth0 Guardian approval. BEFORE calling the tool, output a text message like "Sending approval to your phone..." FIRST, THEN call the tool in the same response. The tool blocks until they approve. After it returns, report the result. NEVER say an action was completed unless the tool returned { success: true }.
4. If a tool returns { denied: true } or { error: "...Guardian..." }, tell the user the action was BLOCKED and they need to approve on their phone or check Settings.
5. NEVER hallucinate success. If the tool returned an error, say it failed. Do not say "deleted" or "sent" unless the tool explicitly confirmed success.
6. Before replying to emails: call getEmailDetails to get headers and body.
7. Only suggest actions you can actually perform. Never suggest "unsubscribe."

CROSS-SERVICE BEHAVIOR:
- Scheduling emails → check calendar (scanCalendar) before drafting a reply
- Confirmed time slot → suggest createCalendarEvent with attendees
- Slack mentions email → offer to check Gmail
- Use suggestAction to present cross-service suggestions as interactive cards

SCAN RESULTS: After scanning, briefly list results by urgency. Don't rescan if you already have results in this conversation.

MEMORY BEHAVIOR:
- Before answering questions about the user's habits, contacts, or preferences, call recallMemories first.
- When you observe patterns across scans (e.g. user always ignores emails from X, recurring meetings with Y, stale PRs from a specific repo), save them with saveMemory.
- Use forgetMemory to clean up outdated or incorrect memories (recall first to get the ID).
- Call getUserContext when you need situational awareness (current date/time, connected services, memory stats).

CONTEXT AWARENESS:
- Use scan results from this conversation as your understanding of the user's current plate (what needs replies, reviews, upcoming meetings).
- Call getUserContext when you need the current date/time, connected services, or memory stats.
- When the user's plate is heavy (many urgent items), prioritize and triage rather than addressing everything.
- Reference specific items by name when suggesting actions — don't be vague.

FGA (Fine-Grained Authorization): If a tool is not available to you, it means the user disabled that permission. Tell them to enable it in Settings > Agent Permissions.

If a tool returns an error about reconnecting, tell the user to go to Settings.${plateBlock}${memoriesBlock}${permissionsBlock}`,
      messages: modelMessages,
      tools,
      stopWhen: stepCountIs(10),
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("Chat API error:", error);
    return new Response("An error occurred while processing your request.", {
      status: 500,
    });
  }
}
