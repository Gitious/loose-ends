import { auth0 } from "@/lib/auth0";
import { checkPermission } from "@/lib/fga";
import { buildMimeMessage } from "@/lib/gmail-mime";
import { logAction } from "@/lib/audit";

export async function POST(req: Request) {
  const session = await auth0.getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const userId = session.user?.sub || session.user?.email || "anonymous";
  const allowed = await checkPermission(userId, "gmail", "can_reply");
  if (!allowed) {
    await logAction({
      userId,
      action: "email.reply",
      service: "gmail",
      details: "Permission denied for email reply",
      permitted: false,
      success: false,
    });
    return Response.json(
      { error: "Action not permitted. Enable Gmail actions in Settings." },
      { status: 403 }
    );
  }

  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { threadId, to, subject, body, messageId, sendDirectly } = parsed as Record<string, unknown>;
  if (!to || typeof to !== "string" || !subject || typeof subject !== "string" || !body || typeof body !== "string") {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Basic email format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return Response.json({ error: "Invalid email address" }, { status: 400 });
  }

  if (body.length > 100000 || subject.length > 1000) {
    return Response.json({ error: "Input too long" }, { status: 400 });
  }

  const typedMessageId = typeof messageId === "string" ? messageId : undefined;
  const typedThreadId = typeof threadId === "string" ? threadId : undefined;

  let token: string;
  try {
    const result = await auth0.getAccessTokenForConnection({ connection: "google-oauth2" });
    token = result.token;
  } catch {
    await logAction({
      userId,
      action: "email.reply",
      service: "gmail",
      target: typedMessageId,
      details: "Google not connected",
      permitted: true,
      success: false,
    });
    return Response.json({ error: "Google not connected" }, { status: 401 });
  }

  const userProfile = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const profile = await userProfile.json();
  const from = profile.emailAddress || session.user.email || "";

  const mimeResult = buildMimeMessage({ to, from, subject, body, inReplyTo: typedMessageId });

  if (sendDirectly) {
    // Send the email directly
    const sendRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        raw: mimeResult.raw,
        threadId: typedThreadId,
      }),
    });

    if (!sendRes.ok) {
      const err = await sendRes.text();
      await logAction({
        userId,
        action: "email.send",
        service: "gmail",
        target: typedMessageId,
        details: `Send failed: ${err.slice(0, 100)}`,
        permitted: true,
        success: false,
      });
      return Response.json({ error: "Failed to send email" }, { status: 500 });
    }

    const sent = await sendRes.json();
    await logAction({
      userId,
      action: "email.send",
      service: "gmail",
      target: typedMessageId,
      details: `Email sent to ${to}`,
      permitted: true,
      success: true,
    });
    return Response.json({ success: true, sent: true, messageId: sent.id });
  } else {
    // Create a draft
    const draftRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: { raw: mimeResult.raw, threadId: typedThreadId },
      }),
    });

    if (!draftRes.ok) {
      const err = await draftRes.text();
      await logAction({
        userId,
        action: "email.reply",
        service: "gmail",
        target: typedMessageId,
        details: `Draft creation failed: ${err.slice(0, 100)}`,
        permitted: true,
        success: false,
      });
      return Response.json({ error: "Failed to create draft" }, { status: 500 });
    }

    const draft = await draftRes.json();
    await logAction({
      userId,
      action: "email.reply",
      service: "gmail",
      target: typedMessageId,
      details: `Draft created for reply to ${to}`,
      permitted: true,
      success: true,
    });
    return Response.json({ success: true, sent: false, draftId: draft.id });
  }
}
