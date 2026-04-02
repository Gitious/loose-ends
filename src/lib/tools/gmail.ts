import { tool } from "ai";
import { z } from "zod";
import { getAccessTokenFromTokenVault } from "@auth0/ai-vercel";
import { withGmailAccess } from "@/lib/auth0-ai";
import type { LooseEnd, UrgencyLevel } from "@/lib/types";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

function getUrgencyByAge(daysOld: number): UrgencyLevel {
  if (daysOld > 7) return "red";
  if (daysOld > 3) return "yellow";
  return "green";
}

function formatAge(daysOld: number): string {
  if (daysOld === 0) return "today";
  if (daysOld === 1) return "1 day ago";
  return `${daysOld} days ago`;
}

export const scanGmail = withGmailAccess(
  tool({
    description:
      "Scan Gmail inbox for unreplied emails from the last N days. Returns loose ends that need attention.",
    inputSchema: z.object({
      days: z
        .number()
        .default(7)
        .describe("Number of days to look back for unreplied emails"),
    }),
    execute: async ({ days }) => {
      const accessToken = getAccessTokenFromTokenVault();
      const looseEnds: LooseEnd[] = [];

      const afterDate = new Date();
      afterDate.setDate(afterDate.getDate() - days);
      const afterEpoch = Math.floor(afterDate.getTime() / 1000);

      // Search for emails in inbox from last N days
      const query = `in:inbox after:${afterEpoch}`;
      const listRes = await fetch(
        `${GMAIL_API}/messages?q=${encodeURIComponent(query)}&maxResults=50`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!listRes.ok) {
        throw new Error(`Gmail API error: ${listRes.status} ${listRes.statusText}`);
      }

      const listData = await listRes.json();
      const messages: Array<{ id: string; threadId: string }> =
        listData.messages ?? [];

      // Get user's email address for identifying own replies
      const profileRes = await fetch(`${GMAIL_API}/profile`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const profile = await profileRes.json();
      const userEmail = (profile.emailAddress ?? "").toLowerCase();

      // Check each message's thread for replies
      const threadCache = new Map<string, boolean>();

      for (const msg of messages) {
        // Skip if we already processed this thread
        if (threadCache.has(msg.threadId)) continue;

        // Get the full message to check sender
        const msgRes = await fetch(
          `${GMAIL_API}/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        if (!msgRes.ok) continue;

        const msgData = await msgRes.json();
        const headers: Array<{ name: string; value: string }> =
          msgData.payload?.headers ?? [];

        const from =
          headers.find((h) => h.name === "From")?.value ?? "";
        const subject =
          headers.find((h) => h.name === "Subject")?.value ?? "(no subject)";
        const dateStr =
          headers.find((h) => h.name === "Date")?.value ?? "";

        // Skip emails sent by the user
        if (from.toLowerCase().includes(userEmail)) {
          threadCache.set(msg.threadId, true);
          continue;
        }

        // Check the thread for user's reply
        const threadRes = await fetch(
          `${GMAIL_API}/threads/${msg.threadId}?format=metadata&metadataHeaders=From`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        if (!threadRes.ok) {
          threadCache.set(msg.threadId, false);
          continue;
        }

        const threadData = await threadRes.json();
        const threadMessages: Array<{
          payload?: { headers?: Array<{ name: string; value: string }> };
        }> = threadData.messages ?? [];

        const userReplied = threadMessages.some((m) => {
          const fromHeader = m.payload?.headers?.find(
            (h) => h.name === "From"
          );
          return fromHeader?.value?.toLowerCase().includes(userEmail);
        });

        threadCache.set(msg.threadId, userReplied);

        if (!userReplied) {
          const emailDate = dateStr ? new Date(dateStr) : new Date();
          const daysOld = Math.floor(
            (Date.now() - emailDate.getTime()) / (1000 * 60 * 60 * 24)
          );

          // Extract sender name
          const senderMatch = from.match(/^"?([^"<]*)"?\s*</);
          const senderName = senderMatch
            ? senderMatch[1].trim()
            : from.split("@")[0];

          looseEnds.push({
            id: `gmail-${msg.threadId}`,
            type: "email",
            title: subject,
            description: `Unreplied email from ${senderName}`,
            urgency: getUrgencyByAge(daysOld),
            age: formatAge(daysOld),
            source: "Gmail",
            actionLabel: "Reply to email",
            meta: {
              threadId: msg.threadId,
              messageId: msg.id,
              from,
              subject,
              date: dateStr,
            },
          });
        }
      }

      return looseEnds;
    },
  })
);
