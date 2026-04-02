import { streamText, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { setAIContext } from "@auth0/ai-vercel";
import { auth0 } from "@/lib/auth0";
import { scanGmail } from "@/lib/tools/gmail";
import { scanCalendar } from "@/lib/tools/calendar";
import { scanGitHub } from "@/lib/tools/github";

export const maxDuration = 60;

export async function POST(req: Request) {
  const session = await auth0.getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { messages, id } = await req.json();
  setAIContext({ threadID: id || crypto.randomUUID() });

  const result = streamText({
    model: anthropic("claude-sonnet-4-20250514"),
    system: `You are "Loose Ends" — an AI agent that helps users find and resolve things they've dropped across their digital tools.

Your job:
1. When asked to scan, use the scanning tools to find loose ends across Gmail, Calendar, and GitHub.
2. Present findings clearly, ranked by urgency (red = critical, yellow = attention needed, green = low priority).
3. For each loose end, explain what happened and suggest an action.
4. When the user wants to take action, help them draft responses, create agendas, or review PRs.

Be concise and direct. When presenting loose ends, use this format:
🔴 [URGENT] Title — description (X days ago)
🟡 [ATTENTION] Title — description
🟢 [LOW] Title — description

Always scan all connected services when asked to find loose ends.`,
    messages,
    tools: { scanGmail, scanCalendar, scanGitHub },
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse();
}
