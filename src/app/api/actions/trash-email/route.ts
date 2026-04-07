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

  const messageId = (body as Record<string, unknown>)?.messageId;

  if (typeof messageId !== "string" || !messageId || !/^[a-zA-Z0-9]+$/.test(messageId)) {
    return Response.json({ error: "Missing or invalid messageId" }, { status: 400 });
  }

  if (!allowed) {
    await logAction({
      userId,
      action: "email.trash",
      service: "gmail",
      target: messageId,
      details: "Permission denied for email trash",
      permitted: false,
      success: false,
    });
    return Response.json(
      { error: "Action not permitted. Enable Gmail delete in Settings." },
      { status: 403 }
    );
  }

  let token: string;
  try {
    const result = await auth0.getAccessTokenForConnection({ connection: "google-oauth2" });
    token = result.token;
  } catch {
    await logAction({
      userId,
      action: "email.trash",
      service: "gmail",
      target: messageId,
      details: "Google not connected",
      permitted: true,
      success: false,
    });
    return Response.json({ error: "Google not connected" }, { status: 401 });
  }

  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/trash`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!res.ok) {
    const err = await res.text();
    await logAction({
      userId,
      action: "email.trash",
      service: "gmail",
      target: messageId,
      details: `Trash failed: ${err.slice(0, 100)}`,
      permitted: true,
      success: false,
    });
    return Response.json({ error: "Failed to trash email" }, { status: 500 });
  }

  await logAction({
    userId,
    action: "email.trash",
    service: "gmail",
    target: messageId,
    details: "Email moved to trash",
    permitted: true,
    success: true,
  });
  return Response.json({ success: true });
}
