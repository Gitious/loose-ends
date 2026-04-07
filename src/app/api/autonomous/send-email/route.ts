import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { auth0 } from "@/lib/auth0";
import { checkPermission } from "@/lib/fga";
import { requestCIBAApproval } from "@/lib/ciba-direct";
import { logAction } from "@/lib/audit";
import { extractBody } from "@/lib/gmail-body";
import { buildMimeMessage } from "@/lib/gmail-mime";
import type { LooseEnd } from "@/lib/types";

export const maxDuration = 300; // 5 min — allows time for CIBA approval

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

// Only alphanumerics + whitespace + + - _ . , : # @ are allowed in Guardian binding messages
const sanitize = (s: string) =>
  s.replace(/[^a-zA-Z0-9\s+\-_.,:#@]/g, "").replace(/\s+/g, " ").trim();

export async function POST(req: Request) {
  // 1. Auth check
  const session = await auth0.getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user?.sub || "";
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const userName = session.user?.name || session.user?.nickname || "";
  const userFirstName = userName.split(" ")[0] || "Me";

  // Parse request body
  let item: LooseEnd | undefined;
  let params: { to?: unknown; subject?: unknown; body_hint?: unknown } | undefined;
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

  const to = typeof params.to === "string" ? params.to : "";
  const subject = typeof params.subject === "string" ? params.subject : "";
  const bodyHint = typeof params.body_hint === "string" ? params.body_hint : "";

  if (!to || !subject) {
    return Response.json(
      { error: "Missing required params: to, subject" },
      { status: 400 },
    );
  }

  // 2. FGA check
  const allowed = await checkPermission(userId, "gmail", "can_reply");
  if (!allowed) {
    logAction({
      userId,
      action: "autonomous.send_email",
      service: "gmail",
      permitted: false,
      success: false,
      details: "FGA denied: gmail.can_reply is off",
    });
    return Response.json(
      { error: "Permission denied: enable Gmail Reply in Agent Permissions" },
      { status: 403 },
    );
  }

  // 3. Get Google token via Auth0 Token Vault
  let googleToken: string;
  try {
    const result = await auth0.getAccessTokenForConnection({
      connection: "google-oauth2",
    });
    googleToken = result.token;
  } catch {
    return Response.json({ error: "Google not connected" }, { status: 401 });
  }

  // 4. Parse sender info for display/binding message
  const senderName = (item.meta?.from || item.source || "").split("<")[0].trim();
  const senderEmail =
    (item.meta?.from || item.source || "").match(/<([^>]+)>/)?.[1] ||
    item.meta?.from ||
    item.source ||
    to;

  // 5. Fetch email body for context (if we have a message ID)
  let emailBody = "";
  if (item.type === "email" && item.meta?.messageId) {
    try {
      const msgRes = await fetch(
        `${GMAIL_API}/messages/${item.meta.messageId}?format=full`,
        { headers: { Authorization: `Bearer ${googleToken}` } },
      );
      if (msgRes.ok) {
        const msgData = await msgRes.json();
        emailBody = extractBody(msgData.payload || {});
        if (emailBody.length > 1500) emailBody = emailBody.slice(0, 1500);
      }
    } catch {
      // Proceed without email body
    }
  }

  // 6. Generate reply with Claude Haiku, guided by body_hint
  const { text: replyText } = await generateText({
    model: anthropic("claude-haiku-4-5-20251001"),
    prompt: `You are helping a user write an email reply.

From: ${senderName || "Sender"} <${senderEmail}>
Subject: ${subject}

${emailBody ? `Original email body:\n${emailBody}` : `Context: ${item.description}`}

User's instruction for what to say (THIS IS THE PRIMARY GUIDE):
${bodyHint}

User's name: ${userFirstName}

Instructions:
- Write a reply that follows the user's instruction above. The instruction tells you what the user wants to say.
- Match the formality level of the original email.
- Start with an appropriate greeting using the sender's name if known.
- Keep it concise — reply to what was asked, don't pad with filler.
- Sign off with just the user's first name: ${userFirstName}
- Output ONLY the email body text (no subject line, no headers).`,
  });

  // 7. Build CIBA binding message: "Send email to {name}: {subject}"
  const nameForBinding = senderName || senderEmail.split("@")[0] || "recipient";
  // Budget the components so the full message fits in 64 chars.
  // Prefix "Send email to : " is 16 chars. Reserve 64 - 16 = 48 chars for name + subject.
  const rawMessage = `Send email to ${nameForBinding}: ${subject}`;
  let bindingMessage = sanitize(rawMessage);
  if (bindingMessage.length > 64) {
    bindingMessage = bindingMessage.slice(0, 64).trim();
  }

  console.log(`[Autonomous] Requesting CIBA approval: ${bindingMessage}`);

  // 8. Request CIBA approval
  const ciba = await requestCIBAApproval({
    userId,
    bindingMessage,
    timeoutSeconds: 120,
  });

  if (!ciba.approved) {
    logAction({
      userId,
      action: "autonomous.send_email",
      service: "gmail",
      target: item.meta?.messageId,
      permitted: true,
      success: false,
      details: `CIBA denied: ${ciba.error}`,
    });
    return Response.json({
      approved: false,
      error: ciba.error || "Action not approved. Check Auth0 Guardian on your phone.",
    });
  }

  // 9. CIBA approved — send the email reply
  console.log(`[Autonomous] CIBA approved, sending email to ${to}`);

  try {
    // Get the user's email address for the From header
    const profileRes = await fetch(`${GMAIL_API}/profile`, {
      headers: { Authorization: `Bearer ${googleToken}` },
    });
    const profile = profileRes.ok ? await profileRes.json() : {};
    const fromEmail = profile.emailAddress || session.user?.email || "";

    const mimeResult = buildMimeMessage({
      to,
      from: fromEmail,
      subject,
      body: replyText,
      inReplyTo: item.meta?.rfcMessageId,
      references: item.meta?.rfcMessageId,
    });

    const sendRes = await fetch(`${GMAIL_API}/messages/send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${googleToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        raw: mimeResult.raw,
        threadId: item.meta?.threadId,
      }),
    });

    if (!sendRes.ok) {
      const errText = await sendRes.text();
      logAction({
        userId,
        action: "autonomous.send_email",
        service: "gmail",
        target: item.meta?.messageId,
        permitted: true,
        success: false,
        details: `Gmail send failed: ${errText.slice(0, 100)}`,
      });
      return Response.json({
        approved: true,
        success: false,
        error: `Failed to send email: ${errText.slice(0, 100)}`,
      });
    }

    const sent = await sendRes.json();

    logAction({
      userId,
      action: "autonomous.send_email",
      service: "gmail",
      target: sent.id,
      permitted: true,
      success: true,
      details: `Email sent to ${to} via CIBA`,
    });

    return Response.json({
      approved: true,
      success: true,
      messageId: sent.id,
    });
  } catch (err: any) {
    logAction({
      userId,
      action: "autonomous.send_email",
      service: "gmail",
      target: item.meta?.messageId,
      permitted: true,
      success: false,
      details: `Unexpected error: ${err?.message}`,
    });
    return Response.json({
      approved: true,
      success: false,
      error: err?.message || "Send failed",
    });
  }
}
