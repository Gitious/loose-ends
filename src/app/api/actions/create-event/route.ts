import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { auth0 } from "@/lib/auth0";
import { checkPermission } from "@/lib/fga";
import { logAction } from "@/lib/audit";
import { requestCIBAApproval } from "@/lib/ciba-direct";
import { extractBody } from "@/lib/gmail-body";
import type { LooseEnd, ProposedEvent } from "@/lib/types";

export const maxDuration = 300; // 5 min — allows time for CIBA approval

export async function POST(req: Request) {
  const session = await auth0.getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const userId = session.user?.sub || session.user?.email || "anonymous";
  const allowed = await checkPermission(userId, "calendar", "can_create");

  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { item, force, proposed, skipCiba } = parsed as {
    item: LooseEnd;
    force?: boolean;
    proposed?: ProposedEvent;
    skipCiba?: boolean;
  };

  if (!allowed) {
    await logAction({
      userId,
      action: "calendar.create_event",
      service: "calendar",
      details: "Permission denied for creating calendar event",
      permitted: false,
      success: false,
    });
    return Response.json(
      { error: "Action not permitted. Enable Calendar Create in Settings." },
      { status: 403 },
    );
  }

  if (!item || typeof item !== "object") {
    return Response.json({ error: "Missing item" }, { status: 400 });
  }

  // Validate item.type
  const validItemTypes = ["email", "calendar", "github", "slack"];
  if (!validItemTypes.includes(item.type)) {
    return Response.json({ error: "Invalid item type" }, { status: 400 });
  }

  let googleToken: string;
  try {
    const result = await auth0.getAccessTokenForConnection({ connection: "google-oauth2" });
    googleToken = result.token;
  } catch {
    return Response.json({ error: "Google not connected" }, { status: 401 });
  }

  // Fetch email body for context
  let emailBody = "";
  if (item.type === "email" && item.meta?.messageId) {
    try {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.meta.messageId}?format=full`,
        { headers: { Authorization: `Bearer ${googleToken}` } },
      );
      if (msgRes.ok) {
        const msgData = await msgRes.json();
        emailBody = extractBody(msgData.payload || {});
        if (emailBody.length > 1500) emailBody = emailBody.slice(0, 1500);
      }
    } catch {}
  }

  const senderName = (item.meta?.from || item.source || "").split("<")[0].trim();
  const senderEmail = (item.meta?.from || item.source || "").match(/<([^>]+)>/)?.[1] || "";
  const subject = item.meta?.subject || item.title || "";
  const now = new Date();

  // Use pre-extracted details if provided (from check-schedule), otherwise AI extract
  const eventDetails = proposed || (await generateObject({
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
  })).object;

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Los_Angeles";
  const startDT = `${eventDetails.date}T${eventDetails.startTime}:00`;
  const endDT = `${eventDetails.date}T${eventDetails.endTime}:00`;

  // Check for conflicts before creating (unless force=true)
  if (!force) {
    try {
      const conflictUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(new Date(startDT).toISOString())}&timeMax=${encodeURIComponent(new Date(endDT).toISOString())}&singleEvents=true&maxResults=5`;
      const conflictRes = await fetch(conflictUrl, {
        headers: { Authorization: `Bearer ${googleToken}` },
      });
      if (conflictRes.ok) {
        const conflictData = await conflictRes.json();
        const conflicts = (conflictData.items || []).filter(
          (e: { summary?: string }) => e.summary // skip empty/cancelled events
        );
        if (conflicts.length > 0) {
          return Response.json({
            conflict: true,
            proposed: {
              summary: eventDetails.summary,
              date: eventDetails.date,
              startTime: eventDetails.startTime,
              endTime: eventDetails.endTime,
              attendees: eventDetails.attendees,
            },
            conflicts: conflicts.map((c: { summary?: string; start?: { dateTime?: string }; end?: { dateTime?: string } }) => ({
              summary: c.summary,
              start: c.start?.dateTime,
              end: c.end?.dateTime,
            })),
          });
        }
      }
    } catch {
      // If conflict check fails, proceed with creation anyway
    }
  }

  // CIBA approval — skip when user explicitly confirmed in-app (skipCiba=true)
  if (!skipCiba) {
    const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9\s+\-_.,:#@]/g, "").trim();
    const bindingMessage = sanitize(
      `Create event: ${eventDetails.summary} on ${eventDetails.date} ${eventDetails.startTime}`
    );

    console.log(`[Create Event] Requesting CIBA approval: ${bindingMessage}`);
    const ciba = await requestCIBAApproval({
      userId,
      bindingMessage,
      timeoutSeconds: 120,
    });

    if (!ciba.approved) {
      await logAction({
        userId,
        action: "calendar.create_event",
        service: "calendar",
        target: eventDetails.summary,
        details: `CIBA denied: ${ciba.error}`,
        permitted: true,
        success: false,
      });
      return Response.json({
        approved: false,
        error: ciba.error || "Action not approved. Check Auth0 Guardian on your phone.",
      });
    }
  }

  // CIBA approved — create the event
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
    "https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all",
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
      action: "calendar.create_event",
      service: "calendar",
      target: subject,
      details: `Failed: ${err.slice(0, 100)}`,
      permitted: true,
      success: false,
    });
    return Response.json({ error: "Failed to create event" }, { status: 500 });
  }

  const created = await calRes.json();

  await logAction({
    userId,
    action: "calendar.create_event",
    service: "calendar",
    target: created.id,
    details: `Created: "${eventDetails.summary}" on ${eventDetails.date} ${eventDetails.startTime}-${eventDetails.endTime}`,
    permitted: true,
    success: true,
  });

  return Response.json({
    success: true,
    event: {
      id: created.id,
      summary: eventDetails.summary,
      date: eventDetails.date,
      startTime: eventDetails.startTime,
      endTime: eventDetails.endTime,
      htmlLink: created.htmlLink,
    },
  });
}
