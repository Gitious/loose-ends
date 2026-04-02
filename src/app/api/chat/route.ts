import { convertToModelMessages, streamText, UIMessage, createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { setAIContext } from "@auth0/ai-vercel";
import { errorSerializer, withInterruptions } from "@auth0/ai-vercel/interrupts";
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

  const threadID = typeof id === "string" && id.length > 0 ? id : crypto.randomUUID();
  setAIContext({ threadID });

  const tools = { scanGmail, scanCalendar, scanGitHub };

  const modelMessages = await convertToModelMessages(messages as UIMessage[]);

  const stream = createUIMessageStream({
    originalMessages: messages as UIMessage[],
    execute: withInterruptions(
      async ({ writer }) => {
        const result = streamText({
          model: anthropic("claude-sonnet-4-20250514"),
          system: `You are "Loose Ends" — an AI agent that helps users find and resolve things they've dropped across their digital tools.

Your job:
1. When asked to scan, use the scanning tools to find loose ends across Gmail, Calendar, and GitHub.
2. Present findings clearly, ranked by urgency (red = critical, yellow = attention needed, green = low priority).
3. For each loose end, explain what happened and suggest an action.

Be concise and direct. When presenting loose ends, use this format:
🔴 [URGENT] Title — description (X days ago)
🟡 [ATTENTION] Title — description
🟢 [LOW] Title — description

Always scan all connected services when asked to find loose ends.`,
          messages: modelMessages,
          tools,
          onFinish: (output) => {
            if (output.finishReason === 'tool-calls') {
              const lastMessage = output.content[output.content.length - 1];
              if (lastMessage?.type === 'tool-error') {
                const { toolName, toolCallId, error, input } = lastMessage;
                throw { cause: error, toolCallId, toolName, toolArgs: input };
              }
            }
          },
        });
        writer.merge(result.toUIMessageStream({ sendReasoning: true }));
      },
      { messages: messages as UIMessage[], tools },
    ),
    onError: errorSerializer((err) => {
      console.error('Chat API error:', err);
      return 'An error occurred while processing your request.';
    }),
  });

  return createUIMessageStreamResponse({ stream });
}
