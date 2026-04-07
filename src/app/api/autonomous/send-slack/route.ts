import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { auth0 } from "@/lib/auth0";
import { checkPermission } from "@/lib/fga";
import { requestCIBAApproval } from "@/lib/ciba-direct";
import { logAction } from "@/lib/audit";
import type { LooseEnd } from "@/lib/types";

export const maxDuration = 300; // 5 min — allows time for CIBA approval

const SLACK_POST_MESSAGE = "https://slack.com/api/chat.postMessage";

export async function POST(req: Request) {
  // 1. Auth check
  const session = await auth0.getSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user?.sub || "";
  if (!userId) {
    return Response.json({ error: "No user" }, { status: 401 });
  }

  // Parse request body
  let item: LooseEnd | undefined;
  let params: { body_hint?: string } | undefined;
  try {
    const body = await req.json();
    item = body.item;
    params = body.params;
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!item || typeof item !== "object") {
    return Response.json({ error: "Missing item" }, { status: 400 });
  }

  if (!params || typeof params !== "object") {
    return Response.json({ error: "Missing params" }, { status: 400 });
  }

  const channel = item.meta?.channel;
  const threadTs = item.meta?.ts;
  if (!channel || typeof channel !== "string") {
    return Response.json(
      { error: "Missing channel in item.meta" },
      { status: 400 },
    );
  }
  if (!threadTs || typeof threadTs !== "string") {
    return Response.json(
      { error: "Missing thread timestamp in item.meta" },
      { status: 400 },
    );
  }

  // 2. FGA check: slack.can_send
  const allowed = await checkPermission(userId, "slack", "can_send");
  if (!allowed) {
    await logAction({
      userId,
      action: "autonomous.send_slack",
      service: "slack",
      target: channel,
      details: "FGA denied: slack.can_send is off",
      permitted: false,
      success: false,
    });
    return Response.json(
      { error: "Permission denied: enable Slack Send in Agent Permissions" },
      { status: 403 },
    );
  }

  // 3. Get Slack token via Auth0 Token Vault
  let slackToken: string;
  try {
    const result = await auth0.getAccessTokenForConnection({
      connection: "sign-in-with-slack",
    });
    slackToken = result.token;
  } catch {
    await logAction({
      userId,
      action: "autonomous.send_slack",
      service: "slack",
      target: channel,
      details: "Slack not connected",
      permitted: true,
      success: false,
    });
    return Response.json({ error: "Slack not connected" }, { status: 401 });
  }

  // 4. Generate the Slack reply with Claude Haiku using body_hint
  const bodyHint = params.body_hint || "";
  const { text: messageText } = await generateText({
    model: anthropic("claude-haiku-4-5-20251001"),
    prompt: `You are helping a user write a Slack reply in a thread.

Original message context:
- Title: ${item.title}
- From: ${item.source}
${item.description ? `- Detail: ${item.description}` : ""}

What the user wants to say: ${bodyHint}

Instructions:
- Write a casual, conversational Slack reply — this is Slack, not email.
- DO NOT include any greeting (no "Hi", "Hey", "Hello").
- DO NOT include any sign-off (no "Thanks", "Best", "-Name").
- Keep it short and to the point (1-2 sentences usually).
- Match the tone of the body hint provided by the user.
- Output only the reply text, nothing else.`,
  });

  // 5. Build CIBA binding message: "Reply in Slack: {item.title}"
  // Max 64 chars, only [a-zA-Z0-9\s+\-_.,:#@] allowed
  const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9\s+\-_.,:#@]/g, "").trim();
  const prefix = "Reply in Slack: ";
  const maxTitleLen = 64 - prefix.length;
  const sanitizedTitle = sanitize(item.title);
  const truncatedTitle =
    sanitizedTitle.length > maxTitleLen
      ? sanitizedTitle.slice(0, maxTitleLen).trim()
      : sanitizedTitle;
  const rawBinding = `${prefix}${truncatedTitle}`;
  const bindingMessage = sanitize(
    rawBinding.length > 64 ? rawBinding.slice(0, 64).trim() : rawBinding,
  );

  console.log(`[Autonomous] Requesting CIBA approval: ${bindingMessage}`);

  // 6. Request CIBA approval with 120s timeout
  const ciba = await requestCIBAApproval({
    userId,
    bindingMessage,
    timeoutSeconds: 120,
  });

  if (!ciba.approved) {
    await logAction({
      userId,
      action: "autonomous.send_slack",
      service: "slack",
      target: channel,
      details: `CIBA denied: ${ciba.error}`,
      permitted: true,
      success: false,
    });
    return Response.json({
      approved: false,
      error:
        ciba.error || "Action not approved. Check Auth0 Guardian on your phone.",
    });
  }

  // 7. CIBA approved — send the Slack message
  console.log(`[Autonomous] CIBA approved, posting Slack message to ${channel}`);

  try {
    const slackRes = await fetch(SLACK_POST_MESSAGE, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${slackToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel,
        text: messageText,
        thread_ts: threadTs,
      }),
    });

    if (!slackRes.ok) {
      const errText = await slackRes.text();
      await logAction({
        userId,
        action: "autonomous.send_slack",
        service: "slack",
        target: channel,
        details: `Slack API error: ${errText.slice(0, 100)}`,
        permitted: true,
        success: false,
      });
      return Response.json({
        approved: true,
        success: false,
        error: `Slack API error: ${errText.slice(0, 100)}`,
      });
    }

    const slackData = await slackRes.json();
    if (!slackData.ok) {
      await logAction({
        userId,
        action: "autonomous.send_slack",
        service: "slack",
        target: channel,
        details: `Slack error: ${slackData.error || "unknown"}`,
        permitted: true,
        success: false,
      });
      return Response.json({
        approved: true,
        success: false,
        error: `Slack error: ${slackData.error || "unknown"}`,
      });
    }

    await logAction({
      userId,
      action: "autonomous.send_slack",
      service: "slack",
      target: channel,
      details: `Sent reply to thread ${threadTs} via CIBA`,
      permitted: true,
      success: true,
    });

    return Response.json({
      approved: true,
      success: true,
      messageTs: slackData.ts,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await logAction({
      userId,
      action: "autonomous.send_slack",
      service: "slack",
      target: channel,
      details: `Unexpected error: ${msg}`,
      permitted: true,
      success: false,
    });
    return Response.json({
      approved: true,
      success: false,
      error: msg,
    });
  }
}
