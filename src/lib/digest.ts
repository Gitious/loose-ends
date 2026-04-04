import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import type { LooseEnd } from "@/lib/types";

/* ────────────────────────────────────────────────────────────
 * 1. Generate a concise daily digest using Haiku
 * ──────────────────────────────────────────────────────────── */

export async function generateDigestContent(
  looseEnds: LooseEnd[],
  junkCount: number,
): Promise<string> {
  const red = looseEnds.filter((le) => le.urgency === "red");
  const yellow = looseEnds.filter((le) => le.urgency === "yellow");
  const green = looseEnds.filter((le) => le.urgency === "green");

  const itemList = looseEnds
    .slice(0, 20)
    .map(
      (le, i) =>
        `${i + 1}. [${le.urgency.toUpperCase()}] [${le.type}] ${le.title} — ${le.description} (${le.age})`,
    )
    .join("\n");

  const { text } = await generateText({
    model: anthropic("claude-haiku-4-5-20251001"),
    prompt: `You are a personal assistant writing a daily email digest.

The user has ${red.length} urgent items, ${yellow.length} attention items, ${green.length} low-priority items, and ${junkCount} junk emails filtered out.

Here are the items:
${itemList}

Write 3-5 bullet points summarizing what the user should focus on today. Be concise, specific, and actionable. Each bullet should be one sentence. Start each bullet with a dash (-). Do not include a greeting or sign-off. Focus on the most important items first.`,
  });

  return text;
}

/* ────────────────────────────────────────────────────────────
 * 2. Build a clean HTML email
 * ──────────────────────────────────────────────────────────── */

export function buildDigestEmail(
  briefing: string,
  userName: string,
  dashboardUrl: string,
  looseEnds: LooseEnd[],
  date: string,
): string {
  const red = looseEnds.filter((le) => le.urgency === "red");
  const yellow = looseEnds.filter((le) => le.urgency === "yellow");
  const green = looseEnds.filter((le) => le.urgency === "green");

  // Convert the bullet points into HTML list items
  const bulletHtml = briefing
    .split("\n")
    .filter((line) => line.trim().startsWith("-"))
    .map((line) => `<li style="margin-bottom:8px;line-height:1.5;">${escapeHtml(line.replace(/^-\s*/, ""))}</li>`)
    .join("\n");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background-color:#0d0d0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0d0d0f;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="padding-bottom:24px;">
              <h1 style="margin:0;font-size:22px;font-weight:700;color:#f5f0e8;letter-spacing:-0.02em;">
                Loose Ends
              </h1>
              <p style="margin:4px 0 0;font-size:13px;color:#8a8780;">
                Daily Digest for ${escapeHtml(date)}
              </p>
            </td>
          </tr>

          <!-- Summary badges -->
          <tr>
            <td style="padding-bottom:24px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  ${red.length > 0 ? `<td style="padding-right:12px;">
                    <span style="display:inline-block;padding:4px 12px;border-radius:20px;background-color:#2d1215;color:#f87171;font-size:12px;font-weight:600;">
                      ${red.length} urgent
                    </span>
                  </td>` : ""}
                  ${yellow.length > 0 ? `<td style="padding-right:12px;">
                    <span style="display:inline-block;padding:4px 12px;border-radius:20px;background-color:#2d2815;color:#fbbf24;font-size:12px;font-weight:600;">
                      ${yellow.length} attention
                    </span>
                  </td>` : ""}
                  ${green.length > 0 ? `<td>
                    <span style="display:inline-block;padding:4px 12px;border-radius:20px;background-color:#152d1a;color:#4ade80;font-size:12px;font-weight:600;">
                      ${green.length} low priority
                    </span>
                  </td>` : ""}
                </tr>
              </table>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="padding-bottom:16px;">
              <p style="margin:0;font-size:15px;color:#f5f0e8;line-height:1.5;">
                Hi ${escapeHtml(userName)}, here is your daily briefing:
              </p>
            </td>
          </tr>

          <!-- Briefing bullets -->
          <tr>
            <td style="padding:20px 24px;background-color:#18181b;border-radius:12px;border:1px solid #27272a;">
              <ul style="margin:0;padding:0 0 0 18px;color:#d4d4d8;font-size:14px;">
                ${bulletHtml}
              </ul>
            </td>
          </tr>

          <!-- Top items table -->
          ${red.length + yellow.length > 0 ? `
          <tr>
            <td style="padding-top:24px;padding-bottom:8px;">
              <p style="margin:0;font-size:13px;font-weight:600;color:#8a8780;text-transform:uppercase;letter-spacing:0.05em;">
                Items needing attention
              </p>
            </td>
          </tr>
          <tr>
            <td>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${[...red, ...yellow].slice(0, 5).map((item) => {
                  const dotColor = item.urgency === "red" ? "#f87171" : "#fbbf24";
                  const typeLabel = item.type === "email" ? "Email" : item.type === "github" ? "GitHub" : item.type === "calendar" ? "Calendar" : "Slack";
                  return `<tr>
                  <td style="padding:10px 0;border-bottom:1px solid #27272a;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="8" style="vertical-align:top;padding-top:6px;">
                          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background-color:${dotColor};"></span>
                        </td>
                        <td style="padding-left:12px;">
                          <p style="margin:0;font-size:14px;color:#f5f0e8;line-height:1.4;">${escapeHtml(item.title)}</p>
                          <p style="margin:2px 0 0;font-size:12px;color:#8a8780;">${escapeHtml(typeLabel)} &middot; ${escapeHtml(item.age)}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>`;
                }).join("\n")}
              </table>
            </td>
          </tr>
          ` : ""}

          <!-- CTA button -->
          <tr>
            <td align="center" style="padding:32px 0;">
              <a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;padding:12px 32px;background-color:#e8a849;color:#0d0d0f;font-size:14px;font-weight:600;text-decoration:none;border-radius:10px;">
                Open Dashboard
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top:16px;border-top:1px solid #27272a;">
              <p style="margin:0;font-size:11px;color:#52525b;line-height:1.5;text-align:center;">
                Sent by Loose Ends. You can send a digest anytime from your dashboard.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/* ────────────────────────────────────────────────────────────
 * 3. Send email via Gmail API
 * ──────────────────────────────────────────────────────────── */

export async function sendDigestEmail(
  token: string,
  to: string,
  from: string,
  html: string,
  subject: string,
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const mimeLines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset="UTF-8"`,
    "",
    html,
  ];

  const raw = Buffer.from(mimeLines.join("\r\n"), "utf-8").toString("base64url");

  const res = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    return { success: false, error: err };
  }

  const data = await res.json();
  return { success: true, messageId: data.id };
}

/* ────────────────────────────────────────────────────────────
 * Helpers
 * ──────────────────────────────────────────────────────────── */

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
