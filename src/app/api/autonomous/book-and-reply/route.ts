import { generateObject, generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { auth0 } from "@/lib/auth0";
import { checkPermission } from "@/lib/fga";
import { requestCIBAApproval } from "@/lib/ciba-direct";
import { logAction } from "@/lib/audit";
import { extractBody } from "@/lib/gmail-body";
import { buildMimeMessage } from "@/lib/gmail-mime";
import type { LooseEnd } from "@/lib/types";

export const maxDuration = 300; // 5 min — allows time for CIBA approval

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

export async function POST(req: Request) {
  // 1. Auth: get session and userId
  const session = await auth0.getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user?.sub || "";
  if (!userId) return Response.json({ error: "No user" }, { status: 401 });

  const userName = session.user?.name || session.user?.nickname || "";
  const userFirstName = userName.split(" ")[0] || "Me";

  // Parse request body
  let item: LooseEnd;
  try {
    const body = await req.json();
    item = body.item;
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!item || typeof item !== "object") {
    return Response.json({ error: "Missing item" }, { status: 400 });
  }

  // Validate item.type
  const validItemTypes = ["email", "calendar", "github", "slack"];
  if (!validItemTypes.includes(item.type)) {
    return Response.json({ error: "Invalid item type" }, { status: 400 });
  }

  // 2. FGA checks: verify BOTH calendar.can_create AND gmail.can_reply
  const [calendarAllowed, gmailAllowed] = await Promise.all([
    checkPermission(userId, "calendar", "can_create"),
    checkPermission(userId, "gmail", "can_reply"),
  ]);

  if (!calendarAllowed || !gmailAllowed) {
    const missing: string[] = [];
    if (!calendarAllowed) missing.push("Calendar Create");
    if (!gmailAllowed) missing.push("Gmail Reply");

    await logAction({
      userId,
      action: "autonomous.book_and_reply",
      service: "system",
      details: `FGA denied: missing ${missing.join(", ")}`,
      permitted: false,
      success: false,
    });

    return Response.json(
      { error: `Permission denied: enable ${missing.join(" and ")} in Agent Permissions` },
      { status: 403 },
    );
  }

  // 3. Get Google token via Auth0 Token Vault
  let googleToken: string;
  try {
    const result = await auth0.getAccessTokenForConnection({ connection: "google-oauth2" });
    googleToken = result.token;
  } catch {
    return Response.json({ error: "Google not connected" }, { status: 401 });
  }

  // 4. Parse sender info from item.meta.from
  const senderName = (item.meta?.from || item.source || "").split("<")[0].trim();
  const senderEmail =
    (item.meta?.from || item.source || "").match(/<([^>]+)>/)?.[1] ||
    item.meta?.from ||
    item.source ||
    "";
  const subject = item.meta?.subject || item.title || "";

  // 5. Fetch email body via Gmail API
  let emailBody = "";
  if (item.type === "email" && item.meta?.messageId) {
    try {
      const msgRes = await fetch(
        `${GMAIL_API}/messages/${item.meta.messageId}?format=full`,
        { headers: { Authorization: `Bearer ${googleToken}` } },
      );
      if (msgRes.ok) {
        const msgData = await msgRes.json();
        emailBody = extractBody(msgData.payload || {});
        if (emailBody.length > 1500) emailBody = emailBody.slice(0, 1500);
      }
    } catch {
      // Proceed without email body
    }
  }

  // 6. AI extraction: use generateObject (Claude Haiku) to extract event details
  const now = new Date();
  const { object: eventDetails } = await generateObject({
    model: anthropic("claude-haiku-4-5-20251001"),
    schema: z.object({
      summary: z.string().describe("Event title — short and clear"),
      date: z.string().describe("ISO date string YYYY-MM-DD"),
      startTime: z.string().describe("Start time in HH:MM (24h format)"),
      endTime: z.string().describe("End time in HH:MM (24h format), default to 1 hour after start"),
      description: z.string().describe("Brief event description"),
      attendees: z.array(z.string()).describe("Email addresses to invite"),
    }),
    prompt: `Extract calendar event details from this email. Today is ${now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}. Current time is ${now.toLocaleTimeString()}.

From: ${senderName} <${senderEmail}>
Subject: ${subject}

${emailBody ? `Email body:\n${emailBody}` : `Description: ${item.description}`}

Instructions:
- Extract the proposed meeting time. "Tomorrow" means ${new Date(now.getTime() + 86400000).toISOString().split("T")[0]}.
- If a specific time is mentioned (e.g. "1pm"), use it. Default duration is 1 hour.
- If no specific time, default to 10:00-11:00.
- Include the sender as an attendee if they have an email address.
- Make the summary concise: "Meeting with [Name]" or use the topic if mentioned.`,
  });

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Los_Angeles";
  const startDT = `${eventDetails.date}T${eventDetails.startTime}:00`;
  const endDT = `${eventDetails.date}T${eventDetails.endTime}:00`;

  // 7. Quick conflict check — if conflicts exist, return early WITHOUT sending CIBA
  try {
    const conflictUrl = `${CALENDAR_API}/calendars/primary/events?timeMin=${encodeURIComponent(new Date(startDT).toISOString())}&timeMax=${encodeURIComponent(new Date(endDT).toISOString())}&singleEvents=true&maxResults=5`;
    const conflictRes = await fetch(conflictUrl, {
      headers: { Authorization: `Bearer ${googleToken}` },
    });
    if (conflictRes.ok) {
      const conflictData = await conflictRes.json();
      const conflicts = (conflictData.items || []).filter(
        (e: { summary?: string }) => e.summary,
      );
      if (conflicts.length > 0) {
        return Response.json({
          conflict: true,
          conflicts: conflicts.map(
            (c: {
              summary?: string;
              start?: { dateTime?: string };
              end?: { dateTime?: string };
            }) => ({
              summary: c.summary,
              start: c.start?.dateTime,
              end: c.end?.dateTime,
            }),
          ),
        });
      }
    }
  } catch {
    // If conflict check fails, proceed anyway
  }

  // 8. Generate reply text: use generateText (Claude Haiku) for a meeting confirmation reply
  const { text: replyText } = await generateText({
    model: anthropic("claude-haiku-4-5-20251001"),
    prompt: `You are helping a user write an email reply to confirm a meeting.

From: ${senderName} <${senderEmail}>
Subject: ${subject}

${emailBody ? `Email body:\n${emailBody}` : `Description: ${item.description}`}

Meeting being booked:
- Title: ${eventDetails.summary}
- Date: ${eventDetails.date}
- Time: ${eventDetails.startTime} to ${eventDetails.endTime}

User's name: ${userFirstName}

Instructions:
- Write a brief, professional reply confirming the meeting time.
- Mention the specific date and time being confirmed.
- Keep it concise and friendly.
- Start with an appropriate greeting using the sender's name.
- Sign off with just the user's first name: ${userFirstName}`,
  });

  // 9. CIBA approval: build binding message and request approval
  const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9\s+\-_.,:#@]/g, "").trim();

  // Keep under 64 chars: "Book [summary] [date] [time] and reply to [sender]"
  const shortSummary = eventDetails.summary.length > 15
    ? eventDetails.summary.slice(0, 15).trim()
    : eventDetails.summary;
  const shortSender = senderName.length > 10
    ? senderName.slice(0, 10).trim()
    : senderName;
  const rawMessage = `Book ${shortSummary} ${eventDetails.date} ${eventDetails.startTime} and reply to ${shortSender}`;
  const bindingMessage = sanitize(
    rawMessage.length > 64 ? rawMessage.slice(0, 64) : rawMessage,
  );

  console.log(`[Autonomous] Requesting CIBA approval: ${bindingMessage}`);

  const ciba = await requestCIBAApproval({
    userId,
    bindingMessage,
    timeoutSeconds: 120,
  });

  // 11. If denied: audit log and return
  if (!ciba.approved) {
    await logAction({
      userId,
      action: "autonomous.book_and_reply",
      service: "system",
      details: `CIBA denied: ${ciba.error}`,
      permitted: true,
      success: false,
    });
    return Response.json({
      approved: false,
      error: ciba.error || "Action not approved. Check Auth0 Guardian on your phone.",
    });
  }

  // 10. If approved: create the calendar event AND send the email reply
  console.log(`[Autonomous] CIBA approved, booking event and sending reply`);

  try {
    // --- Create Google Calendar event ---
    const event = {
      summary: eventDetails.summary,
      description: eventDetails.description,
      start: { dateTime: startDT, timeZone },
      end: { dateTime: endDT, timeZone },
      attendees: eventDetails.attendees
        .filter((e) => e && e.includes("@"))
        .map((email) => ({ email })),
    };

    const calRes = await fetch(
      `${CALENDAR_API}/calendars/primary/events?sendUpdates=all`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${googleToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(event),
      },
    );

    if (!calRes.ok) {
      const err = await calRes.text();
      await logAction({
        userId,
        action: "autonomous.book_and_reply",
        service: "calendar",
        target: eventDetails.summary,
        details: `Calendar create failed: ${err.slice(0, 100)}`,
        permitted: true,
        success: false,
      });
      return Response.json(
        { approved: true, success: false, error: `Failed to create event: ${err}` },
        { status: 500 },
      );
    }

    const created = await calRes.json();

    await logAction({
      userId,
      action: "autonomous.book_event",
      service: "calendar",
      target: created.id,
      details: `Created: "${eventDetails.summary}" on ${eventDetails.date} ${eventDetails.startTime}-${eventDetails.endTime}`,
      permitted: true,
      success: true,
    });

    // --- Send email reply via Gmail API ---
    // Get the user's email address for the From header
    const profileRes = await fetch(`${GMAIL_API}/profile`, {
      headers: { Authorization: `Bearer ${googleToken}` },
    });
    const profile = await profileRes.json();
    const fromEmail = profile.emailAddress || session.user.email || "";

    const mimeResult = buildMimeMessage({
      to: senderEmail,
      from: fromEmail,
      subject,
      body: replyText,
      inReplyTo: item.meta?.rfcMessageId,
      references: item.meta?.rfcMessageId,
    });

    const sendRes = await fetch(`${GMAIL_API}/messages/send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${googleToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        raw: mimeResult.raw,
        threadId: item.meta?.threadId,
      }),
    });

    if (!sendRes.ok) {
      const err = await sendRes.text();
      await logAction({
        userId,
        action: "autonomous.send_reply",
        service: "gmail",
        target: item.meta?.messageId,
        details: `Reply send failed: ${err.slice(0, 100)}`,
        permitted: true,
        success: false,
      });
      // Event was created but reply failed — still report partial success
      return Response.json({
        approved: true,
        success: true,
        event: {
          id: created.id,
          summary: eventDetails.summary,
          date: eventDetails.date,
          htmlLink: created.htmlLink,
        },
        replySent: false,
        replyError: `Failed to send reply: ${err.slice(0, 100)}`,
      });
    }

    await logAction({
      userId,
      action: "autonomous.send_reply",
      service: "gmail",
      target: item.meta?.messageId,
      details: `Reply sent to ${senderEmail} confirming meeting`,
      permitted: true,
      success: true,
    });

    return Response.json({
      approved: true,
      success: true,
      event: {
        id: created.id,
        summary: eventDetails.summary,
        date: eventDetails.date,
        htmlLink: created.htmlLink,
      },
      replySent: true,
    });
  } catch (err: any) {
    await logAction({
      userId,
      action: "autonomous.book_and_reply",
      service: "system",
      details: `Unexpected error: ${err?.message}`,
      permitted: true,
      success: false,
    });
    return Response.json(
      { approved: true, success: false, error: err?.message },
      { status: 500 },
    );
  }
}
