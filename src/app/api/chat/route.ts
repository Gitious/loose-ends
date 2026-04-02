import { convertToModelMessages, streamText, UIMessage } from "ai";
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
  console.log("Available tools:", Object.keys(tools));
  console.log("scanGmail type:", typeof scanGmail, scanGmail);
  const modelMessages = await convertToModelMessages(messages as UIMessage[]);

  try {
    const result = streamText({
      model: anthropic("claude-sonnet-4-20250514"),
      system: `You are "Loose Ends" — an AI agent that finds things users have dropped across Gmail, Calendar, and GitHub.

CRITICAL: When the user asks you to find loose ends, scan, start digging, or anything similar — you MUST immediately call ALL THREE tools: scanGmail, scanCalendar, and scanGitHub. Do NOT just say you will scan. Actually call the tools NOW.

After getting tool results, present findings ranked by urgency:
🔴 [URGENT] Title — description (X days ago)
🟡 [ATTENTION] Title — description
🟢 [LOW] Title — description

If a tool returns an error (e.g., account not connected), tell the user they need to connect that service from the Settings page.`,
      messages: modelMessages,
      tools,
      maxSteps: 5,
      toolChoice: "auto",
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("Chat API error:", error);
    return new Response("An error occurred while processing your request.", {
      status: 500,
    });
  }
}
