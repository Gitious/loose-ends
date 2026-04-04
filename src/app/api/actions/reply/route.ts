import { auth0 } from "@/lib/auth0";
import { checkPermission } from "@/lib/fga";
import { buildMimeMessage } from "@/lib/gmail-mime";
import { logAction } from "@/lib/audit";

export async function POST(req: Request) {
  const session = await auth0.getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  // FGA check: gmail.can_reply
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

  const { threadId, to, subject, body, messageId } = await req.json();
  if (!to || !subject || !body) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  let token: string;
  try {
    const result = await auth0.getAccessTokenForConnection({ connection: "google-oauth2" });
    token = result.token;
  } catch {
    await logAction({
      userId,
      action: "email.reply",
      service: "gmail",
      target: messageId,
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

  const mimeResult = buildMimeMessage({ to, from, subject, body, inReplyTo: messageId });

  // Create a draft (safer than sending directly)
  const draftRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: { raw: mimeResult.raw, threadId },
    }),
  });

  if (!draftRes.ok) {
    const err = await draftRes.text();
    await logAction({
      userId,
      action: "email.reply",
      service: "gmail",
      target: messageId,
      details: `Draft creation failed: ${err.slice(0, 100)}`,
      permitted: true,
      success: false,
    });
    return Response.json({ error: `Failed to create draft: ${err}` }, { status: 500 });
  }

  const draft = await draftRes.json();
  await logAction({
    userId,
    action: "email.reply",
    service: "gmail",
    target: messageId,
    details: `Draft created for reply to ${to}`,
    permitted: true,
    success: true,
  });
  return Response.json({ success: true, draftId: draft.id });
}
