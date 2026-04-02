import { tool } from "ai";
import { z } from "zod";
import { getAccessTokenFromTokenVault } from "@auth0/ai-vercel";
import { withGmailAccess } from "@/lib/auth0-ai";
import { getUrgencyByAge, formatAge } from "@/lib/types";
import type { LooseEnd } from "@/lib/types";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

async function gmailFetch(path: string, token: string) {
  const res = await fetch(`${GMAIL_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    console.error(`Gmail API error: ${res.status} ${res.statusText}`);
    throw new Error("Failed to fetch Gmail data. Please try again.");
  }
  return res.json();
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

      // Fetch message list and user profile in parallel
      const query = `in:inbox after:${afterEpoch}`;
      const [listData, profile] = await Promise.all([
        gmailFetch(
          `/messages?q=${encodeURIComponent(query)}&maxResults=50`,
          accessToken
        ),
        gmailFetch("/profile", accessToken),
      ]);

      const messages: Array<{ id: string; threadId: string }> =
        listData.messages ?? [];
      const userEmail = (profile.emailAddress ?? "").toLowerCase();

      // Deduplicate by thread so we only fetch each thread once
      const seenThreads = new Set<string>();
      const uniqueMessages: Array<{ id: string; threadId: string }> = [];
      for (const msg of messages) {
        if (!seenThreads.has(msg.threadId)) {
          seenThreads.add(msg.threadId);
          uniqueMessages.push(msg);
        }
      }

      // Batch-fetch message metadata + thread data in parallel (batches of 10)
      const BATCH_SIZE = 10;
      for (let i = 0; i < uniqueMessages.length; i += BATCH_SIZE) {
        const batch = uniqueMessages.slice(i, i + BATCH_SIZE);

        const results = await Promise.all(
          batch.map(async (msg) => {
            const [msgData, threadData] = await Promise.all([
              gmailFetch(
                `/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
                accessToken
              ),
              gmailFetch(
                `/threads/${msg.threadId}?format=metadata&metadataHeaders=From`,
                accessToken
              ),
            ]);
            return { msg, msgData, threadData };
          })
        );

        for (const { msg, msgData, threadData } of results) {
          const headers: Array<{ name: string; value: string }> =
            msgData.payload?.headers ?? [];

          const from = headers.find((h) => h.name === "From")?.value ?? "";
          const subject =
            headers.find((h) => h.name === "Subject")?.value ?? "(no subject)";
          const dateStr =
            headers.find((h) => h.name === "Date")?.value ?? "";

          // Skip emails sent by the user
          if (from.toLowerCase().includes(userEmail)) continue;

          // Check the thread for user's reply
          const threadMessages: Array<{
            payload?: { headers?: Array<{ name: string; value: string }> };
          }> = threadData.messages ?? [];

          const userReplied = threadMessages.some((m) => {
            const fromHeader = m.payload?.headers?.find(
              (h) => h.name === "From"
            );
            return fromHeader?.value?.toLowerCase().includes(userEmail);
          });

          if (!userReplied) {
            const emailDate = dateStr ? new Date(dateStr) : new Date();
            const daysOld = Math.floor(
              (Date.now() - emailDate.getTime()) / (1000 * 60 * 60 * 24)
            );

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
      }

      return looseEnds;
    },
  })
);
