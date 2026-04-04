import { convertToModelMessages, streamText, UIMessage, tool, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { setAIContext, getAccessTokenFromTokenVault } from "@auth0/ai-vercel";
import { AuthorizationPendingInterrupt, AsyncAuthorizationInterrupt } from "@auth0/ai/interrupts";
import type { ToolWrapper } from "@auth0/ai-vercel";
import { TokenVaultInterrupt } from "@auth0/ai/interrupts";
import { z } from "zod";
import { auth0 } from "@/lib/auth0";
import { withGoogleConnection, withGitHubConnection, withSlackConnection } from "@/lib/auth0-ai";
import { withCIBA } from "@/lib/ciba";
import { buildMimeMessage } from "@/lib/gmail-mime";
import { loadMemories, appendMemory } from "@/lib/memory";
import { loadPermissions, defaultPermissions, type UserPermissions, type ServiceName } from "@/lib/fga";
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
        // CIBA: user hasn't approved yet — tell the agent to inform the user
        if (err instanceof AuthorizationPendingInterrupt || err instanceof AsyncAuthorizationInterrupt) {
          console.log(`[CIBA] Authorization pending for ${serviceName}:`, err?.message);
          logAction({
            userId,
            action: `${service}.ciba_pending`,
            service,
            details: "CIBA authorization pending — push notification sent",
            permitted: true,
            success: false,
          }).catch(() => {});
          return {
            pending: true,
            message: `⏳ A push notification has been sent to your phone via Auth0 Guardian. Please approve the action, then ask me to try again.`,
          };
        }
        const msg = err?.message ?? String(err);
        console.error(`[${serviceName}] Token Vault error:`, msg);
        logAction({
          userId,
          action: `${service}.execute`,
          service,
          details: `Error: ${msg}`.slice(0, 200),
          permitted: true,
          success: false,
        }).catch(() => {});
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
            `${GMAIL_API}/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
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

          looseEnds.push({
            id: `gmail-${msg.id}`,
            type: "email",
            title: subject,
            description: `From ${from.split("<")[0].trim()} · no reply sent`,
            urgency: ageDays > 7 ? "red" : ageDays > 3 ? "yellow" : "green",
            age: ageDays === 0 ? "today" : `${ageDays}d ago`,
            source: from,
            actionLabel: "Draft Reply",
            meta: {
              threadId: msgData.threadId,
              messageId: msg.id,
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
const sendSlackMessage = safeTool(
  withSlackConnection,
  tool({
    description: "Send a message to a Slack channel or DM. Requires the channel ID and message text. Always confirm with the user before sending.",
    inputSchema: z.object({
      channel: z.string().describe("The Slack channel ID to send to"),
      text: z.string().describe("The message text to send"),
      thread_ts: z.string().optional().describe("Thread timestamp to reply in a thread"),
    }),
    execute: async ({ channel, text, thread_ts }) => {
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
  }),
  "Slack"
);

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
const sendNewEmail = safeTool(
  withGoogleConnection,
  tool({
    description:
      "Compose and send a brand new email (not a reply to an existing thread). This SENDS immediately — always confirm with the user before calling. For replies to existing emails, use sendEmailReply instead.",
    inputSchema: z.object({
      to: z.string().describe("Recipient email address"),
      subject: z.string().describe("Email subject line"),
      body: z.string().describe("Plain-text body of the email"),
    }),
    execute: async ({ to, subject, body }) => {
      const accessToken = getAccessTokenFromTokenVault();
      const senderEmail = await getGmailSenderEmail(accessToken);

      const mime = buildMimeMessage({
        to,
        from: senderEmail,
        subject,
        body,
      });

      const res = await fetch(`${GMAIL_API}/messages/send`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw: mime.raw }),
      });

      if (!res.ok) {
        const errText = await res.text();
        return { error: `Failed to send email: ${res.status} — ${errText}` };
      }

      const sent = await res.json();
      return {
        success: true,
        messageId: sent.id,
        message: `Email sent to ${to} with subject "${subject}".`,
      };
    },
  }),
  "Gmail"
);

// Send an email reply directly
const sendEmailReply = safeTool(
  withGoogleConnection,
  tool({
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

      const res = await fetch(`${GMAIL_API}/messages/send`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          raw: mime.raw,
          threadId,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        return { error: `Failed to send email: ${res.status} — ${errText}` };
      }

      const sent = await res.json();
      return {
        success: true,
        messageId: sent.id,
        threadId: sent.threadId,
        message: `Email sent successfully to ${to}.`,
      };
    },
  }),
  "Gmail"
);

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

// Trash an email
const trashEmail = safeTool(
  withGoogleConnection,
  tool({
    description:
      "Move an email to trash. Use this for promotional/spam emails the user wants to clean up. Always confirm with the user before trashing.",
    inputSchema: z.object({
      messageId: z.string().describe("The Gmail message ID to trash"),
      reason: z.string().describe("Why this email should be trashed"),
    }),
    execute: async ({ messageId }) => {
      const accessToken = getAccessTokenFromTokenVault();
      const res = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/trash`,
        { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!res.ok) return { error: "Failed to trash email" };
      return { success: true, message: "Email moved to trash" };
    },
  }),
  "Gmail"
);

// Submit a PR review
const reviewPullRequest = safeTool(
  withGitHubConnection,
  tool({
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
  }),
  "GitHub"
);

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
      "Save a learned insight about the user based on patterns observed across their data. Call when you notice recurring patterns, preferences, or habits.",
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

  // Load memories and permissions in parallel
  let memoriesBlock = "";
  let permissionsBlock = "";
  let userPermissions: UserPermissions | null = null;

  const [memoriesResult, permissionsResult] = await Promise.allSettled([
    loadMemories(userId),
    loadPermissions(userId),
  ]);

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
  const tools: Record<string, any> = { saveMemory };

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
  if (p.gmail.can_reply) { tools.sendNewEmail = withCIBA(sendNewEmail); tools.sendEmailReply = withCIBA(sendEmailReply); }
  if (p.gmail.can_delete) { tools.trashEmail = withCIBA(trashEmail); }
  if (p.github.can_approve) { tools.reviewPullRequest = withCIBA(reviewPullRequest); }
  if (p.slack.can_send) { tools.sendSlackMessage = withCIBA(sendSlackMessage); }

  // Tools registered based on FGA permissions

  const modelMessages = await convertToModelMessages(messages as UIMessage[]);

  try {
    const result = streamText({
      model: anthropic("claude-sonnet-4-20250514"),
      system: `You are "Loose Ends" — an AI agent that finds things users have dropped across Gmail, Calendar, GitHub, and Slack, and helps them take action.

SCANNING TOOLS (call all 4 when user asks to scan/find loose ends):
- scanGmail: find unreplied emails (returns threadId and messageId in each result's meta)
- scanCalendar: find calendar conflicts and unprepared meetings
- scanGitHub: find pending PR reviews and stale issues (returns owner, repo, number in each result's meta)
- scanSlack: find unanswered DMs and mentions

SLACK TOOLS (use when user asks about Slack specifically):
- listSlackChannels: list channels the user is in
- readSlackMessages: read messages from a channel (needs channel ID — list channels first if needed)
- searchSlackMessages: search messages across all channels
- sendSlackMessage: send a message to a channel or DM (ACTION — confirm first!)

GMAIL ACTION TOOLS:
- sendNewEmail: compose and send a brand new email to anyone. CIBA step-up: sends push notification for approval.
- getEmailDetails: fetch full headers + body of a Gmail message by ID. Call this BEFORE drafting or sending a reply.
- draftEmailReply: create a draft reply in Gmail (goes to Drafts folder, not sent). Needs threadId, to, subject, body.
- sendEmailReply: send a reply immediately via Gmail. Needs threadId, to, subject, body.
- trashEmail: move an email to trash. Use for promotional/spam emails the user wants to clean up. Needs messageId, reason.

CALENDAR ACTION TOOLS:
- createCalendarEvent: create a new calendar event with summary, times, and optional attendees.

GITHUB ACTION TOOLS:
- commentOnGitHub: post a comment on a GitHub issue or PR. Needs owner, repo, issueNumber, body.
- reviewPullRequest: submit a PR review (APPROVE, REQUEST_CHANGES, or COMMENT). Needs owner, repo, prNumber, event, body.

MEMORY TOOL:
- saveMemory: save a learned insight about the user's patterns or preferences. Call when you notice recurring behaviors.

ACTION SECURITY TIERS:
- Tier 1 (Auto): Scanning and reading — no approval needed.
- Tier 2 (Chat confirm): Drafting, creating events, commenting — describe what you'll do and wait for user to say "yes" in chat.
- Tier 3 (CIBA step-up): Sending emails, approving PRs, posting Slack messages, deleting emails — CALL THE TOOL IMMEDIATELY. The tool itself handles authorization by sending a push notification to the user's phone via Auth0 Guardian. Do NOT wait for chat confirmation for Tier 3 — just call the tool and it will block until the user approves on their phone.

IMPORTANT: When the user asks you to trash, send, or delete something, CALL THE TOOL RIGHT AWAY. Do not describe what you plan to do and wait — the CIBA push notification IS the confirmation mechanism. The tool will wait for approval automatically.

After scanning, present results ranked by urgency:
🔴 [URGENT] Title — description (time)
🟡 [ATTENTION] Title — description (time)
🟢 [LOW] Title — description (time)

If a tool returns an error about reconnecting, tell the user to go to Settings and connect that service.
Be concise and direct.${memoriesBlock}${permissionsBlock}`,
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
