import { auth0 } from "@/lib/auth0";
import { checkPermission } from "@/lib/fga";
import { logAction } from "@/lib/audit";

export async function POST(req: Request) {
  const session = await auth0.getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  // FGA check: gmail.can_delete
  const userId = session.user?.sub || session.user?.email || "anonymous";
  const allowed = await checkPermission(userId, "gmail", "can_delete");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { messageIds } = body as Record<string, unknown>;
  const target = `${Array.isArray(messageIds) ? messageIds.length : 0} emails`;

  if (!allowed) {
    await logAction({
      userId,
      action: "email.bulk_trash",
      service: "gmail",
      target,
      details: "Permission denied for bulk trash",
      permitted: false,
      success: false,
    });
    return Response.json(
      { error: "Action not permitted. Enable Gmail delete in Settings." },
      { status: 403 }
    );
  }

  if (!messageIds || !Array.isArray(messageIds) || messageIds.length === 0) {
    return Response.json({ error: "Missing or empty messageIds array" }, { status: 400 });
  }

  if (messageIds.length > 100) {
    return Response.json({ error: "Too many messages. Maximum 100 per request." }, { status: 400 });
  }

  // Validate all elements are alphanumeric strings (Gmail message IDs)
  if (!messageIds.every((id: unknown) => typeof id === "string" && /^[a-zA-Z0-9]+$/.test(id))) {
    return Response.json({ error: "Invalid messageId format" }, { status: 400 });
  }

  let token: string;
  try {
    const result = await auth0.getAccessTokenForConnection({ connection: "google-oauth2" });
    token = result.token;
  } catch {
    await logAction({
      userId,
      action: "email.bulk_trash",
      service: "gmail",
      target,
      details: "Google not connected",
      permitted: true,
      success: false,
    });
    return Response.json({ error: "Google not connected" }, { status: 401 });
  }

  const res = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/batchModify",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ids: messageIds,
        addLabelIds: ["TRASH"],
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    await logAction({
      userId,
      action: "email.bulk_trash",
      service: "gmail",
      target,
      details: `Bulk trash failed: ${err.slice(0, 100)}`,
      permitted: true,
      success: false,
    });
    return Response.json({ error: "Failed to bulk trash emails" }, { status: 500 });
  }

  await logAction({
    userId,
    action: "email.bulk_trash",
    service: "gmail",
    target,
    details: `${messageIds.length} emails moved to trash`,
    permitted: true,
    success: true,
  });
  return Response.json({ success: true, count: messageIds.length });
}
