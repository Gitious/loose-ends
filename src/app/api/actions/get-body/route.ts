import { auth0 } from "@/lib/auth0";
import { checkPermission, type ServiceName } from "@/lib/fga";
import { logAction } from "@/lib/audit";
import { extractBody, cleanEmailBody } from "@/lib/gmail-body";
import type { LooseEnd } from "@/lib/types";

export const maxDuration = 30;

export async function POST(req: Request) {
  const session = await auth0.getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const userId = session.user?.sub || session.user?.email || "anonymous";
  const { item } = (await req.json()) as { item: LooseEnd };

  if (!item) {
    return Response.json({ error: "Missing item" }, { status: 400 });
  }

  // FGA check: can_read for the relevant service
  const serviceMap: Record<string, ServiceName> = {
    email: "gmail",
    calendar: "calendar",
    github: "github",
    slack: "slack",
  };
  const service = serviceMap[item.type];
  if (service) {
    const allowed = await checkPermission(userId, service, "can_read");
    if (!allowed) {
      await logAction({
        userId,
        action: `${item.type}.get_body`,
        service,
        details: `Permission denied for reading ${item.type} content`,
        permitted: false,
        success: false,
      });
      return Response.json(
        { error: `Action not permitted. Enable ${service} Read in Settings.` },
        { status: 403 }
      );
    }
  }

  // --- Email: fetch full body from Gmail API ---
  if (item.type === "email") {
    const messageId = item.meta?.messageId;
    if (!messageId) {
      return Response.json({ body: item.description || "No content available.", type: "email" });
    }

    try {
      const result = await auth0.getAccessTokenForConnection({ connection: "google-oauth2" });
      const token = result.token;

      const gmailUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`;
      const msgRes = await fetch(gmailUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (msgRes.ok) {
        const msgData = await msgRes.json();
        let body = extractBody(msgData.payload || {});

        if (!body) {
          body = item.description || "No content available.";
        }

        // Clean up email cruft (tracking URLs, separators, etc.)
        body = cleanEmailBody(body);

        // If after cleanup the body is nearly empty, show a summary
        if (body.length < 20) {
          body = `Promotional email from ${(item.meta?.from || item.source || "").split("<")[0].trim()}.\nSubject: ${item.meta?.subject || item.title}`;
        }

        // Truncate very long bodies for display
        if (body.length > 3000) {
          body = body.slice(0, 3000) + "\n\n[... content truncated ...]";
        }

        return Response.json({ body, type: "email" });
      } else {
        return Response.json({ body: item.description || "Could not load email content.", type: "email" });
      }
    } catch {
      return Response.json({ body: item.description || "Could not load email content.", type: "email" });
    }
  }

  // --- Slack: fetch recent channel messages ---
  if (item.type === "slack") {
    const channelId = item.meta?.channel;
    if (!channelId) {
      return Response.json({ body: item.description || "No content available.", type: "slack" });
    }

    try {
      const slackResult = await auth0.getAccessTokenForConnection({ connection: "sign-in-with-slack" });
      const slackToken = slackResult.token;

      const histRes = await fetch(
        `https://slack.com/api/conversations.history?channel=${channelId}&limit=10`,
        { headers: { Authorization: `Bearer ${slackToken}` } }
      );

      if (histRes.ok) {
        const histData = await histRes.json();
        const messages = histData.messages ?? [];

        // Resolve user names
        const userNames: Record<string, string> = {};
        for (const msg of messages) {
          if (msg.user && !userNames[msg.user]) {
            try {
              const uRes = await fetch(
                `https://slack.com/api/users.info?user=${msg.user}`,
                { headers: { Authorization: `Bearer ${slackToken}` } }
              );
              if (uRes.ok) {
                const u = (await uRes.json()).user;
                userNames[msg.user] = u?.profile?.display_name || u?.real_name || u?.name || msg.user;
              }
            } catch {
              userNames[msg.user] = msg.user;
            }
          }
        }

        // Build thread (oldest first)
        const orderedMsgs = [...messages].reverse();
        const thread = orderedMsgs
          .map((msg: { user?: string; text?: string }) => {
            const name = msg.user ? (userNames[msg.user] || msg.user) : "Unknown";
            return `**${name}**: ${(msg.text ?? "").slice(0, 500)}`;
          })
          .join("\n");

        return Response.json({ body: thread || item.description || "No messages found.", type: "slack" });
      } else {
        return Response.json({ body: item.description || "Could not load Slack messages.", type: "slack" });
      }
    } catch {
      return Response.json({ body: item.description || "Could not load Slack messages.", type: "slack" });
    }
  }

  // --- Calendar / GitHub: return description directly ---
  return Response.json({ body: item.description || "No content available.", type: item.type });
}
