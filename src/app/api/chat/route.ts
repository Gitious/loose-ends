import { convertToModelMessages, streamText, UIMessage, tool, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { setAIContext, getAccessTokenFromTokenVault } from "@auth0/ai-vercel";
import { z } from "zod";
import { auth0 } from "@/lib/auth0";
import { withGoogleConnection, withGitHubConnection } from "@/lib/auth0-ai";

export const maxDuration = 60;

// Gmail scanner — wrapped with Token Vault for Google access
const scanGmail = withGoogleConnection(
  tool({
    description: "Scan Gmail inbox for unreplied emails. Returns loose ends that need attention.",
    inputSchema: z.object({
      daysBack: z.number().default(14).describe("How many days back to scan"),
    }),
    execute: async ({ daysBack }) => {
      const accessToken = getAccessTokenFromTokenVault();
      const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

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
            description: `From ${from.split("<")[0].trim()} — no reply sent`,
            urgency: ageDays > 7 ? "red" : ageDays > 3 ? "yellow" : "green",
            age: ageDays === 0 ? "today" : `${ageDays}d ago`,
            source: from,
            actionLabel: "Draft Reply",
          });
        }

        return { looseEnds };
      } catch (err) {
        console.error("Gmail scan error:", err);
        return { looseEnds: [], error: "Failed to scan Gmail" };
      }
    },
  })
);

// Calendar scanner — wrapped with Token Vault for Google access
const scanCalendar = withGoogleConnection(
  tool({
    description: "Scan Google Calendar for upcoming meetings the user may be unprepared for or has conflicts.",
    inputSchema: z.object({
      hoursAhead: z.number().default(48).describe("How many hours ahead to check"),
    }),
    execute: async ({ hoursAhead }) => {
      const accessToken = getAccessTokenFromTokenVault();
      const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

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
              description: `${attendees} attendees, no agenda — in ${Math.floor(hoursUntil)}h`,
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
  })
);

// GitHub scanner — wrapped with Token Vault for GitHub access
const scanGitHub = withGitHubConnection(
  tool({
    description: "Scan GitHub for PR reviews assigned to the user that haven't been reviewed, and stale issues.",
    inputSchema: z.object({
      daysStale: z.number().default(7).describe("Number of days without activity to consider stale"),
    }),
    execute: async ({ daysStale }) => {
      const accessToken = getAccessTokenFromTokenVault();
      const GH_API = "https://api.github.com";
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
            looseEnds.push({
              id: `gh-pr-${pr.number}`,
              type: "github",
              title: `Review requested: "${pr.title}"`,
              description: `${pr.repository_url.split("/repos/")[1]} #${pr.number} — by ${pr.user.login}`,
              urgency: ageDays > daysStale ? "red" : ageDays > 3 ? "yellow" : "green",
              age: `${ageDays}d ago`,
              source: pr.repository_url.split("/repos/")[1] || "",
              actionLabel: "Review PR",
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
            looseEnds.push({
              id: `gh-issue-${issue.number}`,
              type: "github",
              title: `Stale issue: "${issue.title}"`,
              description: `${issue.repository_url.split("/repos/")[1]} #${issue.number} — ${staleDays}d without activity`,
              urgency: staleDays > 14 ? "red" : "yellow",
              age: `${staleDays}d stale`,
              source: issue.repository_url.split("/repos/")[1] || "",
              actionLabel: "Update Issue",
            });
          }
        }

        return { looseEnds };
      } catch (err) {
        console.error("GitHub scan error:", err);
        return { looseEnds: [], error: "Failed to scan GitHub" };
      }
    },
  })
);

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

  const tools = { scanGmail, scanCalendar, scanGitHub };
  const modelMessages = await convertToModelMessages(messages as UIMessage[]);

  try {
    const result = streamText({
      model: anthropic("claude-sonnet-4-20250514"),
      system: `You are "Loose Ends" — an AI agent that finds things users have dropped across Gmail, Calendar, and GitHub.

You have 3 tools: scanGmail, scanCalendar, scanGitHub. When the user asks to scan, find loose ends, or start digging — IMMEDIATELY call all three tools.

After getting results, present them ranked by urgency:
🔴 [URGENT] Title — description (time)
🟡 [ATTENTION] Title — description (time)
🟢 [LOW] Title — description (time)

If a tool returns an error about reconnecting, tell the user to go to Settings and connect that service.
Be concise and direct.`,
      messages: modelMessages,
      tools,
      stopWhen: stepCountIs(5),
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("Chat API error:", error);
    return new Response("An error occurred while processing your request.", {
      status: 500,
    });
  }
}
