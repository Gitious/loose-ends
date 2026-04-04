import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { auth0 } from "@/lib/auth0";
import { checkPermission } from "@/lib/fga";
import { logAction } from "@/lib/audit";
import { loadMemories } from "@/lib/memory";
import { extractBody } from "@/lib/gmail-body";
import type { LooseEnd } from "@/lib/types";

export const maxDuration = 30;

export async function POST(req: Request) {
  const session = await auth0.getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const userId = session.user?.sub || session.user?.email || "anonymous";
  const userName = session.user?.name || session.user?.nickname || "";
  const userFirstName = userName.split(" ")[0] || "Me";
  const { item } = (await req.json()) as { item: LooseEnd };

  if (!item) {
    return Response.json({ error: "Missing item" }, { status: 400 });
  }

  // FGA check: email needs can_reply, slack needs can_send
  if (item.type === "email") {
    const allowed = await checkPermission(userId, "gmail", "can_reply");
    if (!allowed) {
      await logAction({
        userId,
        action: "email.generate_reply",
        service: "gmail",
        details: "Permission denied for generating email reply",
        permitted: false,
        success: false,
      });
      return Response.json(
        { error: "Action not permitted. Enable Gmail Reply in Settings." },
        { status: 403 }
      );
    }
  } else if (item.type === "slack") {
    const allowed = await checkPermission(userId, "slack", "can_send");
    if (!allowed) {
      await logAction({
        userId,
        action: "slack.generate_reply",
        service: "slack",
        details: "Permission denied for generating Slack reply",
        permitted: false,
        success: false,
      });
      return Response.json(
        { error: "Action not permitted. Enable Slack Send in Settings." },
        { status: 403 }
      );
    }
  }

  // Load user memories for personalization (max 5)
  const memories = await loadMemories(userId);
  const recentMemories = memories.slice(0, 5);
  const memoryContext = recentMemories.length > 0
    ? recentMemories.map((m) => `- ${m.content}`).join("\n")
    : "No user context available.";

  // --- Slack reply generation ---
  if (item.type === "slack") {
    let conversationContext = "";
    const channelId = item.meta?.channel;

    if (channelId) {
      try {
        const slackResult = await auth0.getAccessTokenForConnection({ connection: "sign-in-with-slack" });
        const slackToken = slackResult.token;

        // Fetch last 5 messages from the channel
        const histRes = await fetch(
          `https://slack.com/api/conversations.history?channel=${channelId}&limit=5`,
          { headers: { Authorization: `Bearer ${slackToken}` } }
        );

        if (histRes.ok) {
          const histData = await histRes.json();
          const messages = histData.messages ?? [];

          // Resolve user names for context (in parallel)
          const userIds = new Set(messages.map((m: { user?: string }) => m.user).filter(Boolean) as string[]);
          const userNames: Record<string, string> = {};
          await Promise.all([...userIds].map(async (uid) => {
            try {
              const uRes = await fetch(
                `https://slack.com/api/users.info?user=${uid}`,
                { headers: { Authorization: `Bearer ${slackToken}` } }
              );
              if (uRes.ok) {
                const u = (await uRes.json()).user;
                userNames[uid] = u?.profile?.display_name || u?.real_name || u?.name || uid;
              }
            } catch {}
          }));

          // Build conversation context (oldest first)
          const orderedMsgs = [...messages].reverse();
          conversationContext = orderedMsgs
            .map((msg: { user?: string; text?: string }) => {
              const name = msg.user ? (userNames[msg.user] || msg.user) : "Unknown";
              return `${name}: ${(msg.text ?? "").slice(0, 300)}`;
            })
            .join("\n");

          if (conversationContext.length > 3000) {
            conversationContext = conversationContext.slice(0, 3000) + "...";
          }
        }
      } catch {
        // If we can't fetch Slack history, proceed with metadata only
      }
    }

    const contextBlock = conversationContext
      ? `Recent conversation:\n${conversationContext}`
      : `Channel/DM context: ${item.title}\nDescription: ${item.description}`;

    const { text } = await generateText({
      model: anthropic("claude-haiku-4-5-20251001"),
      prompt: `You are helping a user write a reply in a Slack conversation.

${contextBlock}

User's name: ${userFirstName}
User context (things we know about them):
${memoryContext}

Write a casual, conversational Slack reply. Match the tone of the conversation. Keep it short and natural — this is Slack, not email. Do NOT include any headers, greetings like "Hi [name]," or sign-offs. Just write the message text as you'd type it in Slack.`,
    });

    return Response.json({ reply: text });
  }

  // --- Email reply generation ---
  let emailBody = "";
  let fetchError = "";
  const senderName = (item.meta?.from || item.source || "").split("<")[0].trim();
  const senderEmail = (item.meta?.from || item.source || "").match(/<([^>]+)>/)?.[1] || item.meta?.from || item.source || "";
  const subject = item.meta?.subject || item.title;

  if (item.type === "email" && item.meta?.messageId) {
    try {
      const result = await auth0.getAccessTokenForConnection({ connection: "google-oauth2" });
      const token = result.token;

      const gmailUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.meta.messageId}?format=full`;
      const msgRes = await fetch(gmailUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (msgRes.ok) {
        const msgData = await msgRes.json();
        emailBody = extractBody(msgData.payload || {});

        // Truncate to avoid huge prompts
        if (emailBody.length > 2000) {
          emailBody = emailBody.slice(0, 2000) + "\n\n[... email truncated for brevity ...]";
        }
      } else {
        const errText = await msgRes.text();
        fetchError = `Gmail API returned ${msgRes.status}: ${errText.slice(0, 200)}`;
      }
    } catch (err) {
      fetchError = `Exception fetching email: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  // Build the prompt — different strategies depending on whether we have the email body
  let prompt: string;

  if (emailBody) {
    // We have the actual email content — generate a relevant reply
    prompt = `You are helping a user write an email reply. You MUST reply to the ACTUAL content of the email below. Do NOT make up topics, events, or context that is not in the email.

From: ${senderName} <${senderEmail}>
Subject: ${subject}

--- START OF EMAIL ---
${emailBody}
--- END OF EMAIL ---

User's name: ${userFirstName}
User context (things we know about them):
${memoryContext}

Instructions:
- Your reply MUST directly address the specific content, questions, or topics in the email above.
- Do NOT invent or hallucinate any topics, meetings, events, or context not present in the email.
- If the email is promotional or marketing (from a brand, newsletter, automated notification), respond with ONLY: "No reply needed — this is a promotional email."
- If the email is a notification (shipping update, account alert, etc.), respond with ONLY: "No reply needed — this is an automated notification."
- If the email requires a genuine reply, write a professional response that directly addresses what the sender wrote.
- Match the formality level of the original email.
- Start with an appropriate greeting.
- Keep it concise — reply to what was asked, don't pad with filler.
- Sign off with just the user's first name: ${userFirstName}`;
  } else {
    // We could NOT fetch the email body -- be transparent about it
    prompt = `You are helping a user write an email reply, but we could only retrieve the email metadata (not the full body).

From: ${senderName} <${senderEmail}>
Subject: ${subject}
Description: ${item.description}

User's name: ${userFirstName}
User context (things we know about them):
${memoryContext}

Instructions:
- Based ONLY on the subject line and sender info above, write a brief, safe reply.
- Do NOT make up specific details, topics, or events that you don't know about.
- If the subject suggests this is promotional or automated (e.g., from a brand, "order confirmation", "shipping update"), respond with ONLY: "No reply needed — this appears to be an automated email."
- If it seems like a real email that needs a reply, write a short, generic-but-relevant response based on the subject line. For example, if the subject is "Meeting tomorrow", you could say "Thanks for the heads up — looking forward to it."
- Acknowledge that you're working from limited context. Keep it short and safe.
- Sign off with: ${userFirstName}`;
  }

  const { text } = await generateText({
    model: anthropic("claude-haiku-4-5-20251001"),
    prompt,
  });

  return Response.json({ reply: text });
}
