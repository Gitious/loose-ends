import { auth0 } from "@/lib/auth0";
import { checkPermission } from "@/lib/fga";
import { requestCIBAApproval } from "@/lib/ciba-direct";
import { logAction } from "@/lib/audit";

export const maxDuration = 300; // 5 min — allows time for CIBA approval

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

export async function POST(req: Request) {
  const session = await auth0.getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user?.sub || "";
  if (!userId) return Response.json({ error: "No user" }, { status: 401 });

  // Parse junk email list from request
  let messageIds: string[] = [];
  let senders: string[] = [];
  try {
    const body = await req.json();
    messageIds = body.messageIds || [];
    senders = body.senders || [];
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  if (messageIds.length === 0) {
    return Response.json({ error: "No emails to trash" }, { status: 400 });
  }

  // FGA check: does the user allow gmail.can_delete?
  const allowed = await checkPermission(userId, "gmail", "can_delete");
  if (!allowed) {
    await logAction({ userId, action: "email.autonomous_bulk_trash", service: "gmail", permitted: false, success: false, details: "FGA denied: gmail.can_delete is off" });
    return Response.json({ error: "Permission denied: enable Gmail Delete in Agent Permissions" }, { status: 403 });
  }

  // Build binding message for Guardian push
  // Max 64 chars, only alphanumerics + whitespace + +-_.,:#
  const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9\s+\-_.,:#]/g, "").trim();
  const bindingMessage = sanitize(`Trash ${messageIds.length} junk emails from your inbox`);

  console.log(`[Autonomous] Requesting CIBA approval: ${bindingMessage}`);

  // Send CIBA push and wait for approval
  const ciba = await requestCIBAApproval({
    userId,
    bindingMessage,
    timeoutSeconds: 120,
  });

  if (!ciba.approved) {
    await logAction({ userId, action: "email.autonomous_bulk_trash", service: "gmail", permitted: true, success: false, details: `CIBA denied: ${ciba.error}` });
    return Response.json({ approved: false, error: ciba.error });
  }

  // CIBA approved — trash the emails
  console.log(`[Autonomous] CIBA approved, trashing ${messageIds.length} emails`);

  try {
    const { token } = await auth0.getAccessTokenForConnection({ connection: "google-oauth2" });

    const res = await fetch(`${GMAIL_API}/messages/batchModify`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ids: messageIds,
        addLabelIds: ["TRASH"],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      await logAction({ userId, action: "email.autonomous_bulk_trash", service: "gmail", permitted: true, success: false, details: `Gmail API error: ${res.status}` });
      return Response.json({ approved: true, success: false, error: errText });
    }

    await logAction({ userId, action: "email.autonomous_bulk_trash", service: "gmail", permitted: true, success: true, details: `Trashed ${messageIds.length} junk emails via CIBA` });

    return Response.json({ approved: true, success: true, count: messageIds.length });
  } catch (err: any) {
    await logAction({ userId, action: "email.autonomous_bulk_trash", service: "gmail", permitted: true, success: false, details: err?.message });
    return Response.json({ approved: true, success: false, error: err?.message });
  }
}
