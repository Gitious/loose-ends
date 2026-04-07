import { auth0 } from "@/lib/auth0";
import { checkPermission } from "@/lib/fga";
import { logAction } from "@/lib/audit";

export async function POST(req: Request) {
  const session = await auth0.getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  // FGA check: slack.can_send
  const userId = session.user?.sub || session.user?.email || "anonymous";
  const allowed = await checkPermission(userId, "slack", "can_send");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { channel, text, threadTs } = body as Record<string, unknown>;
  const typedChannel = typeof channel === "string" ? channel : undefined;

  if (!allowed) {
    await logAction({
      userId,
      action: "slack.send",
      service: "slack",
      target: typedChannel,
      details: "Permission denied for Slack send",
      permitted: false,
      success: false,
    });
    return Response.json(
      { error: "Action not permitted. Enable Slack actions in Settings." },
      { status: 403 }
    );
  }

  if (!channel || typeof channel !== "string" || !text || typeof text !== "string") {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (channel.length > 100 || text.length > 40000) {
    return Response.json({ error: "Input too long" }, { status: 400 });
  }

  if (threadTs !== undefined && (typeof threadTs !== "string" || threadTs.length > 50)) {
    return Response.json({ error: "Invalid threadTs" }, { status: 400 });
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
      target: typedChannel,
      details: "Slack not connected",
      permitted: true,
      success: false,
    });
    return Response.json({ error: "Slack not connected" }, { status: 401 });
  }

  // Post message via Slack chat.postMessage API
  const slackBody: Record<string, string> = {
    channel: channel as string,
    text: text as string,
  };
  if (threadTs) {
    slackBody.thread_ts = threadTs as string;
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
      target: typedChannel,
      details: `Slack API error: ${err.slice(0, 100)}`,
      permitted: true,
      success: false,
    });
    return Response.json({ error: "Slack API error" }, { status: 500 });
  }

  const slackData = await slackRes.json();
  if (!slackData.ok) {
    await logAction({
      userId,
      action: "slack.send",
      service: "slack",
      target: typedChannel,
      details: `Slack error: ${slackData.error || "unknown"}`,
      permitted: true,
      success: false,
    });
    return Response.json(
      { error: "Slack error" },
      { status: 500 }
    );
  }

  await logAction({
    userId,
    action: "slack.send",
    service: "slack",
    target: typedChannel,
    details: "Message sent to Slack",
    permitted: true,
    success: true,
  });
  return Response.json({ success: true, ts: slackData.ts });
}
