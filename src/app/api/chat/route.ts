import { convertToModelMessages, streamText, UIMessage, tool, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { setAIContext } from "@auth0/ai-vercel";
import { z } from "zod";
import { auth0 } from "@/lib/auth0";

export const maxDuration = 60;

// Use inputSchema (not parameters) — workaround for AI SDK v6 + Anthropic bug
// https://github.com/vercel/ai/issues/12020
const scanGmailTool = tool({
  description: "Scan Gmail inbox for unreplied emails. Returns loose ends that need attention.",
  inputSchema: z.object({
    daysBack: z.number().default(14).describe("How many days back to scan"),
  }),
  execute: async ({ daysBack }) => {
    return {
      looseEnds: [
        { id: "gmail-1", type: "email", title: "Re: Q2 Planning", description: "From sarah@company.com — no reply sent", urgency: "red", age: "5d ago", source: "sarah@company.com", actionLabel: "Draft Reply" },
        { id: "gmail-2", type: "email", title: "Invoice #4521", description: "From billing@vendor.com — no reply sent", urgency: "yellow", age: "3d ago", source: "billing@vendor.com", actionLabel: "Draft Reply" },
        { id: "gmail-3", type: "email", title: "Meeting follow-up", description: "From james@partner.io — no reply sent", urgency: "green", age: "1d ago", source: "james@partner.io", actionLabel: "Draft Reply" },
      ],
    };
  },
});

const scanCalendarTool = tool({
  description: "Scan Google Calendar for upcoming meetings the user may be unprepared for or has conflicts.",
  inputSchema: z.object({
    hoursAhead: z.number().default(48).describe("How many hours ahead to check"),
  }),
  execute: async ({ hoursAhead }) => {
    return {
      looseEnds: [
        { id: "cal-1", type: "calendar", title: 'Unprepared: "Product Review"', description: "3 attendees, no agenda set — in 4h", urgency: "red", age: "in 4h", source: "Product Review", actionLabel: "Create Agenda" },
        { id: "cal-2", type: "calendar", title: 'Conflict: "1:1 with Alex" overlaps "Team Standup"', description: "Both scheduled at 2:00 PM tomorrow", urgency: "yellow", age: "tomorrow", source: "1:1 with Alex", actionLabel: "Reschedule" },
      ],
    };
  },
});

const scanGitHubTool = tool({
  description: "Scan GitHub for PR reviews assigned to the user that haven't been reviewed, and stale issues.",
  inputSchema: z.object({
    daysStale: z.number().default(7).describe("Number of days without activity to consider stale"),
  }),
  execute: async ({ daysStale }) => {
    return {
      looseEnds: [
        { id: "gh-pr-1", type: "github", title: 'Review requested: "Fix auth middleware"', description: "acme/backend #142 — by alex", urgency: "red", age: "8d ago", source: "acme/backend", actionLabel: "Review PR" },
        { id: "gh-issue-1", type: "github", title: 'Stale issue: "Update API docs"', description: "acme/docs #89 — no activity for 14d", urgency: "yellow", age: "14d stale", source: "acme/docs", actionLabel: "Update Issue" },
        { id: "gh-pr-2", type: "github", title: 'Review requested: "Add dark mode"', description: "acme/frontend #203 — by maya", urgency: "green", age: "2d ago", source: "acme/frontend", actionLabel: "Review PR" },
      ],
    };
  },
});

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

  const tools = {
    scanGmail: scanGmailTool,
    scanCalendar: scanCalendarTool,
    scanGitHub: scanGitHubTool,
  };

  const modelMessages = await convertToModelMessages(messages as UIMessage[]);

  try {
    const result = streamText({
      model: anthropic("claude-sonnet-4-20250514"),
      system: `You are "Loose Ends" — an AI agent that finds things users have dropped across Gmail, Calendar, and GitHub.

You have 3 tools: scanGmail, scanCalendar, scanGitHub. When the user asks to scan, find loose ends, or start digging — IMMEDIATELY call all three tools. Do not describe what you will do — just call the tools.

After getting results, present them ranked by urgency:
🔴 [URGENT] Title — description (time)
🟡 [ATTENTION] Title — description (time)
🟢 [LOW] Title — description (time)

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
