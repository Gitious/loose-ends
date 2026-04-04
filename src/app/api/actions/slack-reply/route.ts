import { auth0 } from "@/lib/auth0";
import { checkPermission } from "@/lib/fga";
import { logAction } from "@/lib/audit";

export async function POST(req: Request) {
  const session = await auth0.getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  // FGA check: slack.can_send
  const userId = session.user?.sub || session.user?.email || "anonymous";
  const allowed = await checkPermission(userId, "slack", "can_send");

  const { channel, text, threadTs } = await req.json();

  if (!allowed) {
    await logAction({
      userId,
      action: "slack.send",
      service: "slack",
      target: channel,
      details: "Permission denied for Slack send",
      permitted: false,
      success: false,
    });
    return Response.json(
      { error: "Action not permitted. Enable Slack actions in Settings." },
      { status: 403 }
    );
  }

  if (!channel || !text) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  let token: string;
  try {
    const result = await auth0.getAccessTokenForConnection({ connection: "sign-in-with-slack" });
    token = result.token;
  } catch {
    await logAction({
      userId,
      action: "slack.send",
      service: "slack",
      target: channel,
      details: "Slack not connected",
      permitted: true,
      success: false,
    });
    return Response.json({ error: "Slack not connected" }, { status: 401 });
  }

  // Post message via Slack chat.postMessage API
  const slackBody: Record<string, string> = {
    channel,
    text,
  };
  if (threadTs) {
    slackBody.thread_ts = threadTs;
  }

  const slackRes = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(slackBody),
  });

  if (!slackRes.ok) {
    const err = await slackRes.text();
    await logAction({
      userId,
      action: "slack.send",
      service: "slack",
      target: channel,
      details: `Slack API error: ${err.slice(0, 100)}`,
      permitted: true,
      success: false,
    });
    return Response.json({ error: `Slack API error: ${err}` }, { status: 500 });
  }

  const slackData = await slackRes.json();
  if (!slackData.ok) {
    await logAction({
      userId,
      action: "slack.send",
      service: "slack",
      target: channel,
      details: `Slack error: ${slackData.error || "unknown"}`,
      permitted: true,
      success: false,
    });
    return Response.json(
      { error: `Slack error: ${slackData.error || "unknown"}` },
      { status: 500 }
    );
  }

  await logAction({
    userId,
    action: "slack.send",
    service: "slack",
    target: channel,
    details: "Message sent to Slack",
    permitted: true,
    success: true,
  });
  return Response.json({ success: true, ts: slackData.ts });
}
