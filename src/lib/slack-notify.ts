import type { LooseEnd } from "./types";

const SLACK_API = "https://slack.com/api";

/**
 * Send a Slack DM to the authenticated user.
 * Resolves the user's Slack ID via auth.test, opens a DM channel,
 * then posts the message using Block Kit blocks.
 */
export async function sendSlackDM(
  token: string,
  message: string,
  blocks?: unknown[]
): Promise<void> {
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  // 1. Get the authenticated user's Slack ID
  const authRes = await fetch(`${SLACK_API}/auth.test`, { headers });
  if (!authRes.ok) throw new Error(`auth.test failed: ${authRes.status}`);
  const authData = await authRes.json();
  if (!authData.ok) throw new Error(`auth.test error: ${authData.error}`);
  const userId = authData.user_id;

  // 2. Open a DM channel with the user
  const convRes = await fetch(`${SLACK_API}/conversations.open`, {
    method: "POST",
    headers,
    body: JSON.stringify({ users: userId }),
  });
  if (!convRes.ok) throw new Error(`conversations.open failed: ${convRes.status}`);
  const convData = await convRes.json();
  if (!convData.ok) throw new Error(`conversations.open error: ${convData.error}`);
  const channelId = convData.channel.id;

  // 3. Post the message
  const postBody: Record<string, unknown> = {
    channel: channelId,
    text: message,
  };
  if (blocks) {
    postBody.blocks = blocks;
  }

  const postRes = await fetch(`${SLACK_API}/chat.postMessage`, {
    method: "POST",
    headers,
    body: JSON.stringify(postBody),
  });
  if (!postRes.ok) throw new Error(`chat.postMessage failed: ${postRes.status}`);
  const postData = await postRes.json();
  if (!postData.ok) throw new Error(`chat.postMessage error: ${postData.error}`);
}

/**
 * Source icon mapping for Slack mrkdwn.
 */
function sourceIcon(type: LooseEnd["type"]): string {
  switch (type) {
    case "email":
      return ":email:";
    case "calendar":
      return ":calendar:";
    case "github":
      return ":github:";
    case "slack":
      return ":speech_balloon:";
    default:
      return ":pushpin:";
  }
}

/**
 * Format loose ends into a Slack Block Kit message.
 * Returns { text, blocks } for use with sendSlackDM.
 */
export function formatLooseEndsForSlack(
  looseEnds: LooseEnd[],
  junkCount: number
): { text: string; blocks: unknown[] } {
  const red = looseEnds.filter((le) => le.urgency === "red");
  const yellow = looseEnds.filter((le) => le.urgency === "yellow");
  const green = looseEnds.filter((le) => le.urgency === "green");

  const dashboardUrl = process.env.NEXT_PUBLIC_APP_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
    || "http://localhost:3000";

  // Fallback plain text
  const text = `You have ${red.length} urgent loose end${red.length !== 1 ? "s" : ""} that need attention.`;

  // Top 3 urgent items
  const topUrgent = red.slice(0, 3);
  const bulletLines = topUrgent
    .map((le) => `${sourceIcon(le.type)}  *${le.title}* -- ${le.age}`)
    .join("\n");

  const blocks: unknown[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: ":rotating_light: Loose Ends Alert",
        emoji: true,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `You have *${looseEnds.length} loose end${looseEnds.length !== 1 ? "s" : ""}*` +
          (junkCount > 0 ? ` and *${junkCount} junk email${junkCount !== 1 ? "s" : ""}*` : "") +
          " across your accounts.",
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `:red_circle: *${red.length}* Urgent` +
          `  :large_yellow_circle: *${yellow.length}* Needs attention` +
          `  :large_green_circle: *${green.length}* Low priority`,
      },
    },
    { type: "divider" },
  ];

  if (topUrgent.length > 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Top urgent items:*\n${bulletLines}`,
      },
    });
    blocks.push({ type: "divider" });
  }

  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `<${dashboardUrl}|:mag: Open Loose Ends Dashboard>`,
    },
  });

  return { text, blocks };
}
